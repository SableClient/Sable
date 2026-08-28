use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{LazyLock, Mutex},
    time::Duration,
};

use base64::Engine;
use futures_util::StreamExt;
use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, Manager, Runtime};
use tauri_plugin_http::reqwest::{
    header::{AUTHORIZATION, CONTENT_LENGTH, CONTENT_TYPE},
    Body, Client, ClientBuilder, Method, Url,
};
use tokio::{
    fs::{File, OpenOptions},
    io::AsyncWriteExt,
    sync::watch,
};
use tokio_util::codec::{BytesCodec, FramedRead};

const UPLOAD_SUBDIR: &str = "native-uploads";

static UPLOAD_ABORT_SENDERS: LazyLock<Mutex<HashMap<String, watch::Sender<bool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

static UPLOAD_CLIENT: LazyLock<Client> = LazyLock::new(|| {
    ClientBuilder::new()
        .no_proxy()
        .connect_timeout(Duration::from_secs(15))
        .build()
        .expect("failed to build native upload client")
});

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUploadResponse {
    status: u16,
    body: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    loaded: u64,
    total: u64,
}

fn upload_temp_path<R: Runtime>(app: &AppHandle<R>, request_id: &str) -> Result<PathBuf, String> {
    if request_id.is_empty()
        || !request_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("invalid upload id".into());
    }
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|err| err.to_string())?
        .join(UPLOAD_SUBDIR);
    Ok(dir.join(request_id))
}

/// Drop leftover upload temp files from a session that ended without running
/// the normal cleanup (crash, OS kill, ...). No upload can be in flight yet at
/// startup, so removing the whole subdir is safe; it is recreated on demand by
/// `upload_write_chunk`.
pub fn cleanup_uploads<R: Runtime>(app: &AppHandle<R>) {
    let Ok(dir) = app.path().app_cache_dir() else {
        return;
    };
    let _ = std::fs::remove_dir_all(dir.join(UPLOAD_SUBDIR));
}

fn register_abort_sender(request_id: &str) -> watch::Receiver<bool> {
    let (sender, receiver) = watch::channel(false);
    UPLOAD_ABORT_SENDERS
        .lock()
        .expect("upload abort senders poisoned")
        .insert(request_id.to_owned(), sender);
    receiver
}

fn remove_abort_sender(request_id: &str) {
    UPLOAD_ABORT_SENDERS
        .lock()
        .expect("upload abort senders poisoned")
        .remove(request_id);
}

async fn wait_for_abort_signal(receiver: &mut watch::Receiver<bool>) {
    if *receiver.borrow() {
        return;
    }
    while receiver.changed().await.is_ok() {
        if *receiver.borrow() {
            return;
        }
    }
    std::future::pending::<()>().await;
}

/// Base64 rather than raw bytes because Android has no `InvokeBody::Raw`: a
/// `Uint8Array` degrades to a JSON `number[]` there and OOM-kills the renderer.
#[tauri::command]
pub async fn upload_write_chunk<R: Runtime>(
    app: AppHandle<R>,
    request_id: String,
    chunk: String,
) -> Result<(), String> {
    let path = upload_temp_path(&app, &request_id)?;
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|err| err.to_string())?;
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(chunk.as_bytes())
        .map_err(|err| err.to_string())?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .await
        .map_err(|err| err.to_string())?;
    file.write_all(&bytes)
        .await
        .map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn abort_native_upload<R: Runtime>(app: AppHandle<R>, request_id: String) {
    if let Some(sender) = UPLOAD_ABORT_SENDERS
        .lock()
        .expect("upload abort senders poisoned")
        .remove(&request_id)
    {
        let _ = sender.send(true);
    }
    if let Ok(path) = upload_temp_path(&app, &request_id) {
        let _ = tokio::fs::remove_file(path).await;
    }
}

#[tauri::command]
pub async fn native_upload<R: Runtime>(
    app: AppHandle<R>,
    request_id: String,
    url: String,
    content_type: String,
    authorization: Option<String>,
    on_progress: Channel<ProgressPayload>,
) -> Result<NativeUploadResponse, String> {
    let path = upload_temp_path(&app, &request_id)?;
    let result = run_upload(
        &path,
        url,
        content_type,
        authorization,
        &request_id,
        on_progress,
    )
    .await;
    let _ = tokio::fs::remove_file(&path).await;
    remove_abort_sender(&request_id);
    result
}

async fn run_upload(
    path: &PathBuf,
    url: String,
    content_type: String,
    authorization: Option<String>,
    request_id: &str,
    on_progress: Channel<ProgressPayload>,
) -> Result<NativeUploadResponse, String> {
    let url = Url::parse(url.trim()).map_err(|err| err.to_string())?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("native_upload only allows http(s) URLs".into());
    }

    // Registered before any awaiting work so an abort arriving during setup is not missed.
    let mut abort_receiver = register_abort_sender(request_id);

    let file = File::open(path)
        .await
        .map_err(|_| "no upload data for this request".to_string())?;
    let total = file.metadata().await.map_err(|err| err.to_string())?.len();

    let progress_stream = async_stream::stream! {
        let mut reader = FramedRead::new(file, BytesCodec::new());
        let mut loaded: u64 = 0;
        let mut last_emitted_loaded: u64 = 0;
        while let Some(item) = reader.next().await {
            match item {
                Ok(chunk) => {
                    loaded += chunk.len() as u64;
                    if loaded - last_emitted_loaded >= 256 * 1024 || loaded == total {
                        let _ = on_progress.send(ProgressPayload { loaded, total });
                        last_emitted_loaded = loaded;
                    }
                    yield Ok::<_, std::io::Error>(chunk.freeze());
                }
                Err(err) => yield Err(err),
            }
        }
    };

    let mut builder = UPLOAD_CLIENT
        .request(Method::POST, url)
        .header(CONTENT_TYPE, content_type)
        .header(CONTENT_LENGTH, total)
        .body(Body::wrap_stream(progress_stream));
    if let Some(auth) = authorization {
        builder = builder.header(AUTHORIZATION, auth);
    }

    let response = tokio::select! {
        response = builder.send() => response.map_err(|err| err.to_string())?,
        _ = wait_for_abort_signal(&mut abort_receiver) => return Err("Upload aborted".into()),
    };
    let status = response.status().as_u16();
    let body = tokio::select! {
        body = response.text() => body.map_err(|err| err.to_string())?,
        _ = wait_for_abort_signal(&mut abort_receiver) => return Err("Upload aborted".into()),
    };

    Ok(NativeUploadResponse { status, body })
}
