//! Deep-link forwarding for the Linux CEF build.
//!
//! CEF is one-process-per-cache, so a deep-link relaunch can't init Chromium to
//! forward itself. The primary binds a socket; the secondary forwards the URL
//! and exits before touching CEF. Delivery re-emits `deep-link://new-url`, the
//! event `@tauri-apps/plugin-deep-link`'s `onOpenUrl` already listens to.

use std::{
    io::{BufRead, BufReader, Write},
    os::unix::net::{UnixListener, UnixStream},
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    time::Duration,
};

// OIDC uses the private-use `moe.sable.app:/login?...` form; other flows `sable://`.
const SCHEMES: &[&str] = &["moe.sable.app:", "sable:"];

fn is_deep_link(arg: &str) -> bool {
    SCHEMES.iter().any(|scheme| arg.starts_with(scheme))
}

/// Stable socket path. Prefers $XDG_RUNTIME_DIR (per-user tmpfs, cleaned on
/// reboot); falls back to the temp dir.
fn socket_path() -> PathBuf {
    if let Ok(dir) = std::env::var("XDG_RUNTIME_DIR") {
        return PathBuf::from(dir).join("moe.sable.client-deeplink.sock");
    }
    std::env::temp_dir().join("moe.sable.client-deeplink.sock")
}

fn collect_deep_link_urls_from_args<I, S>(args: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .skip(1)
        .filter_map(|arg| {
            let arg = arg.as_ref();
            is_deep_link(arg).then(|| arg.to_string())
        })
        .collect()
}

pub enum ForwardResult {
    /// URLs were written to the primary's socket; the caller must exit(0).
    Forwarded,
    /// A deep-link URL was in argv but no primary is listening → become primary.
    NoPrimary,
    /// No deep-link URLs in argv; a normal launch.
    NoUrls,
}

/// Forward any `sable://` URLs in argv to the primary instance. Call BEFORE
/// any CEF initialization.
pub fn try_forward_deep_links() -> ForwardResult {
    let urls = collect_deep_link_urls_from_args(std::env::args());
    if urls.is_empty() {
        return ForwardResult::NoUrls;
    }

    let path = socket_path();
    match UnixStream::connect(&path) {
        Ok(mut stream) => {
            stream.set_write_timeout(Some(Duration::from_secs(2))).ok();
            for url in &urls {
                let _ = writeln!(stream, "{url}");
            }
            log::info!("[deep-link-ipc] forwarded {} URL(s) to primary", urls.len());
            ForwardResult::Forwarded
        }
        Err(_) => ForwardResult::NoPrimary,
    }
}

static PENDING_URLS: OnceLock<Arc<Mutex<Vec<String>>>> = OnceLock::new();
type LiveHandler = Box<dyn Fn(String) + Send + Sync>;
static LIVE_HANDLER: OnceLock<Mutex<Option<LiveHandler>>> = OnceLock::new();

fn pending_queue() -> &'static Arc<Mutex<Vec<String>>> {
    PENDING_URLS.get_or_init(|| Arc::new(Mutex::new(Vec::new())))
}
fn live_handler() -> &'static Mutex<Option<LiveHandler>> {
    LIVE_HANDLER.get_or_init(|| Mutex::new(None))
}

/// Query/fragment carry OIDC tokens — never log them.
fn redact_for_log(url: &str) -> String {
    url.split(['?', '#'])
        .next()
        .unwrap_or("<deep link>")
        .to_string()
}

fn dispatch_url(url: String) {
    if let Ok(guard) = live_handler().lock() {
        if let Some(handler) = guard.as_ref() {
            handler(url);
            return;
        }
    }
    if let Ok(mut q) = pending_queue().lock() {
        q.push(url);
    }
}

/// Removes the socket file on drop.
pub struct DeepLinkSocketGuard {
    path: PathBuf,
}
impl Drop for DeepLinkSocketGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

/// Bind the socket and spawn the listener thread. Returns `None` if a live
/// primary already holds it (or on error) — non-fatal.
pub fn bind_and_listen() -> Option<DeepLinkSocketGuard> {
    let path = socket_path();
    let listener = match UnixListener::bind(&path) {
        Ok(l) => l,
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => match UnixStream::connect(&path) {
            Ok(_) => return None, // live primary already running
            Err(_) => {
                let _ = std::fs::remove_file(&path); // stale socket from a crash
                UnixListener::bind(&path).ok()?
            }
        },
        Err(e) => {
            log::warn!("[deep-link-ipc] failed to bind {}: {e}", path.display());
            return None;
        }
    };

    std::thread::Builder::new()
        .name("deep-link-ipc".into())
        .spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(stream) => handle_connection(stream),
                    Err(_) => break,
                }
            }
        })
        .ok();
    Some(DeepLinkSocketGuard { path })
}

fn handle_connection(stream: UnixStream) {
    stream.set_read_timeout(Some(Duration::from_secs(3))).ok();
    for line in BufReader::new(stream).lines() {
        match line {
            Ok(url) if is_deep_link(&url) => {
                log::info!("[deep-link-ipc] received {}", redact_for_log(&url));
                dispatch_url(url);
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }
}

// The event tauri-plugin-deep-link's onOpenUrl listens to. Kept out of the
// emit call as a const so tauri-typegen doesn't emit a binding for it (the
// `://` can't form a valid identifier).
const NEW_URL_EVENT: &str = "deep-link://new-url";

/// Install a live handler that emits `NEW_URL_EVENT` and drain anything queued
/// before now. Call from `setup()`.
pub fn drain_pending_urls<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri::Emitter;

    let app_for_handler = app.clone();
    if let Ok(mut guard) = live_handler().lock() {
        *guard = Some(Box::new(move |url: String| {
            if let Err(e) = app_for_handler.emit(NEW_URL_EVENT, vec![url]) {
                log::warn!("[deep-link-ipc] emit failed: {e}");
            }
        }));
    }

    let pending: Vec<String> = pending_queue()
        .lock()
        .map(|mut q| std::mem::take(&mut *q))
        .unwrap_or_default();
    for url in pending {
        let _ = app.emit(NEW_URL_EVENT, vec![url]);
    }
}
