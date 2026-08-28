//! Forwards the engine's change streams to the webview as Tauri events.

use futures_util::StreamExt as _;
use matrix_sdk_crypto::store::types::{RoomKeyInfo, RoomKeyWithheldInfo};
use matrix_sdk_crypto::OlmMachine;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter as _};
use tokio::task::JoinHandle;

use super::wasm_enums::encryption_algorithm;

pub const ROOM_KEYS_RECEIVED: &str = "matrix-crypto://room-keys-received";
pub const ROOM_KEYS_WITHHELD: &str = "matrix-crypto://room-keys-withheld";
pub const IDENTITIES_UPDATED: &str = "matrix-crypto://identities-updated";
pub const SECRET_RECEIVED: &str = "matrix-crypto://secret-received";

pub(super) fn room_key_json(info: &RoomKeyInfo) -> Value {
    json!({
        "algorithm": encryption_algorithm(&info.algorithm),
        "roomId": info.room_id.to_string(),
        "senderKey": info.sender_key.to_base64(),
        "sessionId": info.session_id,
    })
}

fn withheld_json(info: &RoomKeyWithheldInfo) -> Value {
    json!({
        "roomId": info.room_id.to_string(),
        "sessionId": info.session_id,
    })
}

/// One task per stream. The returned handles must be aborted when the engine is
/// closed: the streams outlive the machine, so they would otherwise keep the
/// listeners alive for an account that is no longer open.
pub fn spawn(
    app: &AppHandle<crate::BrowserEngine>,
    machine: &OlmMachine,
    account: String,
) -> Vec<JoinHandle<()>> {
    let store = machine.store();

    let mut room_keys = store.room_keys_received_stream();
    let mut withheld = store.room_keys_withheld_received_stream();
    let mut identities = store.identities_stream_raw();
    let mut secrets = store.secrets_stream();

    let emit = |app: AppHandle<crate::BrowserEngine>,
                event: &'static str,
                account: String,
                payload: Value| {
        // A failed emit means the webview is gone; the abort on close is what
        // stops these tasks, so there is nothing to recover here.
        let _ = app.emit(event, json!({ "account": account, "payload": payload }));
    };

    vec![
        tokio::spawn({
            let (app, account) = (app.clone(), account.clone());
            async move {
                while let Some(update) = room_keys.next().await {
                    // Lagging drops updates rather than ending the stream; js-sdk
                    // recovers on the next key or a retry, so keep listening.
                    if let Ok(keys) = update {
                        let payload = Value::Array(keys.iter().map(room_key_json).collect());
                        emit(app.clone(), ROOM_KEYS_RECEIVED, account.clone(), payload);
                    }
                }
            }
        }),
        tokio::spawn({
            let (app, account) = (app.clone(), account.clone());
            async move {
                while let Some(sessions) = withheld.next().await {
                    let payload = Value::Array(sessions.iter().map(withheld_json).collect());
                    emit(app.clone(), ROOM_KEYS_WITHHELD, account.clone(), payload);
                }
            }
        }),
        tokio::spawn({
            let (app, account) = (app.clone(), account.clone());
            async move {
                while let Some((identity_changes, device_changes)) = identities.next().await {
                    let identity_users: Vec<String> = identity_changes
                        .new
                        .iter()
                        .chain(identity_changes.changed.iter())
                        .map(|identity| identity.user_id().to_string())
                        .collect();
                    let device_users: Vec<String> = device_changes
                        .new
                        .iter()
                        .chain(device_changes.changed.iter())
                        .map(|device| device.user_id().to_string())
                        .collect();
                    emit(
                        app.clone(),
                        IDENTITIES_UPDATED,
                        account.clone(),
                        json!({ "identities": identity_users, "devices": device_users }),
                    );
                }
            }
        }),
        tokio::spawn({
            let (app, account) = (app.clone(), account.clone());
            async move {
                while let Some(secret) = secrets.next().await {
                    // Only the name travels: js-sdk re-reads the value from the
                    // inbox, and the value must not sit in an event payload.
                    emit(
                        app.clone(),
                        SECRET_RECEIVED,
                        account.clone(),
                        json!({ "name": secret.secret_name.to_string() }),
                    );
                }
            }
        }),
    ]
}
