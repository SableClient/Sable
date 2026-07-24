use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn save_download(
    app: AppHandle<crate::BrowserEngine>,
    filename: String,
    bytes: Vec<u8>,
) -> Result<bool, String> {
    let Some(path) = app
        .dialog()
        .file()
        .set_file_name(&filename)
        .blocking_save_file()
    else {
        return Ok(false);
    };

    let path = path.into_path().map_err(|err| err.to_string())?;
    std::fs::write(&path, &bytes).map_err(|err| err.to_string())?;
    Ok(true)
}
