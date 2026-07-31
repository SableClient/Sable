//! Phase 0 spike for the notification crypto rework.
//! See docs/notifications-rework.md — throwaway validation code, not the final design.
//!
//! Validates:
//! 1. matrix-sdk-crypto + SqliteCryptoStore compile and link into our Tauri lib.
//! 2. An `OlmMachine` can be created on a passphrase-protected sqlite store and
//!    reopened with the same identity keys (store persistence round trip).
//! 3. A `matrix_sdk::Client` can be built on a sqlite store and a
//!    `matrix_sdk_ui::notification_client::NotificationClient` constructed with
//!    `NotificationProcessSetup::MultipleProcesses` (the Element X NSE path).
//!
//! Spike verification (offline, no homeserver):
//!   cargo test --features matrix-crypto matrix_crypto_spike

// Spike code: consumed only by tests and ad-hoc frontend invocations for now.
#![allow(dead_code)]

use serde::Serialize;
// Spike code: only referenced from tests / the frontend unless wired into a UI.
#[allow(dead_code)]
use std::path::Path;
use std::sync::Arc;

// matrix-sdk-crypto doesn't re-export ruma; use matrix_sdk's.
use matrix_sdk::ruma::{DeviceId, UserId};
use matrix_sdk_crypto::vodozemac::olm::IdentityKeys;
use matrix_sdk_crypto::OlmMachine;
use matrix_sdk_sqlite::SqliteCryptoStore;

#[derive(Debug, Serialize)]
pub struct SpikeCryptoInfo {
    pub user_id: String,
    pub device_id: String,
    pub ed25519_key: String,
    pub curve25519_key: String,
    pub store_path: String,
    pub reopen_roundtrip_ok: bool,
}

async fn open_machine(
    db_path: &Path,
    passphrase: Option<&str>,
    user: &UserId,
    device: &DeviceId,
) -> Result<(OlmMachine, IdentityKeys), String> {
    let store = SqliteCryptoStore::open(db_path, passphrase)
        .await
        .map_err(|e| format!("opening crypto store failed: {e}"))?;
    let machine = OlmMachine::with_store(user, device, Arc::new(store), None)
        .await
        .map_err(|e| format!("creating OlmMachine failed: {e}"))?;
    let keys = machine.identity_keys();
    Ok((machine, keys))
}

/// Create an `OlmMachine` on a passphrase-protected sqlite crypto store under
/// `dir`, drop it, reopen, and verify the identity keys survive the round trip.
pub async fn session_prototype(
    dir: &str,
    passphrase: Option<&str>,
    user_id: &str,
    device_id: &str,
) -> Result<SpikeCryptoInfo, String> {
    let user: &UserId = user_id.try_into().map_err(|e| format!("bad user id: {e}"))?;
    let device: &DeviceId = device_id.into();

    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let db_path = Path::new(dir).join("matrix-sdk-crypto.sqlite3");

    let (machine, keys) = open_machine(&db_path, passphrase, user, device).await?;
    drop(machine);

    let (reopened, keys2) = open_machine(&db_path, passphrase, user, device).await?;
    drop(reopened);

    Ok(SpikeCryptoInfo {
        user_id: user_id.to_owned(),
        device_id: device_id.to_owned(),
        ed25519_key: keys.ed25519.to_base64(),
        curve25519_key: keys.curve25519.to_base64(),
        store_path: db_path.display().to_string(),
        reopen_roundtrip_ok: keys == keys2,
    })
}

/// Tauri command entry point for the spike above. Invocable from the frontend
/// (or a test harness page) to sanity-check the end-to-end IPC path.
#[tauri::command]
pub async fn spike_matrix_crypto(
    dir: String,
    passphrase: Option<String>,
    user_id: String,
    device_id: String,
) -> Result<SpikeCryptoInfo, String> {
    session_prototype(&dir, passphrase.as_deref(), &user_id, &device_id).await
}

#[derive(Debug, Serialize)]
pub struct SpikeNotificationClientInfo {
    pub homeserver: String,
    pub user_id: String,
    pub device_id: String,
    pub notification_client_built: bool,
}

/// Prototype of the Element X NSE bootstrap: build a `Client` on a sqlite store,
/// restore a session, and construct the `NotificationClient` with the
/// multi-process store lock mode. Network-independent — no sync is started.
#[tauri::command]
pub async fn spike_notification_client(
    homeserver_url: String,
    store_dir: String,
    passphrase: Option<String>,
    session_json: String,
) -> Result<SpikeNotificationClientInfo, String> {
    use matrix_sdk::authentication::matrix::MatrixSession;
    use matrix_sdk::store::RoomLoadSettings;
    use matrix_sdk_ui::notification_client::{NotificationClient, NotificationProcessSetup};

    let session: MatrixSession =
        serde_json::from_str(&session_json).map_err(|e| format!("bad session json: {e}"))?;

    std::fs::create_dir_all(&store_dir).map_err(|e| e.to_string())?;
    let client = matrix_sdk::Client::builder()
        .homeserver_url(&homeserver_url)
        .sqlite_store(&store_dir, passphrase.as_deref())
        .build()
        .await
        .map_err(|e| format!("building client failed: {e}"))?;

    client
        .matrix_auth()
        .restore_session(session.clone(), RoomLoadSettings::All)
        .await
        .map_err(|e| format!("restore_session failed: {e}"))?;

    let _notification_client =
        NotificationClient::new(client, NotificationProcessSetup::MultipleProcesses)
            .await
            .map_err(|e| format!("notification client failed: {e}"))?;

    Ok(SpikeNotificationClientInfo {
        homeserver: homeserver_url,
        user_id: session.meta.user_id.to_string(),
        device_id: session.meta.device_id.to_string(),
        notification_client_built: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Offline spike: create an OlmMachine on a temp sqlite store, reopen it,
    /// and assert identity keys persist. This is the store layer the iOS NSE
    /// and Android FCM service will share with the app.
    #[tokio::test]
    async fn olm_machine_sqlite_round_trip() {
        let dir = std::env::temp_dir().join(format!("sable-crypto-spike-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        let info = session_prototype(
            dir.to_str().unwrap(),
            Some("spike-passphrase"),
            "@spike:example.org",
            "SPIKEDEVICE",
        )
        .await
        .expect("session prototype should succeed");

        assert!(info.reopen_roundtrip_ok, "identity keys must survive reopen");
        assert!(Path::new(&info.store_path).exists(), "sqlite store exists");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
