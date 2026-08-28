use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock, Weak},
    time::Duration,
};

use sha2::{Digest, Sha256};
use tauri::{
    http::{header, Request, Response, StatusCode, Uri},
    AppHandle, Emitter, Manager, Runtime, State, UriSchemeContext, UriSchemeResponder,
};

mod crypto;
mod lane;
mod loopback;

pub const LOOPBACK_REBOUND_EVENT: &str = "sable-media://loopback-rebound";
mod response;
mod session;

use crypto::EncryptionStore;
use lane::{LanePermit, LifoLane};
use loopback::LoopbackMediaServer;
use response::{
    apply_cors_headers, error_response, ok_response, read_full, serve_range, serve_range_memory,
    session_unavailable_response, sniff_media_content_type,
};
use session::{MediaSession, SessionStore};
use tauri_plugin_http::reqwest::{
    header::{AUTHORIZATION, CONTENT_TYPE},
    Client, Url,
};
use tokio::{sync::Mutex as AsyncMutex, time::Instant};

pub const MEDIA_URI_SCHEME: &str = "sable-media";
const MEDIA_SESSION_MARKER: &str = "__sable_media_session";

const MEDIA_PATH_PREFIXES: [&str; 2] = ["/_matrix/media/", "/_matrix/client/v1/media/"];
const CACHE_SUBDIR: &str = "sable-media";
// Inactivity deadline between chunks, so a slow but progressing download is not killed.
const READ_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
// Small and multiplexed over one HTTP/2 connection, so a tight cap only serialises the timeline.
const MAX_CONCURRENT_THUMBNAIL_REQUESTS: usize = 12;
const MAX_CONCURRENT_DOWNLOAD_REQUESTS: usize = 6;
// The frontend mounts (and starts requesting media) before it hands us the session, so a request
// may arrive first. `<img>` never retries, so waiting beats answering 503.
const SESSION_WAIT: Duration = Duration::from_secs(5);
const SESSION_REFRESH_WAIT: Duration = Duration::from_millis(2500);
const MAX_CACHE_BYTES: u64 = 512 * 1024 * 1024;
// Short: a 4xx stops being true once an unreachable remote server comes back.
const NEGATIVE_CACHE_TTL: Duration = Duration::from_secs(600);
const MAX_NEGATIVE_CACHE_ENTRIES: usize = 512;

const TEMP_CACHE_SUBDIR: &str = "sable-media-temp";
const MAX_TEMP_CACHE_BYTES: u64 = 2 * 1024 * 1024 * 1024; // 2 GiB

type FetchResult = Result<(String, Option<Arc<Vec<u8>>>, PathBuf), StatusCode>;

pub struct MediaSessionState {
    session_store: SessionStore,
    encryption: EncryptionStore,
    client: OnceLock<Client>,
    thumbnail_lane: LifoLane,
    download_lane: LifoLane,
    cache_miss_gates: Mutex<HashMap<String, Weak<AsyncMutex<Option<FetchResult>>>>>,
    negative_cache: Mutex<HashMap<String, (StatusCode, Instant)>>,
    loopback: Option<LoopbackMediaServer>,
}

impl Default for MediaSessionState {
    fn default() -> Self {
        Self {
            session_store: SessionStore::default(),
            encryption: EncryptionStore::default(),
            client: OnceLock::new(),
            thumbnail_lane: LifoLane::new(MAX_CONCURRENT_THUMBNAIL_REQUESTS),
            download_lane: LifoLane::new(MAX_CONCURRENT_DOWNLOAD_REQUESTS),
            cache_miss_gates: Mutex::new(HashMap::new()),
            negative_cache: Mutex::new(HashMap::new()),
            loopback: LoopbackMediaServer::start().ok(),
        }
    }
}

impl MediaSessionState {
    #[cfg(test)]
    fn session(&self) -> Option<MediaSession> {
        self.session_store.current()
    }

    /// Waits out the startup window where media is requested before the session arrives. Fails
    /// fast once a session has existed, so requests still in flight after a logout do not hang.
    async fn wait_for_session(&self) -> Option<MediaSession> {
        self.session_store.wait_initial(SESSION_WAIT).await
    }

    async fn wait_for_newer_session(&self, previous: &MediaSession) -> Option<MediaSession> {
        self.wait_for_newer_session_with_timeout(previous, SESSION_REFRESH_WAIT)
            .await
    }

    async fn wait_for_newer_session_with_timeout(
        &self,
        previous: &MediaSession,
        wait: Duration,
    ) -> Option<MediaSession> {
        self.session_store.wait_newer(previous, wait).await
    }

    fn set_session(&self, session: MediaSession) -> Result<(), String> {
        self.session_store.set(session, |changed| {
            self.forget_client_errors();
            // Capabilities embed the access token, so only a real session change orphans them.
            if changed {
                self.clear_loopback_media();
            }
        })
    }

    fn clear_session(&self) -> Result<(), String> {
        self.session_store.clear(|| {
            self.forget_client_errors();
            self.clear_loopback_media();
        })
    }

    fn clear_loopback_media(&self) {
        if let Some(loopback) = &self.loopback {
            loopback.clear();
        }
    }

    fn ensure_loopback_media_live(&self) -> Result<bool, String> {
        let Some(loopback) = &self.loopback else {
            return Ok(false);
        };
        loopback.ensure_live().map_err(|err| err.to_string())
    }

    // Shared across requests so the connection pool and TLS sessions stay warm.
    fn client(&self) -> Client {
        self.client
            .get_or_init(|| {
                // MSC3916: default policy strips Authorization on cross-origin redirects to a signed CDN URL.
                Client::builder()
                    .read_timeout(READ_TIMEOUT)
                    .connect_timeout(CONNECT_TIMEOUT)
                    .redirect(tauri_plugin_http::reqwest::redirect::Policy::default())
                    .build()
                    .unwrap_or_else(|_| Client::new())
            })
            .clone()
    }

