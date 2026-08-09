use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn save_download(
    app: AppHandle<crate::BrowserEngine>,
    filename: String,
    bytes: Vec<u8>,
) -> Result<bool, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(&filename)
        .save_file(move |path| {
            let _ = sender.send(path);
        });

    let Some(path) = receiver
        .await
        .map_err(|error| format!("Save dialog did not return a result: {error}"))?
    else {
        return Ok(false);
    };

    let path = path.into_path().map_err(|err| err.to_string())?;
    std::fs::write(&path, &bytes).map_err(|err| err.to_string())?;
    Ok(true)
}
