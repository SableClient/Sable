use std::path::PathBuf;

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

async fn ask_save_path(
    app: &AppHandle<crate::BrowserEngine>,
    filename: &str,
) -> Result<Option<PathBuf>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(filename)
        .save_file(move |path| {
            let _ = sender.send(path);
        });

    let Some(path) = receiver
        .await
        .map_err(|error| format!("Save dialog did not return a result: {error}"))?
    else {
        return Ok(None);
    };

    path.into_path().map(Some).map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn save_media_download(
    app: AppHandle<crate::BrowserEngine>,
    url: String,
    filename: String,
) -> Result<bool, String> {
    let Some(path) = ask_save_path(&app, &filename).await? else {
        return Ok(false);
    };

    crate::network::media_protocol::copy_media_to_file(&app, &url, &path).await?;
    Ok(true)
}

#[tauri::command]
pub async fn save_download(
    app: AppHandle<crate::BrowserEngine>,
    filename: String,
    bytes: Vec<u8>,
) -> Result<bool, String> {
    let Some(path) = ask_save_path(&app, &filename).await? else {
        return Ok(false);
    };

    std::fs::write(&path, &bytes).map_err(|err| err.to_string())?;
    Ok(true)
}