    fn cache_miss_gate(
        &self,
        key: &str,
    ) -> Result<Arc<AsyncMutex<Option<FetchResult>>>, StatusCode> {
        let mut gates = self
            .cache_miss_gates
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        gates.retain(|_, gate| gate.strong_count() > 0);
        if let Some(gate) = gates.get(key).and_then(Weak::upgrade) {
            return Ok(gate);
        }

        let gate = Arc::new(AsyncMutex::new(None));
        gates.insert(key.to_owned(), Arc::downgrade(&gate));
        Ok(gate)
    }

    fn recent_client_error(&self, key: &str) -> Option<StatusCode> {
        let mut cache = self.negative_cache.lock().ok()?;
        let (status, seen_at) = *cache.get(key)?;
        if seen_at.elapsed() < NEGATIVE_CACHE_TTL {
            return Some(status);
        }
        cache.remove(key);
        None
    }

    /// 5xx and auth/rate-limit failures stay retryable.
    fn note_client_error(&self, key: &str, status: StatusCode) {
        let media_specific = status.is_client_error()
            && !matches!(
                status,
                StatusCode::UNAUTHORIZED
                    | StatusCode::FORBIDDEN
                    | StatusCode::REQUEST_TIMEOUT
                    | StatusCode::TOO_MANY_REQUESTS
            );
        if !media_specific {
            return;
        }
        let Ok(mut cache) = self.negative_cache.lock() else {
            return;
        };
        cache.retain(|_, (_, seen_at)| seen_at.elapsed() < NEGATIVE_CACHE_TTL);
        if cache.len() >= MAX_NEGATIVE_CACHE_ENTRIES {
            return;
        }
        cache.insert(key.to_owned(), (status, Instant::now()));
    }

    fn forget_client_errors(&self) {
        if let Ok(mut cache) = self.negative_cache.lock() {
            cache.clear();
        }
    }
}

#[tauri::command]
pub fn set_media_session(
    state: tauri::State<'_, MediaSessionState>,
    base_url: String,
    token: String,
    scope: Option<String>,
) -> Result<(), String> {
    let origin = Url::parse(&base_url)
        .map_err(|err| err.to_string())?
        .origin()
        .ascii_serialization();

    let scope = scope
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| origin.clone());

    state.set_session(MediaSession {
        origin,
        token,
        scope,
        generation: 0,
    })
}

#[tauri::command]
pub fn clear_media_session<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, MediaSessionState>,
) {
    let _ = state.clear_session();
    if let Ok(dir) = cache_dir(&app) {
        let _ = fs::remove_dir_all(dir);
    }
    if let Ok(temp_dir) = temp_cache_dir(&app) {
        let _ = fs::remove_dir_all(temp_dir);
    }
    state.encryption.clear();
}

#[tauri::command]
pub fn set_media_encryption(
    state: State<MediaSessionState>,
    url: String,
    key: String,
    iv: String,
    sha256: String,
    version: String,
    mime_type: String,
) -> Result<(), String> {
    state
        .encryption
        .register(&url, &key, &iv, &sha256, &version, mime_type)
}

#[tauri::command]
pub fn ensure_loopback_media<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, MediaSessionState>,
) -> Result<(), String> {
    if state.ensure_loopback_media_live()? {
        let _ = app.emit(LOOPBACK_REBOUND_EVENT, ());
    }
    Ok(())
}

#[tauri::command]
pub async fn prepare_loopback_media<R: Runtime>(
    app: AppHandle<R>,
    url: String,
) -> Result<String, String> {
    let uri = url.parse::<Uri>().map_err(|err| err.to_string())?;
    let response = handle_request(&app, uri, None, true)
        .await
        .map_err(|status| status.to_string())?;
    response
        .headers()
        .get(header::LOCATION)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
        .ok_or_else(|| "loopback media server unavailable".to_owned())
}

fn media_session_marker(uri: &Uri) -> Result<Option<String>, StatusCode> {
    let Some(query) = uri.query() else {
        return Ok(None);
    };

    let mut marker = None;
    for component in query.split('&') {
        let (raw_key, raw_value) = component.split_once('=').unwrap_or((component, ""));
        let key = percent_encoding::percent_decode_str(raw_key)
            .decode_utf8()
            .map_err(|_| StatusCode::BAD_REQUEST)?;
        if key == MEDIA_SESSION_MARKER {
            if marker.is_some() {
                return Err(StatusCode::BAD_REQUEST);
            }
            marker = Some(
                percent_encoding::percent_decode_str(raw_value)
                    .decode_utf8()
                    .map_err(|_| StatusCode::BAD_REQUEST)?
                    .into_owned(),
            );
        }
    }

    Ok(marker)
}

fn session_marker_matches(uri: &Uri, scope: &str) -> Result<bool, StatusCode> {
    Ok(media_session_marker(uri)?.is_none_or(|marker| marker == scope))
}

fn should_retry_with_session(failed: &MediaSession, updated: &MediaSession) -> bool {
    updated.generation != failed.generation
        && updated.token != failed.token
        && updated.origin == failed.origin
        && updated.scope == failed.scope
}

pub fn respond<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    let uri = request.uri().clone();
    let header_value = |name: header::HeaderName| {
        request
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned)
    };
    let range = header_value(header::RANGE);
    let origin = header_value(header::ORIGIN);
    tauri::async_runtime::spawn(async move {
        let mut response = handle_request(&app, uri, range, false)
            .await
            .unwrap_or_else(error_response);
        apply_cors_headers(&mut response, origin.as_deref());
        responder.respond(response);
    });
}

struct ResolvedMedia {
    cache_key: String,
    content_type: String,
    in_memory_body: Option<Arc<Vec<u8>>>,
    disk_path: PathBuf,
}

enum Resolved {
    Ready(MediaSession, ResolvedMedia),
    SessionUnavailable,
}

