use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use tauri_plugin_http::reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Client, ClientBuilder, Method, Url,
};
use tokio::sync::watch;

/// Generous on purpose: it must never fire on a healthy but slow transfer.
const BODY_IDLE_TIMEOUT: Duration = Duration::from_secs(120);

static FETCH_ABORT_SENDERS: LazyLock<Mutex<HashMap<String, watch::Sender<bool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// No overall request timeout: sliding sync long-polls for up to the server's timeout, so the
/// caller's abort signal is the only correct deadline. `read_timeout` is an inactivity deadline on
/// the body only (it starts after the response headers arrive), so it bounds a transfer that dies
/// mid-body without capping how long a long-poll may wait for its first byte.
static FETCH_CLIENT: LazyLock<Client> = LazyLock::new(|| {
    ClientBuilder::new()
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(BODY_IDLE_TIMEOUT)
        .gzip(true)
        .brotli(true)
        .build()
        .expect("failed to build native fetch client")
});

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeFetchRequest {
    request_id: String,
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Option<Vec<u8>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFetchMeta {
    status: u16,
    status_text: String,
    url: String,
    headers: Vec<(String, String)>,
}

fn validate_url(url: &str) -> Result<Url, String> {
    let parsed = Url::parse(url.trim()).map_err(|err| err.to_string())?;

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("native_fetch only allows http:// or https:// URLs".into());
    }

    Ok(parsed)
}

fn build_headers(headers: Vec<(String, String)>) -> Result<HeaderMap, String> {
    let mut header_map = HeaderMap::new();

    for (name, value) in headers {
        let header_name = HeaderName::from_bytes(name.as_bytes()).map_err(|err| err.to_string())?;
        let header_value = HeaderValue::from_str(&value).map_err(|err| err.to_string())?;
        header_map.append(header_name, header_value);
    }

    Ok(header_map)
}

fn register_abort_sender(request_id: &str) -> watch::Receiver<bool> {
    let (sender, receiver) = watch::channel(false);
    FETCH_ABORT_SENDERS
        .lock()
        .expect("native fetch abort senders poisoned")
        .insert(request_id.to_owned(), sender);
    receiver
}

