use tauri::{AppHandle, Manager};

#[tauri::command(rename = "export_diagnostics")]
pub fn build_diagnostics_archive(
    app: AppHandle<crate::BrowserEngine>,
    frontend_logs: Option<String>,
) -> Result<Vec<u8>, String> {
    let log_dir = app.path().app_log_dir().ok();
    let system_info = crate::diagnostics::system_info(
        &app.package_info().version.to_string(),
        std::env::consts::OS,
        std::env::consts::ARCH,
    );
    crate::diagnostics::build_archive(log_dir.as_deref(), &system_info, frontend_logs.as_deref())
        .map_err(|error| error.to_string())
}
