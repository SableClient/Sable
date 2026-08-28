//! Rust crypto engine: `OlmMachine`s on passphrase-protected sqlite stores.

pub mod args;
pub mod backup;
pub mod bundles;
pub mod cross_signing;
pub mod devices;
pub mod dispatch;
pub mod events;
#[cfg(target_os = "android")]
pub mod jni_push;
pub mod push;
pub mod requests;
pub mod rooms;
pub mod verification;
pub mod wasm_enums;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::sync::OnceLock;

use matrix_sdk_crypto::OlmMachine;
use matrix_sdk_sqlite::SqliteCryptoStore;
use serde::Serialize;
use tauri::Manager as _;

pub fn account_key(user_id: &str, device_id: &str) -> String {
    format!("{user_id}|{device_id}")
}

static ENGINES: OnceLock<CryptoEngineState> = OnceLock::new();

/// Process-global registry. Not Tauri-managed state: a push arriving while the app is
/// cold has to reach the same machines without an `AppHandle`.
pub fn engines() -> &'static CryptoEngineState {
    ENGINES.get_or_init(CryptoEngineState::default)
}

/// Owned, open OlmMachines keyed by [`account_key`].
#[derive(Default)]
pub struct CryptoEngineState {
    machines: StdMutex<HashMap<String, Arc<OlmMachine>>>,
    /// Stream-forwarding tasks per account; the streams outlive the machine, so
    /// closing an account has to abort them explicitly.
    listeners: StdMutex<HashMap<String, Vec<tokio::task::JoinHandle<()>>>>,
}

impl CryptoEngineState {
    pub fn machine(&self, user_id: &str, device_id: &str) -> Result<Arc<OlmMachine>, String> {
        self.machines
            .lock()
            .map_err(|e| e.to_string())?
            .get(&account_key(user_id, device_id))
            .cloned()
            .ok_or_else(|| format!("no open crypto engine for {user_id}|{device_id}"))
    }

    pub fn close_account(&self, account: &str) -> Result<bool, String> {
        if let Some(listeners) = self
            .listeners
            .lock()
            .map_err(|e| e.to_string())?
            .remove(account)
        {
            for listener in listeners {
                listener.abort();
            }
        }

        Ok(self
            .machines
            .lock()
            .map_err(|e| e.to_string())?
            .remove(account)
            .is_some())
    }
}

#[derive(Debug, Serialize)]
pub struct EngineInfo {
    pub user_id: String,
    pub device_id: String,
    pub ed25519_key: String,
    pub curve25519_key: String,
    pub store_path: String,
}

/// App Group that the iOS notification service extension shares with the app. An
/// extension is a separate process and can only reach the store through this container.
#[cfg(target_os = "ios")]
pub const APP_GROUP: &str = "group.moe.sable.client";

/// `None` until the App Group entitlement is present in the generated Xcode project,
/// in which case the caller falls back to the app-local directory.
#[cfg(target_os = "ios")]
fn app_group_dir() -> Option<PathBuf> {
    use objc2_foundation::{NSFileManager, NSString};

    let identifier = NSString::from_str(APP_GROUP);
    unsafe {
        let manager = NSFileManager::defaultManager();
        let url = manager.containerURLForSecurityApplicationGroupIdentifier(&identifier)?;
        url.path().map(|path| PathBuf::from(path.to_string()))
    }
}

#[cfg(not(target_os = "ios"))]
fn app_group_dir() -> Option<PathBuf> {
    None
}

/// Per-account store directory, appended to whichever base directory the platform
/// exposes to background code.
pub fn store_subpath(user_id: &str, device_id: &str) -> PathBuf {
    // `/` and `:` in a user id are not path-safe.
    let account = account_key(user_id, device_id).replace(['/', ':'], "_");
    PathBuf::from("matrix-crypto").join(account)
}