async fn handle_request<R: Runtime>(
    app: &AppHandle<R>,
    uri: Uri,
    range: Option<String>,
    loopback: bool,
) -> Result<Response<Vec<u8>>, StatusCode> {
    let (session, resolved) = match resolve_media(app, &uri).await? {
        Resolved::SessionUnavailable => return Ok(session_unavailable_response()),
        Resolved::Ready(session, resolved) => (session, resolved),
    };
    let ResolvedMedia {
        cache_key,
        content_type,
        in_memory_body,
        disk_path,
    } = resolved;
    log_served_content_type(&content_type, range.is_some());

    if loopback && in_memory_body.is_none() {
        let state = app.state::<MediaSessionState>();
        if let Some(loopback) = &state.loopback {
            if loopback.ensure_live().unwrap_or(false) {
                let _ = app.emit(LOOPBACK_REBOUND_EVENT, ());
            }
            return Ok(loopback.redirect_response(&session, &cache_key, disk_path, &content_type));
        }
    }

    match (range, in_memory_body) {
        (Some(range_header), Some(body)) => {
            Ok(serve_range_memory(&body, &content_type, &range_header))
        }
        (Some(range_header), None) => serve_range(disk_path, content_type, range_header).await,
        (None, Some(body)) => {
            let vec_body = Arc::try_unwrap(body).unwrap_or_else(|b| (*b).clone());
            Ok(ok_response(vec_body, &content_type))
        }
        (None, None) => Ok(ok_response(read_full(disk_path).await?, &content_type)),
    }
}

async fn resolve_media<R: Runtime>(app: &AppHandle<R>, uri: &Uri) -> Result<Resolved, StatusCode> {
    let target = percent_encoding::percent_decode_str(uri.path().trim_start_matches('/'))
        .decode_utf8()
        .map_err(|_| StatusCode::BAD_REQUEST)?
        .into_owned();

    let state = app.state::<MediaSessionState>();
    let Some(session) = state.wait_for_session().await else {
        return Ok(Resolved::SessionUnavailable);
    };

    let mut media_url = Url::parse(&target).map_err(|_| StatusCode::BAD_REQUEST)?;
    // A retry fragment never goes upstream and must not key encryption params, but stays
    // in `target` below so the retry gets a fresh cache identity.
    media_url.set_fragment(None);
    if media_url.scheme() != "http" && media_url.scheme() != "https" {
        return Err(StatusCode::FORBIDDEN);
    }
    if media_url.origin().ascii_serialization() != session.origin {
        return Err(StatusCode::FORBIDDEN);
    }
    if !MEDIA_PATH_PREFIXES
        .iter()
        .any(|prefix| media_url.path().starts_with(prefix))
    {
        return Err(StatusCode::FORBIDDEN);
    }
    if !session_marker_matches(uri, &session.scope)? {
        return Err(StatusCode::FORBIDDEN);
    }

    let key = cache_key(&session.scope, &target);
    if let Some(status) = state.recent_client_error(&key) {
        return Err(status);
    }
    let dir = cache_dir(app).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let temp_dir = temp_cache_dir(app).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (content_type, in_memory_body, disk_path) =
        ensure_cached(&state, &session, &key, media_url, dir, temp_dir).await?;

    Ok(Resolved::Ready(
        session,
        ResolvedMedia {
            cache_key: key,
            content_type,
            in_memory_body,
            disk_path,
        },
    ))
}