fn remove_abort_sender(request_id: &str) {
    FETCH_ABORT_SENDERS
        .lock()
        .expect("native fetch abort senders poisoned")
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

/// `[u32 LE metadata length][metadata JSON][body bytes]`, so status, headers and body arrive in a
/// single raw IPC response instead of one round trip per body chunk.
fn frame_header(meta: &NativeFetchMeta) -> Result<Vec<u8>, String> {
    let meta_json = serde_json::to_vec(meta).map_err(|err| err.to_string())?;
    let meta_len = u32::try_from(meta_json.len()).map_err(|err| err.to_string())?;

    let mut framed = Vec::with_capacity(4 + meta_json.len());
    framed.extend_from_slice(&meta_len.to_le_bytes());
    framed.extend_from_slice(&meta_json);

    Ok(framed)
}

/// Streams the body straight into the framed buffer. Buffering the whole body first and then
/// copying it in would hold two full copies at once, which on a phone is the difference between
/// a large attachment costing its own size and costing twice that.
async fn frame_streamed_response(
    mut response: tauri_plugin_http::reqwest::Response,
    meta: &NativeFetchMeta,
    abort_receiver: &mut watch::Receiver<bool>,
) -> Result<Vec<u8>, String> {
    let mut framed = frame_header(meta)?;
    if let Some(len) = response.content_length() {
        framed.reserve(usize::try_from(len).unwrap_or(0));
    }

    loop {
        let chunk = tokio::select! {
            chunk = response.chunk() => chunk.map_err(|err| err.to_string())?,
            _ = wait_for_abort_signal(abort_receiver) => return Err("Request aborted".into()),
        };

        match chunk {
            Some(bytes) => framed.extend_from_slice(&bytes),
            None => return Ok(framed),
        }
    }
}

#[tauri::command]
pub fn abort_native_fetch(request_id: String) {
    if let Some(sender) = FETCH_ABORT_SENDERS
        .lock()
        .expect("native fetch abort senders poisoned")
        .remove(&request_id)
    {
        let _ = sender.send(true);
    }
}

#[tauri::command]
pub async fn native_fetch(request: NativeFetchRequest) -> Result<Response, String> {
    let request_id = request.request_id.clone();
    let url = validate_url(&request.url)?;
    let mut abort_receiver = register_abort_sender(&request_id);

    let result = async {
        let method =
            Method::from_bytes(request.method.as_bytes()).map_err(|err| err.to_string())?;
        let headers = build_headers(request.headers)?;
        let mut req = FETCH_CLIENT.request(method, url).headers(headers);

        if let Some(body) = request.body {
            req = req.body(body);
        }

        let response = tokio::select! {
            response = req.send() => response.map_err(|err| err.to_string())?,
            _ = wait_for_abort_signal(&mut abort_receiver) => return Err("Request aborted".into()),
        };

        let status = response.status();
        let meta = NativeFetchMeta {
            status: status.as_u16(),
            status_text: status
                .canonical_reason()
                .map(str::to_owned)
                .unwrap_or_else(|| status.as_str().to_owned()),
            url: response.url().to_string(),
            headers: response
                .headers()
                .iter()
                .filter_map(|(name, value)| {
                    value
                        .to_str()
                        .ok()
                        .map(|text| (name.to_string(), text.to_owned()))
                })
                .collect(),
        };

        let framed = frame_streamed_response(response, &meta, &mut abort_receiver).await?;

        Ok(Response::new(framed))
    }
    .await;

    remove_abort_sender(&request_id);
    result
}

#[cfg(test)]
mod tests {
    use super::{
        abort_native_fetch, frame_header, register_abort_sender, validate_url, NativeFetchMeta,
    };
    use tokio::time::{timeout, Duration};

    #[test]
    fn allows_http_and_https_urls() {
        assert!(validate_url("https://matrix.example.org/_matrix/client/versions").is_ok());
        assert!(validate_url("http://localhost:8008").is_ok());
    }

    #[test]
    fn rejects_non_http_schemes() {
        assert!(validate_url("file:///etc/passwd").is_err());
        assert!(validate_url("ipc://localhost").is_err());
        assert!(validate_url("not a url").is_err());
    }

    #[test]
    fn frames_metadata_length_then_metadata_then_body() {
        let meta = NativeFetchMeta {
            status: 200,
            status_text: "OK".into(),
            url: "https://matrix.example.org/".into(),
            headers: vec![("content-type".into(), "application/json".into())],
        };
        let mut framed = frame_header(&meta).expect("framing failed");
        framed.extend_from_slice(b"{\"a\":1}");

        let meta_len = u32::from_le_bytes(framed[0..4].try_into().unwrap()) as usize;
        let meta_json: serde_json::Value =
            serde_json::from_slice(&framed[4..4 + meta_len]).expect("metadata is not json");

        assert_eq!(meta_json["status"], 200);
        assert_eq!(meta_json["statusText"], "OK");
        assert_eq!(&framed[4 + meta_len..], b"{\"a\":1}");
    }

    #[test]
    fn frames_an_empty_body() {
        let meta = NativeFetchMeta {
            status: 204,
            status_text: "No Content".into(),
            url: "https://matrix.example.org/".into(),
            headers: vec![],
        };
        let framed = frame_header(&meta).expect("framing failed");

        let meta_len = u32::from_le_bytes(framed[0..4].try_into().unwrap()) as usize;
        assert_eq!(framed.len(), 4 + meta_len);
    }

    #[test]
    fn abort_command_signals_registered_requests() {
        tauri::async_runtime::block_on(async {
            let mut receiver = register_abort_sender("request-1");
            abort_native_fetch("request-1".into());

            timeout(Duration::from_secs(1), receiver.changed())
                .await
                .expect("abort signal timed out")
                .expect("abort receiver unexpectedly closed");

            assert!(*receiver.borrow());
        });
    }
}
