use std::io;
use std::path::Path;

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

const DEFAULT_ARCHIVE_NAME: &str = "sable-diagnostics.zip";

#[tauri::command]
pub async fn export_diagnostics(
    app: AppHandle<crate::BrowserEngine>,
    frontend_logs: Option<String>,
) -> Result<Option<String>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(DEFAULT_ARCHIVE_NAME)
        .add_filter("ZIP archive", &["zip"])
        .save_file(move |path| {
            let _ = sender.send(path);
        });

    let Some(path) = receiver
        .await
        .map_err(|error| format!("Save dialog did not return a result: {error}"))?
    else {
        return Ok(None);
    };

    let archive_path = path.into_path().map_err(|err| err.to_string())?;
    validate_zip_extension(&archive_path).map_err(|err| err.to_string())?;
    let log_dir = app.path().app_log_dir().map_err(|err| err.to_string())?;
    let system_info = crate::diagnostics::system_info(
        &app.package_info().version.to_string(),
        std::env::consts::OS,
        std::env::consts::ARCH,
    );
    crate::diagnostics::create_archive(
        &archive_path,
        &log_dir,
        &system_info,
        frontend_logs.as_deref(),
    )
    .map_err(|error| error.to_string())?;

    Ok(Some(format!(
        "Diagnostics exported to {}",
        archive_path.display()
    )))
}

fn validate_zip_extension(path: &Path) -> io::Result<()> {
    let is_zip = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"));
    if !is_zip {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Diagnostics destination must have a .zip extension",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_zip_extension;
    use std::path::Path;

    #[test]
    fn zip_extension_is_required() {
        assert!(validate_zip_extension(Path::new("support.zip")).is_ok());
        assert!(validate_zip_extension(Path::new("support.ZIP")).is_ok());
        let error = validate_zip_extension(Path::new("support.tar")).unwrap_err();
        assert_eq!(
            error.to_string(),
            "Diagnostics destination must have a .zip extension"
        );
    }
}