#[cfg(desktop)]
pub(crate) async fn copy_media_to_file<R: Runtime>(
    app: &AppHandle<R>,
    url: &str,
    destination: &Path,
) -> Result<(), String> {
    let uri = url.parse::<Uri>().map_err(|err| err.to_string())?;
    let resolved = resolve_media(app, &uri)
        .await
        .map_err(|status| format!("media unavailable ({status})"))?;

    let Resolved::Ready(_, media) = resolved else {
        return Err("no active media session".to_owned());
    };

    match media.in_memory_body {
        Some(body) => {
            tokio::fs::write(destination, body.as_slice())
                .await
                .map_err(|err| err.to_string())?;
        }
        None => {
            tokio::fs::copy(&media.disk_path, destination)
                .await
                .map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

// Ensure the body + content type are on disk (persistent or temporary), fetching from the homeserver on a miss.
async fn ensure_cached(
    state: &MediaSessionState,
    session: &MediaSession,
    key: &str,
    media_url: Url,
    dir: PathBuf,
    temp_dir: PathBuf,
) -> Result<(String, Option<Arc<Vec<u8>>>, PathBuf), StatusCode> {
    ensure_cached_with_limits(
        state,
        session,
        key,
        media_url,
        dir,
        temp_dir,
        MAX_CACHE_BYTES,
        MAX_TEMP_CACHE_BYTES,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn ensure_cached_with_limits(
    state: &MediaSessionState,
    session: &MediaSession,
    key: &str,
    media_url: Url,
    dir: PathBuf,
    temp_dir: PathBuf,
    max_persistent_cache_bytes: u64,
    max_temp_cache_bytes: u64,
) -> Result<(String, Option<Arc<Vec<u8>>>, PathBuf), StatusCode> {
    let body_path = dir.join(key);
    let content_type_path = dir.join(format!("{key}.ct"));
    let temp_body_path = temp_dir.join(key);
    let temp_content_type_path = temp_dir.join(format!("{key}.ct"));

    // Fast path 1: Persistent cache hit
    if let Some(content_type) =
        read_content_type(body_path.clone(), content_type_path.clone()).await
    {
        let content_type =
            sniff_and_fix_content_type(body_path.clone(), content_type_path.clone(), content_type)
                .await;
        return Ok((content_type, None, body_path));
    }

    // Fast path 2: Temporary cache hit (sequential range requests for oversized media)
    if let Some(content_type) =
        read_content_type(temp_body_path.clone(), temp_content_type_path.clone()).await
    {
        let content_type = sniff_and_fix_content_type(
            temp_body_path.clone(),
            temp_content_type_path.clone(),
            content_type,
        )
        .await;
        return Ok((content_type, None, temp_body_path));
    }

    let gate = state.cache_miss_gate(key)?;
    let mut gate_guard = gate.lock().await;

    // Double-check persistent cache inside gate lock
    if let Some(content_type) =
        read_content_type(body_path.clone(), content_type_path.clone()).await
    {
        let content_type =
            sniff_and_fix_content_type(body_path.clone(), content_type_path.clone(), content_type)
                .await;
        return Ok((content_type, None, body_path));
    }

    // Double-check temporary cache inside gate lock
    if let Some(content_type) =
        read_content_type(temp_body_path.clone(), temp_content_type_path.clone()).await
    {
        let content_type = sniff_and_fix_content_type(
            temp_body_path.clone(),
            temp_content_type_path.clone(),
            content_type,
        )
        .await;
        return Ok((content_type, None, temp_body_path));
    }

    // Double-check in-flight results
    if let Some(res) = &*gate_guard {
        return match res {
            Ok((content_type, body_opt, path)) => {
                Ok((content_type.clone(), body_opt.clone(), path.clone()))
            }
            Err(status) => Err(*status),
        };
    }

    let fetch_res = fetch_and_cache(
        state,
        session,
        media_url,
        dir,
        temp_dir,
        body_path,
        content_type_path,
        temp_body_path,
        temp_content_type_path,
        max_persistent_cache_bytes,
        max_temp_cache_bytes,
    )
    .await;

    match &fetch_res {
        Ok((content_type, body_opt, path)) => {
            *gate_guard = Some(Ok((content_type.clone(), body_opt.clone(), path.clone())));
            fetch_res
        }
        Err(status) => {
            state.note_client_error(key, *status);
            *gate_guard = Some(Err(*status));
            Err(*status)
        }
    }
}

// Thumbnails queue separately so a few large downloads cannot stall a painting timeline.
async fn acquire_lane<'a>(state: &'a MediaSessionState, media_url: &Url) -> LanePermit<'a> {
    let lane = if is_thumbnail_request(media_url) {
        &state.thumbnail_lane
    } else {
        &state.download_lane
    };
    lane.acquire().await
}

fn is_thumbnail_request(media_url: &Url) -> bool {
    let Some(segments) = media_url.path_segments() else {
        return false;
    };
    let mut after_media = segments.skip_while(|segment| *segment != "media").skip(1);
    match after_media.next() {
        // The legacy endpoints carry a version segment before the action.
        Some(segment) if is_media_api_version(segment) => after_media.next() == Some("thumbnail"),
        segment => segment == Some("thumbnail"),
    }
}

fn is_media_api_version(segment: &str) -> bool {
    matches!(segment, "v1" | "v3" | "r0")
}

#[allow(clippy::too_many_arguments)]
async fn fetch_and_cache(
    state: &MediaSessionState,
    session: &MediaSession,
    media_url: Url,
    dir: PathBuf,
    temp_dir: PathBuf,
    body_path: PathBuf,
    content_type_path: PathBuf,
    temp_body_path: PathBuf,
    temp_content_type_path: PathBuf,
    max_persistent_cache_bytes: u64,
    max_temp_cache_bytes: u64,
) -> Result<(String, Option<Arc<Vec<u8>>>, PathBuf), StatusCode> {
    let permit = acquire_lane(state, &media_url).await;

    let mut upstream = state
        .client()
        .get(media_url.clone())
        .header(AUTHORIZATION, format!("Bearer {}", session.token))
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    if matches!(
        upstream.status(),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
    ) {
        if let Some(updated) = state.wait_for_newer_session(session).await {
            if should_retry_with_session(session, &updated) {
                upstream = state
                    .client()
                    .get(media_url.clone())
                    .header(AUTHORIZATION, format!("Bearer {}", updated.token))
                    .send()
                    .await
                    .map_err(|_| StatusCode::BAD_GATEWAY)?;
            }
        }
    }

    if !upstream.status().is_success() {
        return Err(
            StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY)
        );
    }

    let content_type = normalize_content_type(
        upstream
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok()),
    );

    // Encrypted media stays buffered: its SHA-256 only verifies over the whole ciphertext.
    if state.encryption.contains(media_url.as_str()) {
        let body = upstream
            .bytes()
            .await
            .map_err(|_| StatusCode::BAD_GATEWAY)?
            .to_vec();
        let (body, content_type) =
            state
                .encryption
                .decrypt(media_url.as_str(), body, &content_type)?;
        drop(permit);

        return store_buffered_body(
            body,
            content_type,
            dir,
            temp_dir,
            body_path,
            content_type_path,
            temp_body_path,
            temp_content_type_path,
            max_persistent_cache_bytes,
            max_temp_cache_bytes,
        )
        .await;
    }

    // Plaintext media streams to disk, so peak memory is one chunk instead of the whole file.
    let staging_path = temp_body_path.with_extension("part");
    match stream_to_staging_file(&mut upstream, temp_dir.clone(), staging_path.clone()).await {
        StreamOutcome::Written(size) => {
            drop(permit);
            let (target_dir, target_body, target_ct, max_bytes) =
                if size <= max_persistent_cache_bytes {
                    (
                        dir,
                        body_path,
                        content_type_path,
                        max_persistent_cache_bytes,
                    )
                } else {
                    (
                        temp_dir,
                        temp_body_path,
                        temp_content_type_path,
                        max_temp_cache_bytes,
                    )
                };

            if promote_staging_file(
                staging_path,
                target_dir,
                target_body.clone(),
                target_ct,
                content_type.clone(),
                max_bytes,
            )
            .await
            {
                Ok((content_type, None, target_body))
            } else {
                Err(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
        // Cache directory unusable (read-only, full): serve from memory instead of failing.
        StreamOutcome::Unstorable => {
            let body = upstream
                .bytes()
                .await
                .map_err(|_| StatusCode::BAD_GATEWAY)?
                .to_vec();
            drop(permit);
            Ok((content_type, Some(Arc::new(body)), temp_body_path))
        }
        StreamOutcome::Failed => Err(StatusCode::BAD_GATEWAY),
    }
}

enum StreamOutcome {
    Written(u64),
    /// The staging file could not be created; nothing was read from the body yet.
    Unstorable,
    Failed,
}

async fn stream_to_staging_file(
    upstream: &mut tauri_plugin_http::reqwest::Response,
    temp_dir: PathBuf,
    staging_path: PathBuf,
) -> StreamOutcome {
    if tokio::fs::create_dir_all(&temp_dir).await.is_err() {
        return StreamOutcome::Unstorable;
    }
    let Ok(file) = tokio::fs::File::create(&staging_path).await else {
        return StreamOutcome::Unstorable;
    };

    let mut file = tokio::io::BufWriter::new(file);
    let mut written: u64 = 0;

    loop {
        match upstream.chunk().await {
            Ok(Some(chunk)) => {
                if tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
                    .await
                    .is_err()
                {
                    break;
                }
                written += chunk.len() as u64;
            }
            Ok(None) => {
                if tokio::io::AsyncWriteExt::flush(&mut file).await.is_ok() {
                    return StreamOutcome::Written(written);
                }
                break;
            }
            Err(_) => break,
        }
    }

    let _ = tokio::fs::remove_file(&staging_path).await;
    StreamOutcome::Failed
}

// Move a completed staging file into its cache directory and record its content type.
async fn promote_staging_file(
    staging_path: PathBuf,
    target_dir: PathBuf,
    target_body: PathBuf,
    target_content_type: PathBuf,
    content_type: String,
    max_bytes: u64,
) -> bool {
    tokio::task::spawn_blocking(move || {
        if fs::create_dir_all(&target_dir).is_err() {
            let _ = fs::remove_file(&staging_path);
            return false;
        }
        if fs::rename(&staging_path, &target_body).is_err() {
            let _ = fs::remove_file(&staging_path);
            return false;
        }
        if fs::write(&target_content_type, &content_type).is_err() {
            let _ = fs::remove_file(&target_body);
            return false;
        }
        evict_directory_if_needed(&target_dir, max_bytes);
        target_body.is_file()
    })
    .await
    .unwrap_or(false)
}

#[allow(clippy::too_many_arguments)]
async fn store_buffered_body(
    body: Vec<u8>,
    content_type: String,
    dir: PathBuf,
    temp_dir: PathBuf,
    body_path: PathBuf,
    content_type_path: PathBuf,
    temp_body_path: PathBuf,
    temp_content_type_path: PathBuf,
    max_persistent_cache_bytes: u64,
    max_temp_cache_bytes: u64,
) -> Result<(String, Option<Arc<Vec<u8>>>, PathBuf), StatusCode> {
    if body.len() as u64 > max_temp_cache_bytes {
        return Ok((content_type, Some(Arc::new(body)), temp_body_path));
    }

    if body.len() as u64 <= max_persistent_cache_bytes {
        write_cache(
            dir,
            body_path.clone(),
            content_type_path,
            body,
            content_type.clone(),
            max_persistent_cache_bytes,
        )
        .await;
        Ok((content_type, None, body_path))
    } else {
        let shared = Arc::new(body);
        let written = write_cache(
            temp_dir,
            temp_body_path.clone(),
            temp_content_type_path,
            shared.as_ref().clone(),
            content_type.clone(),
            max_temp_cache_bytes,
        )
        .await;

        if written {
            Ok((content_type, None, temp_body_path))
        } else {
            // Storage write failed or evicted; serve from memory fallback
            Ok((content_type, Some(shared), temp_body_path))
        }
    }
}

async fn write_cache(
    dir: PathBuf,
    body_path: PathBuf,
    content_type_path: PathBuf,
    body: Vec<u8>,
    content_type: String,
    max_bytes: u64,
) -> bool {
    tokio::task::spawn_blocking(move || {
        if fs::create_dir_all(&dir).is_ok() {
            let res_body = fs::write(&body_path, &body);
            let res_ct = fs::write(&content_type_path, &content_type);
            evict_directory_if_needed(&dir, max_bytes);
            res_body.is_ok() && res_ct.is_ok() && body_path.is_file()
        } else {
            false
        }
    })
    .await
    .unwrap_or(false)
}

// Only a hit when the body file is also present, so a stray `.ct` counts as a miss.
async fn read_content_type(body_path: PathBuf, content_type_path: PathBuf) -> Option<String> {
    tokio::task::spawn_blocking(move || {
        if !body_path.is_file() {
            return None;
        }
        fs::read_to_string(&content_type_path)
            .ok()
            .map(|stored| normalize_content_type(Some(&stored)))
    })
    .await
    .unwrap_or(None)
}

// Empty becomes octet-stream so it reaches the sniffer; an empty Content-Type is fatal
// under `nosniff`.
fn normalize_content_type(raw: Option<&str>) -> String {
    let trimmed = raw.unwrap_or_default().trim();
    if trimmed.is_empty() {
        return "application/octet-stream".to_owned();
    }
    trimmed.to_owned()
}

// Images are the bulk of the traffic and would drown the log.
fn log_served_content_type(content_type: &str, ranged: bool) {
    if content_type.starts_with("image/") {
        return;
    }
    if content_type == "application/octet-stream" {
        log::warn!("[sable-media] serving application/octet-stream (ranged={ranged}); nosniff blocks decoding");
    } else {
        log::info!("[sable-media] serving {content_type} (ranged={ranged})");
    }
}

/// On a cache hit where the stored content type is octet-stream, re-sniff the
/// body file's magic bytes and rewrite the .ct file if a known media type is found.
async fn sniff_and_fix_content_type(
    body_path: PathBuf,
    content_type_path: PathBuf,
    stored_ct: String,
) -> String {
    if stored_ct != "application/octet-stream" {
        return stored_ct;
    }
    let ct_for_closure = stored_ct.clone();
    tokio::task::spawn_blocking(move || {
        let mut file = match fs::File::open(&body_path) {
            Ok(f) => f,
            Err(_) => return ct_for_closure,
        };
        let mut buf = [0u8; 512];
        let n = file.read(&mut buf).unwrap_or(0);
        if let Some(sniffed) = sniff_media_content_type(&buf[..n]) {
            let _ = fs::write(&content_type_path, sniffed);
            return sniffed.to_owned();
        }
        ct_for_closure
    })
    .await
    .unwrap_or(stored_ct)
}

// Trim oldest-first when the cache exceeds its byte budget.
fn evict_directory_if_needed(dir: &Path, max_bytes: u64) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    let mut files: Vec<(PathBuf, u64, std::time::SystemTime)> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let meta = entry.metadata().ok()?;
            if !meta.is_file() {
                return None;
            }
            let modified = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
            Some((path, meta.len(), modified))
        })
        .collect();

    let mut total: u64 = files.iter().map(|(_, len, _)| *len).sum();
    if total <= max_bytes {
        return;
    }

    files.sort_by_key(|(_, _, modified)| *modified);
    for (path, len, _) in files {
        if total <= max_bytes {
            break;
        }
        if fs::remove_file(&path).is_ok() {
            total = total.saturating_sub(len);
        }
    }
}

fn cache_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|dir| dir.join(CACHE_SUBDIR))
        .map_err(|err| err.to_string())
}

