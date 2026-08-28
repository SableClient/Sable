use std::fs::{self, File};
#[cfg(any(target_os = "android", target_os = "ios", test))]
use std::io::Cursor;
use std::io::{self, Seek, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use regex::Regex;
use serde_json::{Map, Value};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

const MAX_LOG_FILES: usize = 6;

pub(crate) fn system_info(version: &str, os: &str, architecture: &str) -> String {
    format!("Sable diagnostics\nApp version: {version}\nOS: {os}\nArchitecture: {architecture}\n")
}

fn sensitive_paths() -> Vec<PathBuf> {
    let mut paths = vec![std::env::temp_dir()];
    for variable in ["HOME", "USERPROFILE"] {
        if let Some(path) = std::env::var_os(variable).map(PathBuf::from) {
            paths.push(path);
        }
    }
    paths
}

fn replace_pattern(text: String, pattern: &str, replacement: &str) -> String {
    Regex::new(pattern)
        .expect("diagnostics redaction pattern must be valid")
        .replace_all(&text, replacement)
        .into_owned()
}

fn redact_text_with_paths(text: &str, paths: &[PathBuf]) -> String {
    let mut sanitized = replace_pattern(
        text.to_owned(),
        r#"(?i)\b[a-z][a-z0-9+.-]{1,15}://[^\s<>\"']+"#,
        "[REDACTED_URL]",
    );
    sanitized = replace_pattern(
        sanitized,
        r#"(?i)\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+"#,
        "[REDACTED_CREDENTIAL]",
    );
    sanitized = replace_pattern(
        sanitized,
        r#"(?i)([\"']?(?:authorization|proxy[-_]?authorization|cookie|set[-_]?cookie|access[-_]?token|refresh[-_]?token|id[-_]?token|x[-_]?auth[-_]?token|x[-_]?access[-_]?token|api[-_]?key|client[-_]?secret|password|passwd|secret|credential|token)[\"']?\s*[:=]\s*)(?:\"[^\"]*\"|'[^']*'|[^\s,;}\]]+)"#,
        "$1[REDACTED]",
    );
    sanitized = replace_pattern(
        sanitized,
        r#"@[A-Za-z0-9._=/\\-]+:(?:\[[0-9A-Fa-f:]+\]|[A-Za-z0-9.-]+)(?::[0-9]+)?"#,
        "[REDACTED_MATRIX_USER_ID]",
    );
    sanitized = replace_pattern(
        sanitized,
        r#"[!#][A-Za-z0-9._=/\\-]+:(?:\[[0-9A-Fa-f:]+\]|[A-Za-z0-9.-]+)(?::[0-9]+)?"#,
        "[REDACTED_MATRIX_ROOM_ID]",
    );
    sanitized = replace_pattern(
        sanitized,
        r#"\$[A-Za-z0-9._~=/\\-]+(?::(?:\[[0-9A-Fa-f:]+\]|[A-Za-z0-9.-]+)(?::[0-9]+)?)?"#,
        "[REDACTED_MATRIX_EVENT_ID]",
    );
    let mut path_strings = paths
        .iter()
        .filter(|path| path.is_absolute())
        .map(|path| path.to_string_lossy().into_owned())
        .filter(|path| path.len() > 1)
        .collect::<Vec<_>>();
    path_strings.sort_by_key(|path| std::cmp::Reverse(path.len()));
    for path in path_strings {
        sanitized = sanitized.replace(&path, "[REDACTED_PATH]");
    }
    sanitized
}

fn redact_text(text: &str) -> String {
    redact_text_with_paths(text, &sensitive_paths())
}

fn is_sensitive_json_key(key: &str) -> bool {
    let normalized = key
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect::<String>();
    matches!(
        normalized.as_str(),
        "authorization"
            | "proxyauthorization"
            | "cookie"
            | "setcookie"
            | "token"
            | "accesstoken"
            | "refreshtoken"
            | "idtoken"
            | "xauthtoken"
            | "xaccesstoken"
            | "apikey"
            | "clientsecret"
            | "password"
            | "passwd"
            | "secret"
            | "credential"
            | "credentials"
            | "deviceid"
            | "sessionid"
    ) || normalized.ends_with("token")
        || normalized.ends_with("secret")
        || normalized.ends_with("password")
}

fn sanitize_headers(value: &Value, paths: &[PathBuf]) -> Value {
    match value {
        Value::Object(headers) => Value::Object(
            headers
                .keys()
                .map(|key| (key.clone(), Value::String("[REDACTED]".into())))
                .collect(),
        ),
        Value::Array(headers) => Value::Array(
            headers
                .iter()
                .map(|header| match header {
                    Value::Array(pair) if pair.len() >= 2 => Value::Array(vec![
                        Value::String(redact_text_with_paths(
                            pair.first().and_then(Value::as_str).unwrap_or("header"),
                            paths,
                        )),
                        Value::String("[REDACTED]".into()),
                    ]),
                    _ => sanitize_json_value(header, paths).unwrap_or(Value::Null),
                })
                .collect(),
        ),
        _ => sanitize_json_value(value, paths).unwrap_or(Value::Null),
    }
}

fn sanitize_json_value(value: &Value, paths: &[PathBuf]) -> Option<Value> {
    match value {
        Value::Object(object) => {
            let mut sanitized = Map::new();
            for (key, value) in object {
                if key.eq_ignore_ascii_case("data") {
                    continue;
                }
                let value = if key.eq_ignore_ascii_case("headers") {
                    sanitize_headers(value, paths)
                } else if is_sensitive_json_key(key) {
                    Value::String("[REDACTED]".into())
                } else {
                    sanitize_json_value(value, paths)?
                };
                sanitized.insert(key.clone(), value);
            }
            Some(Value::Object(sanitized))
        }
        Value::Array(array) => Some(Value::Array(
            array
                .iter()
                .filter_map(|value| sanitize_json_value(value, paths))
                .collect(),
        )),
        Value::String(string) => Some(Value::String(redact_text_with_paths(string, paths))),
        Value::Null | Value::Bool(_) | Value::Number(_) => Some(value.clone()),
    }
}

fn sanitized_frontend_logs(serialized: &str) -> Option<String> {
    let value = serde_json::from_str::<Value>(serialized).ok()?;
    if value.is_null() {
        return None;
    }
    let sanitized = sanitize_json_value(&value, &sensitive_paths())?;
    serde_json::to_string_pretty(&sanitized).ok()
}

fn recent_log_files(log_dir: Option<&Path>) -> io::Result<Vec<PathBuf>> {
    let Some(log_dir) = log_dir else {
        return Ok(Vec::new());
    };
    if !log_dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut files = fs::read_dir(log_dir)?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            if !file_type.is_file()
                || entry
                    .path()
                    .extension()
                    .and_then(|extension| extension.to_str())
                    != Some("log")
            {
                return None;
            }
            Some(entry.path())
        })
        .collect::<Vec<_>>();
    files.sort_by(|left, right| {
        let left_modified = fs::metadata(left)
            .and_then(|metadata| metadata.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        let right_modified = fs::metadata(right)
            .and_then(|metadata| metadata.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        right_modified
            .cmp(&left_modified)
            .then_with(|| left.file_name().cmp(&right.file_name()))
    });
    files.truncate(MAX_LOG_FILES);
    Ok(files)
}

fn write_archive<W: Write + Seek>(
    output: W,
    log_dir: Option<&Path>,
    system_info: &str,
    frontend_logs: Option<String>,
) -> io::Result<W> {
    let mut writer = ZipWriter::new(output);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for log_path in recent_log_files(log_dir)? {
        let Some(file_name) = log_path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let Ok(log_contents) = fs::read_to_string(&log_path) else {
            continue;
        };
        writer
            .start_file(format!("logs/{file_name}"), options)
            .map_err(io::Error::other)?;
        writer.write_all(redact_text(&log_contents).as_bytes())?;
    }
    writer
        .start_file("system-info.txt", options)
        .map_err(io::Error::other)?;
    writer.write_all(system_info.as_bytes())?;
    if let Some(frontend_logs) = frontend_logs {
        writer
            .start_file("logs/frontend-debug-logs.json", options)
            .map_err(io::Error::other)?;
        writer.write_all(frontend_logs.as_bytes())?;
    }
    writer.finish().map_err(io::Error::other)
}

#[cfg(any(target_os = "android", target_os = "ios", test))]
pub(crate) fn build_archive(
    log_dir: Option<&Path>,
    system_info: &str,
    frontend_logs: Option<&str>,
) -> io::Result<Vec<u8>> {
    let output = write_archive(
        Cursor::new(Vec::new()),
        log_dir,
        system_info,
        frontend_logs.and_then(sanitized_frontend_logs),
    )?;
    Ok(output.into_inner())
}

pub(crate) fn create_archive(
    archive_path: &Path,
    log_dir: &Path,
    system_info: &str,
    frontend_logs: Option<&str>,
) -> io::Result<()> {
    let file_name = archive_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Invalid archive filename"))?;
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(io::Error::other)?
        .as_nanos();
    let temporary_path = archive_path.with_file_name(format!(
        ".{file_name}.{}.{}.tmp",
        std::process::id(),
        suffix
    ));
    let result = (|| {
        let file = File::create(&temporary_path)?;
        write_archive(
            file,
            Some(log_dir),
            system_info,
            frontend_logs.and_then(sanitized_frontend_logs),
        )?;
        fs::rename(&temporary_path, archive_path)
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{build_archive, create_archive, system_info};
    use serde_json::json;
    use std::fs::{self, File};
    use std::io::Read;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TemporaryDirectory(PathBuf);
    impl Drop for TemporaryDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn temporary_directory() -> TemporaryDirectory {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time must be after the Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "sable-diagnostics-test-{}-{suffix}",
            std::process::id()
        ));
        fs::create_dir(&path).expect("temporary diagnostics directory should be creatable");
        TemporaryDirectory(path)
    }

    #[test]
    fn mobile_archive_contains_system_info_without_native_logs() {
        let bytes = build_archive(None, &system_info("1.2.3", "android", "aarch64"), None)
            .expect("diagnostics archive should be created");
        let mut archive =
            zip::ZipArchive::new(std::io::Cursor::new(bytes)).expect("archive should be valid ZIP");
        let mut info = String::new();
        archive
            .by_name("system-info.txt")
            .expect("system info should be archived")
            .read_to_string(&mut info)
            .expect("system info should be readable");
        assert_eq!(
            info,
            "Sable diagnostics\nApp version: 1.2.3\nOS: android\nArchitecture: aarch64\n"
        );
        assert!(archive.by_name("logs/frontend-debug-logs.json").is_err());
    }

    #[test]
    fn archive_sanitizes_frontend_logs() {
        let logs = serde_json::to_string(&json!([{
            "message": "accessToken=frontend-token https://example.org/path",
            "data": { "secret": "must not be included" },
            "headers": { "authorization": "header-secret" }
        }]))
        .expect("frontend logs should serialize");
        let bytes = build_archive(None, "Sable diagnostics\n", Some(&logs))
            .expect("diagnostics archive should be created");
        let mut archive =
            zip::ZipArchive::new(std::io::Cursor::new(bytes)).expect("archive should be valid ZIP");
        let mut sanitized = String::new();
        archive
            .by_name("logs/frontend-debug-logs.json")
            .expect("frontend logs should be archived")
            .read_to_string(&mut sanitized)
            .expect("frontend logs should be readable");
        assert!(!sanitized.contains("frontend-token"));
        assert!(!sanitized.contains("https://example.org"));
        assert!(!sanitized.contains("must not be included"));
        assert!(!sanitized.contains("header-secret"));
    }

    #[test]
    fn desktop_archive_includes_sanitized_native_logs() {
        let directory = temporary_directory();
        let archive_path = directory.0.join("diagnostics.zip");
        fs::write(
            directory.0.join("sable.log"),
            "token=native-token https://example.org/path\n",
        )
        .expect("native log should be writable");
        create_archive(&archive_path, &directory.0, "Sable diagnostics\n", None)
            .expect("diagnostics archive should be created");
        let mut archive =
            zip::ZipArchive::new(File::open(archive_path).expect("archive should open"))
                .expect("archive should be valid ZIP");
        let mut log = String::new();
        archive
            .by_name("logs/sable.log")
            .expect("native log should be archived")
            .read_to_string(&mut log)
            .expect("native log should be readable");
        assert!(!log.contains("native-token"));
        assert!(!log.contains("https://example.org"));
    }
}
