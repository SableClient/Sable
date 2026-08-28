use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::ipc::Response;
use tauri::{AppHandle, Runtime};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShareItem {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mime: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareBatch {
    pub batch_id: String,
    pub items: Vec<ShareItem>,
}

#[derive(Deserialize)]
struct ShareManifest {
    #[allow(dead_code)]
    version: u32,
    items: Vec<ShareItem>,
}

fn validate_component(value: &str) -> Result<(), String> {
    if value.is_empty() || value == "." || value == ".." || value.contains(['/', '\\', '\0']) {
        return Err(format!("invalid path component: {value:?}"));
    }
    Ok(())
}

fn parse_manifest(json: &str) -> Result<Vec<ShareItem>, String> {
    let manifest: ShareManifest = serde_json::from_str(json).map_err(|err| err.to_string())?;
    Ok(manifest.items)
}

#[cfg(target_os = "ios")]
fn inbox_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    use objc2_foundation::{NSFileManager, NSString};

    let group = format!("group.{}", app.config().identifier);
    let url = NSFileManager::defaultManager()
        .containerURLForSecurityApplicationGroupIdentifier(&NSString::from_str(&group))
        .ok_or_else(|| format!("app group container not available: {group}"))?;
    let path = url
        .path()
        .ok_or_else(|| "app group container has no filesystem path".to_owned())?;
    Ok(PathBuf::from(path.to_string()).join("share_inbox"))
}

#[cfg(not(target_os = "ios"))]
fn inbox_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    use tauri::Manager;

    Ok(app
        .path()
        .app_data_dir()
        .map_err(|err| err.to_string())?
        .join("share_inbox"))
}

#[tauri::command]
pub fn share_inbox_drain<R: Runtime>(app: AppHandle<R>) -> Result<Vec<ShareBatch>, String> {
    let root = inbox_root(&app)?;
    let entries = match std::fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(err.to_string()),
    };

    let mut batches = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(batch_id) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let manifest = std::fs::read_to_string(path.join("share.json"))
            .map_err(|err| err.to_string())
            .and_then(|json| parse_manifest(&json));
        match manifest {
            Ok(items) => batches.push(ShareBatch {
                batch_id: batch_id.to_owned(),
                items,
            }),
            Err(err) => {
                log::warn!("dropping unreadable share batch {batch_id}: {err}");
                let _ = std::fs::remove_dir_all(&path);
            }
        }
    }
    batches.sort_by(|a, b| a.batch_id.cmp(&b.batch_id));
    Ok(batches)
}

#[tauri::command]
pub fn share_inbox_read<R: Runtime>(
    app: AppHandle<R>,
    batch_id: String,
    file_name: String,
) -> Result<Response, String> {
    validate_component(&batch_id)?;
    validate_component(&file_name)?;
    let root = inbox_root(&app)?;
    let path = root.join(&batch_id).join(&file_name);
    let canonical = path.canonicalize().map_err(|err| err.to_string())?;
    let canonical_root = root.canonicalize().map_err(|err| err.to_string())?;
    if !canonical.starts_with(&canonical_root) {
        return Err("path escapes share inbox".to_owned());
    }
    std::fs::read(&canonical)
        .map(Response::new)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn share_inbox_clear<R: Runtime>(app: AppHandle<R>, batch_id: String) -> Result<(), String> {
    validate_component(&batch_id)?;
    let root = inbox_root(&app)?;
    match std::fs::remove_dir_all(root.join(&batch_id)) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_component_rejects_traversal() {
        assert!(validate_component("..").is_err());
        assert!(validate_component(".").is_err());
        assert!(validate_component("").is_err());
        assert!(validate_component("a/b").is_err());
        assert!(validate_component("a\\b").is_err());
        assert!(validate_component("a\0b").is_err());
        assert!(validate_component("1752-abc").is_ok());
        assert!(validate_component("image-0.jpg").is_ok());
    }

    #[test]
    fn parse_manifest_reads_items() {
        let items = parse_manifest(
            r#"{"version":1,"items":[
                {"kind":"text","text":"hello"},
                {"kind":"url","text":"https://example.com"},
                {"kind":"file","fileName":"image-0.jpg","mime":"image/jpeg"}
            ]}"#,
        )
        .unwrap();
        assert_eq!(items.len(), 3);
        assert_eq!(items[0].kind, "text");
        assert_eq!(items[1].text.as_deref(), Some("https://example.com"));
        assert_eq!(items[2].file_name.as_deref(), Some("image-0.jpg"));
        assert_eq!(items[2].mime.as_deref(), Some("image/jpeg"));
    }

    #[test]
    fn parse_manifest_rejects_garbage() {
        assert!(parse_manifest("not json").is_err());
        assert!(parse_manifest(r#"{"version":1}"#).is_err());
    }
}