fn temp_cache_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|dir| dir.join(TEMP_CACHE_SUBDIR))
        .map_err(|err| err.to_string())
}

fn cache_key(session_token: &str, url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(session_token.as_bytes());
    hasher.update([0]);
    hasher.update(url.as_bytes());
    let digest = hasher.finalize();
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        io::{Read, Write},
        net::TcpListener,
        sync::{atomic::AtomicU64, mpsc, Arc},
        thread,
        time::Duration,
    };

    use tauri::http::{StatusCode, Uri};

    use super::{
        cache_key, normalize_content_type, session_marker_matches, should_retry_with_session,
        MediaSession, MediaSessionState, Url,
    };

    static TEST_CACHE_ID: AtomicU64 = AtomicU64::new(0);

    fn test_session(origin: &str, token: &str, scope: &str, generation: u64) -> MediaSession {
        MediaSession {
            origin: origin.to_owned(),
            token: token.to_owned(),
            scope: scope.to_owned(),
            generation,
        }
    }

    fn start_upstream(
        statuses: Vec<(u16, &'static str)>,
    ) -> (Url, mpsc::Receiver<String>, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (auth_sender, auth_receiver) = mpsc::channel();
        let server = thread::spawn(move || {
            for (status, body) in statuses {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = Vec::new();
                let mut chunk = [0_u8; 1024];
                while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                    let Ok(read) = stream.read(&mut chunk) else {
                        break;
                    };
                    if read == 0 {
                        break;
                    }
                    request.extend_from_slice(&chunk[..read]);
                }
                let authorization = String::from_utf8_lossy(&request)
                    .lines()
                    .find_map(|line| {
                        line.strip_prefix("Authorization: ")
                            .or_else(|| line.strip_prefix("authorization: "))
                    })
                    .unwrap_or_default()
                    .to_owned();
                auth_sender.send(authorization).unwrap();
                let reason = match status {
                    200 => "OK",
                    403 => "Forbidden",
                    _ => "Unauthorized",
                };
                let response = format!(
                    "HTTP/1.1 {status} {reason}\r\nContent-Type: image/png\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(response.as_bytes()).unwrap();
            }
        });
        (
            Url::parse(&format!(
                "http://{address}/_matrix/client/v1/media/download/matrix.org/id"
            ))
            .unwrap(),
            auth_receiver,
            server,
        )
    }

    async fn fetch_test(
        state: &MediaSessionState,
        session: MediaSession,
        media_url: Url,
    ) -> Result<(String, Option<Arc<Vec<u8>>>, std::path::PathBuf), StatusCode> {
        let root = std::env::temp_dir().join(format!(
            "sable-media-test-{}-{}",
            std::process::id(),
            TEST_CACHE_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let temp = root.join("temp");
        let key = cache_key(&session.scope, media_url.as_str());
        let result = super::ensure_cached_with_limits(
            state,
            &session,
            &key,
            media_url,
            root.clone(),
            temp,
            1024 * 1024,
            1024 * 1024,
        )
        .await;
        fs::remove_dir_all(root).ok();
        result
    }

    async fn receive_auth(receiver: &mpsc::Receiver<String>) -> String {
        tokio::time::timeout(Duration::from_secs(1), async {
            loop {
                if let Ok(auth) = receiver.try_recv() {
                    return auth;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap()
    }

    #[test]
    fn cache_miss_gates_are_reused_and_expired_entries_are_cleaned() {
        let state = MediaSessionState::default();
        let first = state.cache_miss_gate("first").unwrap();
        let same = state.cache_miss_gate("first").unwrap();
        let different = state.cache_miss_gate("different").unwrap();

        assert!(Arc::ptr_eq(&first, &same));
        assert!(!Arc::ptr_eq(&first, &different));

        drop(first);
        drop(same);
        let _third = state.cache_miss_gate("third").unwrap();
        let gates = state.cache_miss_gates.lock().unwrap();
        assert!(!gates.contains_key("first"));
        assert!(gates.contains_key("different"));
        assert!(gates.contains_key("third"));
    }

    #[tokio::test]
    async fn waits_for_a_session_that_arrives_late() {
        // Mirrors startup: media is requested before the frontend hands over the session.
        let state = Arc::new(MediaSessionState::default());
        let writer = Arc::clone(&state);
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            writer
                .set_session(super::MediaSession {
                    origin: "https://matrix.example.org".into(),
                    token: "token".into(),
                    scope: "@a:example.org".into(),
                    generation: 0,
                })
                .unwrap();
        });

        let session =
            tokio::time::timeout(std::time::Duration::from_secs(2), state.wait_for_session())
                .await
                .expect("wait_for_session hung");
        assert_eq!(session.map(|s| s.scope), Some("@a:example.org".to_string()));
    }

    #[tokio::test]
    async fn retries_once_after_a_same_scope_token_update() {
        let (media_url, auth_receiver, server) = start_upstream(vec![(401, ""), (200, "data")]);
        let state = Arc::new(MediaSessionState::default());
        state
            .set_session(test_session(
                media_url.origin().ascii_serialization().as_str(),
                "old-token",
                "@a:example.org",
                0,
            ))
            .unwrap();
        let failed_session = state.session().unwrap();
        let fetch_state = Arc::clone(&state);
        let fetch_url = media_url.clone();
        let fetch =
            tokio::spawn(async move { fetch_test(&fetch_state, failed_session, fetch_url).await });

        assert_eq!(receive_auth(&auth_receiver).await, "Bearer old-token");
        state
            .set_session(test_session(
                media_url.origin().ascii_serialization().as_str(),
                "new-token",
                "@a:example.org",
                0,
            ))
            .unwrap();

        assert!(fetch.await.unwrap().is_ok());
        assert_eq!(receive_auth(&auth_receiver).await, "Bearer new-token");
        server.join().unwrap();
    }

    #[tokio::test]
    async fn retries_once_after_same_token_then_changed_token_updates() {
        let (media_url, auth_receiver, server) = start_upstream(vec![(401, ""), (200, "data")]);
        let state = Arc::new(MediaSessionState::default());
        state
            .set_session(test_session(
                media_url.origin().ascii_serialization().as_str(),
                "same-token",
                "@a:example.org",
                0,
            ))
            .unwrap();
        let failed_session = state.session().unwrap();
        let fetch_state = Arc::clone(&state);
        let fetch_url = media_url.clone();
        let fetch =
            tokio::spawn(async move { fetch_test(&fetch_state, failed_session, fetch_url).await });

        assert_eq!(receive_auth(&auth_receiver).await, "Bearer same-token");
        state
            .set_session(test_session(
                media_url.origin().ascii_serialization().as_str(),
                "same-token",
                "@a:example.org",
                0,
            ))
            .unwrap();
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(auth_receiver.try_recv().is_err());
        state
            .set_session(test_session(
                media_url.origin().ascii_serialization().as_str(),
                "changed-token",
                "@a:example.org",
                0,
            ))
            .unwrap();

        assert!(fetch.await.unwrap().is_ok());
        assert_eq!(receive_auth(&auth_receiver).await, "Bearer changed-token");
        server.join().unwrap();
    }

    #[tokio::test]
    async fn times_out_without_a_session_update() {
        let state = MediaSessionState::default();
        let session = test_session("https://matrix.example.org", "token", "@a:example.org", 1);
        assert!(state
            .wait_for_newer_session_with_timeout(&session, Duration::from_millis(20))
            .await
            .is_none());
    }

    #[tokio::test]
    async fn a_failed_retry_does_not_loop() {
        let (media_url, auth_receiver, server) = start_upstream(vec![(401, ""), (403, "")]);
        let state = Arc::new(MediaSessionState::default());
        state
            .set_session(test_session(
                media_url.origin().ascii_serialization().as_str(),
                "old-token",
                "@a:example.org",
                0,
            ))
            .unwrap();
        let failed_session = state.session().unwrap();
        let fetch_state = Arc::clone(&state);
        let fetch_url = media_url.clone();
        let fetch =
            tokio::spawn(async move { fetch_test(&fetch_state, failed_session, fetch_url).await });

        assert_eq!(receive_auth(&auth_receiver).await, "Bearer old-token");
        state
            .set_session(test_session(
                media_url.origin().ascii_serialization().as_str(),
                "new-token",
                "@a:example.org",
                0,
            ))
            .unwrap();

        assert_eq!(fetch.await.unwrap().unwrap_err(), StatusCode::FORBIDDEN);
        assert_eq!(receive_auth(&auth_receiver).await, "Bearer new-token");
        server.join().unwrap();
    }

    #[tokio::test]
    async fn clear_while_waiting_terminates_without_a_retry() {
        let (media_url, auth_receiver, server) = start_upstream(vec![(401, "")]);
        let state = Arc::new(MediaSessionState::default());
        state
            .set_session(test_session(
                media_url.origin().ascii_serialization().as_str(),
                "token",
                "@a:example.org",
                0,
            ))
            .unwrap();
        let failed_session = state.session().unwrap();
        let fetch_state = Arc::clone(&state);
        let fetch_url = media_url.clone();
        let fetch =
            tokio::spawn(async move { fetch_test(&fetch_state, failed_session, fetch_url).await });

        assert_eq!(receive_auth(&auth_receiver).await, "Bearer token");
        state.clear_session().unwrap();

        assert_eq!(fetch.await.unwrap().unwrap_err(), StatusCode::UNAUTHORIZED);
        assert!(auth_receiver.try_recv().is_err());
        server.join().unwrap();
    }

    #[tokio::test]
    async fn origin_or_scope_switch_while_waiting_terminates_without_a_retry() {
        for (origin, scope) in [
            ("https://other.example.org", "@a:example.org"),
            ("https://matrix.example.org", "@b:example.org"),
        ] {
            let state = Arc::new(MediaSessionState::default());
            state
                .set_session(test_session(
                    "https://matrix.example.org",
                    "old-token",
                    "@a:example.org",
                    0,
                ))
                .unwrap();
            let previous = state.session().unwrap();
            let waiter_state = Arc::clone(&state);
            let waiter = tokio::spawn(async move {
                waiter_state
                    .wait_for_newer_session_with_timeout(&previous, Duration::from_secs(1))
                    .await
            });

            state
                .set_session(test_session(origin, "new-token", scope, 0))
                .unwrap();

            assert!(tokio::time::timeout(Duration::from_millis(100), waiter)
                .await
                .unwrap()
                .unwrap()
                .is_none());
        }
    }

    #[tokio::test]
    async fn concurrent_cache_misses_share_the_initial_attempt_and_retry() {
        let (media_url, auth_receiver, server) = start_upstream(vec![(401, ""), (200, "data")]);
        let state = Arc::new(MediaSessionState::default());
        state
            .set_session(test_session(
                media_url.origin().ascii_serialization().as_str(),
                "old-token",
                "@a:example.org",
                0,
            ))
            .unwrap();
        let failed_session = state.session().unwrap();
        let first_state = Arc::clone(&state);
        let first_url = media_url.clone();
        let first =
            tokio::spawn(async move { fetch_test(&first_state, failed_session, first_url).await });
        let second_state = Arc::clone(&state);
        let second_session = state.session().unwrap();
        let second_url = media_url.clone();
        let second =
            tokio::spawn(
                async move { fetch_test(&second_state, second_session, second_url).await },
            );

        assert_eq!(receive_auth(&auth_receiver).await, "Bearer old-token");
        state
            .set_session(test_session(
                media_url.origin().ascii_serialization().as_str(),
                "new-token",
                "@a:example.org",
                0,
            ))
            .unwrap();

        let first_result = first.await.unwrap();
        let second_result = second.await.unwrap();
        assert!(first_result.is_ok(), "first result: {first_result:?}");
        assert!(second_result.is_ok(), "second result: {second_result:?}");
        assert_eq!(receive_auth(&auth_receiver).await, "Bearer new-token");
        assert!(auth_receiver.try_recv().is_err());
        server.join().unwrap();
    }

    #[test]
    fn mismatched_account_or_origin_never_qualifies_for_retry() {
        let failed = test_session("https://matrix.example.org", "old", "@a:example.org", 1);
        assert!(!should_retry_with_session(
            &failed,
            &test_session("https://matrix.example.org", "new", "@b:example.org", 2)
        ));
        assert!(!should_retry_with_session(
            &failed,
            &test_session("https://other.example.org", "new", "@a:example.org", 2)
        ));
    }

    #[test]
    fn session_marker_is_an_equality_guard_and_validates_decoding() {
        let matching: Uri =
            "https://sable-media.localhost/media?__sable_media_session=%40a%3Aexample.org"
                .parse()
                .unwrap();
        let mismatched: Uri =
            "https://sable-media.localhost/media?__sable_media_session=%40b%3Aexample.org"
                .parse()
                .unwrap();
        let malformed: Uri = "https://sable-media.localhost/media?__sable_media_session=%FF"
            .parse()
            .unwrap();
        let markerless: Uri = "https://sable-media.localhost/media".parse().unwrap();

        assert!(session_marker_matches(&matching, "@a:example.org").unwrap());
        assert!(!session_marker_matches(&mismatched, "@a:example.org").unwrap());
        assert_eq!(
            session_marker_matches(&malformed, "@a:example.org"),
            Err(StatusCode::BAD_REQUEST)
        );
        assert!(session_marker_matches(&markerless, "@a:example.org").unwrap());
    }

    #[tokio::test]
    async fn does_not_wait_once_a_session_has_been_cleared() {
        // After logout there is nothing to wait for, so in-flight requests must not hang.
        let state = MediaSessionState::default();
        state
            .set_session(test_session("https://example.org", "token", "scope", 0))
            .unwrap();
        state.clear_session().unwrap();

        let waited = tokio::time::timeout(
            std::time::Duration::from_millis(200),
            state.wait_for_session(),
        )
        .await
        .expect("wait_for_session should fail fast after a clear");
        assert!(waited.is_none());
    }

    #[test]
    fn client_errors_are_remembered_but_server_errors_are_not() {
        let state = MediaSessionState::default();

        state.note_client_error("cannot-thumbnail", StatusCode::BAD_REQUEST);
        assert_eq!(
            state.recent_client_error("cannot-thumbnail"),
            Some(StatusCode::BAD_REQUEST)
        );

        state.note_client_error("server-down", StatusCode::BAD_GATEWAY);
        assert_eq!(state.recent_client_error("server-down"), None);
    }

    #[test]
    fn auth_and_rate_limit_failures_stay_retryable() {
        let state = MediaSessionState::default();
        for status in [
            StatusCode::UNAUTHORIZED,
            StatusCode::FORBIDDEN,
            StatusCode::REQUEST_TIMEOUT,
            StatusCode::TOO_MANY_REQUESTS,
        ] {
            state.note_client_error("key", status);
            assert_eq!(
                state.recent_client_error("key"),
                None,
                "{status} must not be cached"
            );
        }
    }

    #[test]
    fn a_new_session_forgets_remembered_failures() {
        let state = MediaSessionState::default();
        state.note_client_error("key", StatusCode::NOT_FOUND);
        state.forget_client_errors();
        assert_eq!(state.recent_client_error("key"), None);
    }

    #[test]
    fn negative_cache_is_bounded() {
        let state = MediaSessionState::default();
        for index in 0..(super::MAX_NEGATIVE_CACHE_ENTRIES + 50) {
            state.note_client_error(&format!("key-{index}"), StatusCode::NOT_FOUND);
        }
        assert_eq!(
            state.negative_cache.lock().unwrap().len(),
            super::MAX_NEGATIVE_CACHE_ENTRIES
        );
    }

    #[test]
    fn cache_key_is_stable_and_hex() {
        let url = "https://matrix.example.org/_matrix/client/v1/media/download/x/y";
        let key = cache_key("@a:example.org", url);
        assert_eq!(key.len(), 64);
        assert!(key.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(key, cache_key("@a:example.org", url));
    }

    #[test]
    fn cache_key_is_scoped_per_account() {
        let url = "https://matrix.example.org/_matrix/client/v1/media/download/x/y";
        assert_ne!(
            cache_key("@a:example.org", url),
            cache_key("@b:example.org", url)
        );
    }

    #[test]
    fn thumbnail_requests_use_their_own_lane() {
        let thumbnail = super::Url::parse(
            "https://matrix.example.org/_matrix/client/v1/media/thumbnail/x/y?width=96",
        )
        .unwrap();
        let download =
            super::Url::parse("https://matrix.example.org/_matrix/client/v1/media/download/x/y")
                .unwrap();
        assert!(super::is_thumbnail_request(&thumbnail));
        assert!(!super::is_thumbnail_request(&download));

        let legacy =
            super::Url::parse("https://matrix.example.org/_matrix/media/v3/thumbnail/x/y").unwrap();
        assert!(super::is_thumbnail_request(&legacy));

        // A media id spelled "thumbnail" is still a download.
        let lookalike =
            super::Url::parse("https://matrix.example.org/_matrix/media/v3/download/x/thumbnail")
                .unwrap();
        assert!(!super::is_thumbnail_request(&lookalike));
    }

    #[test]
    fn retry_fragment_gives_a_distinct_cache_identity() {
        let base = "https://matrix.example.org/_matrix/client/v1/media/download/matrix.org/abc123";
        let original = cache_key("@a:example.org", base);
        assert_ne!(
            original,
            cache_key("@a:example.org", &format!("{base}#retry=1"))
        );
        assert_ne!(
            original,
            cache_key("@a:example.org", &format!("{base}#retry=2"))
        );
        assert_eq!(
            cache_key("@a:example.org", &format!("{base}#retry=1")),
            cache_key("@a:example.org", &format!("{base}#retry=1"))
        );
    }

    #[test]
    fn blank_content_types_become_octet_stream() {
        for raw in [None, Some(""), Some("   "), Some("\n")] {
            assert_eq!(normalize_content_type(raw), "application/octet-stream");
        }
    }

    #[test]
    fn real_content_types_are_kept_and_trimmed() {
        assert_eq!(normalize_content_type(Some("video/webm")), "video/webm");
        assert_eq!(normalize_content_type(Some("  video/mp4 ")), "video/mp4");
    }
}
