use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
};

use serde::{Deserialize, Serialize};
use tauri_plugin_http::reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    ClientBuilder, Method, Url,
};
use tokio::sync::watch;

static LOOPBACK_ABORT_SENDERS: LazyLock<Mutex<HashMap<String, watch::Sender<bool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopbackFetchRequest {
    request_id: String,
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Option<Vec<u8>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopbackFetchResponse {
    status: u16,
    status_text: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

fn validate_loopback_url(url: &str) -> Result<Url, String> {
    let parsed = Url::parse(url.trim()).map_err(|err| err.to_string())?;

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("loopback_fetch only allows loopback http:// or https:// URLs".into());
    }

    match parsed.host_str() {
        Some("localhost") | Some("127.0.0.1") | Some("::1") | Some("[::1]") => Ok(parsed),
        _ => Err("loopback_fetch only allows loopback http:// or https:// URLs".into()),
    }
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
    LOOPBACK_ABORT_SENDERS
        .lock()
        .expect("loopback abort senders poisoned")
        .insert(request_id.to_owned(), sender);
    receiver
}

fn remove_abort_sender(request_id: &str) {
    LOOPBACK_ABORT_SENDERS
        .lock()
        .expect("loopback abort senders poisoned")
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

#[tauri::command]
pub fn abort_loopback_fetch(request_id: String) {
    if let Some(sender) = LOOPBACK_ABORT_SENDERS
        .lock()
        .expect("loopback abort senders poisoned")
        .remove(&request_id)
    {
        let _ = sender.send(true);
    }
}

#[tauri::command]
pub async fn loopback_fetch(
    request: LoopbackFetchRequest,
) -> Result<LoopbackFetchResponse, String> {
    let request_id = request.request_id.clone();
    let mut abort_receiver = register_abort_sender(&request_id);
    let url = validate_loopback_url(&request.url)?;

    let result = async {
        let method = Method::from_bytes(request.method.as_bytes()).map_err(|err| err.to_string())?;
        let headers = build_headers(request.headers)?;
        let mut req = ClientBuilder::new()
            .no_proxy()
            .build()
            .map_err(|err| err.to_string())?
            .request(method, url)
            .headers(headers);

        if let Some(body) = request.body {
            req = req.body(body);
        }

        let response = tokio::select! {
            response = req.send() => response.map_err(|err| err.to_string())?,
            _ = wait_for_abort_signal(&mut abort_receiver) => return Err("Loopback request aborted".into()),
        };
        let status = response.status();
        let status_text = status
            .canonical_reason()
            .map(str::to_owned)
            .unwrap_or_else(|| status.as_str().to_owned());
        let url = response.url().to_string();
        let headers = response
            .headers()
            .iter()
            .filter_map(|(name, value)| value.to_str().ok().map(|text| (name.to_string(), text.to_owned())))
            .collect();
        let body = tokio::select! {
            body = response.bytes() => body.map_err(|err| err.to_string())?.to_vec(),
            _ = wait_for_abort_signal(&mut abort_receiver) => return Err("Loopback request aborted".into()),
        };

        Ok(LoopbackFetchResponse {
            status: status.as_u16(),
            status_text,
            url,
            headers,
            body,
        })
    }
    .await;

    remove_abort_sender(&request_id);
    result
}

#[cfg(test)]
mod tests {
    use super::{abort_loopback_fetch, register_abort_sender, validate_loopback_url};
    use tokio::time::{timeout, Duration};

    #[test]
    fn allows_loopback_http_hosts() {
        assert!(validate_loopback_url("http://localhost:8008").is_ok());
        assert!(validate_loopback_url("https://localhost:8448").is_ok());
        assert!(validate_loopback_url("http://127.0.0.1:8008").is_ok());
        assert!(validate_loopback_url("https://127.0.0.1:8448").is_ok());
        assert!(validate_loopback_url("http://[::1]:8008").is_ok());
        assert!(validate_loopback_url("https://[::1]:8448").is_ok());
        assert!(validate_loopback_url("http://localhost/_matrix/client/versions").is_ok());
    }

    #[test]
    fn rejects_non_loopback_or_non_http_urls() {
        assert!(validate_loopback_url("http://192.168.1.5:8008").is_err());
        assert!(validate_loopback_url("https://matrix.example.org").is_err());
        assert!(validate_loopback_url("http://localhost.evil.example.org").is_err());
        assert!(validate_loopback_url("http://localhost:8008@evil.example.org").is_err());
    }

    #[test]
    fn abort_command_signals_registered_requests() {
        tauri::async_runtime::block_on(async {
            let mut receiver = register_abort_sender("request-1");
            abort_loopback_fetch("request-1".into());

            timeout(Duration::from_secs(1), receiver.changed())
                .await
                .expect("abort signal timed out")
                .expect("abort receiver unexpectedly closed");

            assert!(*receiver.borrow());
        });
    }
}