/// Per-account store directory. Resolved here rather than passed in so the
/// webview never has to know an absolute path, and so the native notification
/// handler can derive the same location independently.
fn store_dir(
    app: &tauri::AppHandle<crate::BrowserEngine>,
    user_id: &str,
    device_id: &str,
) -> Result<PathBuf, String> {
    let base = match app_group_dir() {
        Some(shared) => shared,
        None => app
            .path()
            .app_local_data_dir()
            .map_err(|e| format!("resolving app data dir failed: {e}"))?,
    };
    Ok(base.join(store_subpath(user_id, device_id)))
}

/// Opens a store and registers its machine, replacing any machine already open for the
/// account. Tauri-free so a cold push can open the same store without an `AppHandle`.
pub async fn open_machine(
    dir: &Path,
    passphrase: Option<&str>,
    user_id: &str,
    device_id: &str,
) -> Result<(Arc<OlmMachine>, EngineInfo), String> {
    let user: &matrix_sdk::ruma::UserId = user_id
        .try_into()
        .map_err(|e| format!("bad user id: {e}"))?;
    let device: &matrix_sdk::ruma::DeviceId = device_id.into();

    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|e| e.to_string())?;
    let db_path = dir.join("matrix-sdk-crypto.sqlite3");

    let account = account_key(user_id, device_id);
    engines().close_account(&account)?;

    let store = SqliteCryptoStore::open(&db_path, passphrase)
        .await
        .map_err(|e| format!("opening crypto store failed: {e}"))?;
    let machine = Arc::new(
        OlmMachine::with_store(user, device, Arc::new(store), None)
            .await
            .map_err(|e| format!("creating OlmMachine failed: {e}"))?,
    );
    let keys = machine.identity_keys();

    engines()
        .machines
        .lock()
        .map_err(|e| e.to_string())?
        .insert(account, Arc::clone(&machine));

    let info = EngineInfo {
        user_id: user_id.to_owned(),
        device_id: device_id.to_owned(),
        ed25519_key: keys.ed25519.to_base64(),
        curve25519_key: keys.curve25519.to_base64(),
        store_path: db_path.display().to_string(),
    };
    Ok((machine, info))
}

#[tauri::command]
pub async fn engine_open(
    app: tauri::AppHandle<crate::BrowserEngine>,
    dir: Option<String>,
    passphrase: Option<String>,
    user_id: String,
    device_id: String,
) -> Result<EngineInfo, String> {
    let dir = match dir {
        Some(dir) => PathBuf::from(dir),
        None => store_dir(&app, &user_id, &device_id)?,
    };

    let (machine, info) = open_machine(&dir, passphrase.as_deref(), &user_id, &device_id).await?;

    let account = account_key(&user_id, &device_id);
    let listeners = events::spawn(&app, &machine, account.clone());
    engines()
        .listeners
        .lock()
        .map_err(|e| e.to_string())?
        .insert(account, listeners);

    Ok(info)
}

#[tauri::command]
pub async fn engine_close(user_id: String, device_id: String) -> Result<bool, String> {
    engines().close_account(&account_key(&user_id, &device_id))
}

#[tauri::command]
pub async fn engine_wipe(
    app: tauri::AppHandle<crate::BrowserEngine>,
    user_id: String,
    device_id: String,
) -> Result<(), String> {
    let account = account_key(&user_id, &device_id);
    let _ = engines().close_account(&account)?;

    let dir = store_dir(&app, &user_id, &device_id)?;
    if dir.exists() {
        tokio::fs::remove_dir_all(&dir)
            .await
            .map_err(|e| format!("deleting crypto store failed: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn engine_invoke(
    user_id: String,
    device_id: String,
    method: String,
    args_json: String,
) -> Result<String, String> {
    let machine = engines().machine(&user_id, &device_id)?;
    let args: serde_json::Value = serde_json::from_str(&args_json)
        .map_err(|e| format!("engine_invoke({method}): bad args json: {e}"))?;

    let result = dispatch::invoke(&machine, &method, args).await?;
    serde_json::to_string(&result)
        .map_err(|e| format!("engine_invoke({method}): serialising result failed: {e}"))
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use matrix_sdk::ruma::api::client::sync::sync_events::DeviceLists;
    use matrix_sdk::ruma::serde::Raw;
    use matrix_sdk::ruma::{OneTimeKeyAlgorithm, UInt};
    use matrix_sdk_crypto::types::events::room::encrypted::EncryptedEvent;
    use matrix_sdk_crypto::types::requests::AnyOutgoingRequest;
    use matrix_sdk_crypto::{DecryptionSettings, EncryptionSyncChanges, TrustRequirement};

    use super::*;

    #[tokio::test]
    async fn engine_plumbing() {
        let dir = std::env::temp_dir().join(format!("sable-engine-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let user: &matrix_sdk::ruma::UserId = "@engine:example.org".try_into().unwrap();
        let device: &matrix_sdk::ruma::DeviceId = "ENGINEDEVICE".into();
        let store = SqliteCryptoStore::open(dir.join("crypto.sqlite3"), Some("pw"))
            .await
            .unwrap();
        let machine = OlmMachine::with_store(user, device, Arc::new(store), None)
            .await
            .unwrap();

        let mut device_lists = DeviceLists::new();
        device_lists.changed.push(user.to_owned());
        let counts: BTreeMap<OneTimeKeyAlgorithm, UInt> = BTreeMap::new();
        let settings = DecryptionSettings {
            sender_device_trust_requirement: TrustRequirement::Untrusted,
        };
        machine
            .receive_sync_changes(
                EncryptionSyncChanges {
                    to_device_events: vec![],
                    changed_devices: &device_lists,
                    one_time_keys_counts: &counts,
                    unused_fallback_keys: None,
                    next_batch_token: None,
                },
                &settings,
            )
            .await
            .unwrap();

        let out = machine.outgoing_requests().await.unwrap();
        assert!(
            out.iter()
                .any(|r| matches!(r.request(), AnyOutgoingRequest::KeysUpload(_))),
            "expected at least one keys-upload request"
        );

        let bogus = serde_json::json!({
            "type": "m.room.encrypted",
            "event_id": "$bogus:example.org",
            "sender": "@someone:example.org",
            "origin_server_ts": 0,
            "room_id": "!room:example.org",
            "content": {
                "algorithm": "m.megolm.v1.aes-sha2",
                "ciphertext": "AAAAAAAA",
                "sender_key": "AAAA",
                "session_id": "AAAA",
                "device_id": "X",
            },
        });
        let raw: Raw<EncryptedEvent> = serde_json::from_value(bogus).unwrap();
        let room: &matrix_sdk::ruma::RoomId = "!room:example.org".try_into().unwrap();
        let result = machine.decrypt_room_event(&raw, room, &settings).await;
        assert!(result.is_err(), "bogus megolm event must not decrypt");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn identity_reads_and_room_key_round_trip() {
        let dir = std::env::temp_dir().join(format!("sable-engine-1c-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let user: &matrix_sdk::ruma::UserId = "@engine:example.org".try_into().unwrap();
        let device: &matrix_sdk::ruma::DeviceId = "ENGINEDEVICE".into();
        let store = SqliteCryptoStore::open(dir.join("crypto.sqlite3"), Some("pw"))
            .await
            .unwrap();
        let machine = OlmMachine::with_store(user, device, Arc::new(store), None)
            .await
            .unwrap();

        let status = machine.cross_signing_status().await;
        assert!(!status.has_master);
        assert!(!status.has_self_signing);
        assert!(!status.has_user_signing);

        let other: &matrix_sdk::ruma::UserId = "@other:example.org".try_into().unwrap();
        assert!(machine
            .get_device(other, "NODEVICE".into(), None)
            .await
            .unwrap()
            .is_none());
        assert!(machine.get_identity(other, None).await.unwrap().is_none());

        let exported = machine.store().export_room_keys(|_| true).await.unwrap();
        assert_eq!(serde_json::to_string(&exported).unwrap(), "[]");

        let result = machine
            .store()
            .import_exported_room_keys(exported, |_, _| {})
            .await
            .unwrap();
        assert_eq!(result.imported_count, 0);
        assert_eq!(result.total_count, 0);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
