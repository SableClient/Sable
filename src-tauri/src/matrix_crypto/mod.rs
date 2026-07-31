//! Rust crypto engine for the notification rework (docs/notifications-rework.md,
//! Phase 1). Owns `OlmMachine`s on passphrase-protected sqlite stores; the TS
//! app drives it over these Tauri commands instead of matrix-sdk-crypto-wasm.
//!
//! Request pump contract (mirrors matrix-sdk-crypto-ffi):
//!  1. After open/sync-feed calls, the TS side calls `engine_outgoing_requests`,
//!     sends each over Matrix HTTPS, then calls `engine_mark_request_sent`.
//!  2. Sync feed: `engine_receive_sync_changes` per sync response, returning the
//!     decrypted to-device events for js-sdk to dispatch.
//!  3. `engine_decrypt_event` / `engine_encrypt_event` are called per room event.

#![allow(dead_code)]

use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;

use matrix_sdk::deserialized_responses::AlgorithmInfo;
use matrix_sdk::ruma::api::IncomingResponse as _;
use matrix_sdk::ruma::api::client::{
    keys::{
        claim_keys::v3::Response as KeysClaimResponse, get_keys::v3::Response as KeysQueryResponse,
        upload_keys::v3::Response as KeysUploadResponse,
        upload_signatures::v3::Response as SignatureUploadResponse,
    },
    message::send_message_event::v3::Response as RoomMessageResponse,
    sync::sync_events::DeviceLists,
    to_device::send_event_to_device::v3::Response as ToDeviceResponse,
};
use matrix_sdk::ruma::events::MessageLikeEventContent as _;
use matrix_sdk::ruma::serde::Raw;
use matrix_sdk::ruma::{OneTimeKeyAlgorithm, UInt};
use matrix_sdk_crypto::types::events::room::encrypted::EncryptedEvent;
use matrix_sdk_crypto::types::requests::AnyOutgoingRequest;
use matrix_sdk_crypto::{DecryptionSettings, EncryptionSyncChanges, OlmMachine, TrustRequirement};
use matrix_sdk_sqlite::SqliteCryptoStore;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Owned, open OlmMachines keyed by `"{user_id}|{device_id}"`.
#[derive(Default)]
pub struct CryptoEngineState {
    machines: StdMutex<HashMap<String, Arc<OlmMachine>>>,
}

impl CryptoEngineState {
    fn machine(&self, user_id: &str, device_id: &str) -> Result<Arc<OlmMachine>, String> {
        self.machines
            .lock()
            .map_err(|e| e.to_string())?
            .get(&format!("{user_id}|{device_id}"))
            .cloned()
            .ok_or_else(|| format!("no open crypto engine for {user_id}|{device_id}"))
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

#[tauri::command]
pub async fn engine_open(
    state: State<'_, CryptoEngineState>,
    dir: String,
    passphrase: Option<String>,
    user_id: String,
    device_id: String,
) -> Result<EngineInfo, String> {
    let user: &matrix_sdk::ruma::UserId =
        user_id.as_str().try_into().map_err(|e| format!("bad user id: {e}"))?;
    let device: &matrix_sdk::ruma::DeviceId = device_id.as_str().into();

    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let db_path = Path::new(&dir).join("matrix-sdk-crypto.sqlite3");

    let store = SqliteCryptoStore::open(&db_path, passphrase.as_deref())
        .await
        .map_err(|e| format!("opening crypto store failed: {e}"))?;
    let machine = OlmMachine::with_store(user, device, Arc::new(store), None)
        .await
        .map_err(|e| format!("creating OlmMachine failed: {e}"))?;
    let keys = machine.identity_keys();

    state
        .machines
        .lock()
        .map_err(|e| e.to_string())?
        .insert(format!("{user_id}|{device_id}"), Arc::new(machine));

    Ok(EngineInfo {
        user_id,
        device_id,
        ed25519_key: keys.ed25519.to_base64(),
        curve25519_key: keys.curve25519.to_base64(),
        store_path: db_path.display().to_string(),
    })
}

#[tauri::command]
pub async fn engine_close(
    state: State<'_, CryptoEngineState>,
    user_id: String,
    device_id: String,
) -> Result<bool, String> {
    Ok(state
        .machines
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&format!("{user_id}|{device_id}"))
        .is_some())
}

// ---------------------------------------------------------------- sync feed

#[derive(Debug, Deserialize)]
pub struct SyncChangesRequest {
    /// Raw to-device events as received in the sync response, each a JSON string.
    pub to_device_events: Vec<String>,
    /// `device_lists.changed` / `.left` user ids.
    pub changed_devices: Vec<String>,
    pub left_devices: Vec<String>,
    /// `device_one_time_keys_count`, e.g. {"signed_curve25519": 49}.
    pub one_time_keys_counts: HashMap<String, u64>,
    pub unused_fallback_keys: Option<Vec<String>>,
    pub next_batch_token: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SyncChangesResult {
    /// To-device events after decryption/validation, each a JSON string. This
    /// is the list js-sdk should dispatch (key receives are consumed
    /// internally).
    pub to_device_events: Vec<String>,
    /// How many room keys were received in this batch (for backup-status-style
    /// signalling on the JS side).
    pub room_keys_received: usize,
}

#[tauri::command]
pub async fn engine_receive_sync_changes(
    state: State<'_, CryptoEngineState>,
    user_id: String,
    device_id: String,
    request: SyncChangesRequest,
) -> Result<SyncChangesResult, String> {
    let machine = state.machine(&user_id, &device_id)?;

    let to_device_events = request
        .to_device_events
        .iter()
        .map(|json| {
            serde_json::value::RawValue::from_string(json.clone())
                .map(Raw::from_json)
                .map_err(|e| e.to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut device_lists = DeviceLists::new();
    device_lists.changed = request
        .changed_devices
        .iter()
        .filter_map(|u| u.as_str().try_into().ok())
        .collect();
    device_lists.left = request
        .left_devices
        .iter()
        .filter_map(|u| u.as_str().try_into().ok())
        .collect();
    let key_counts: BTreeMap<OneTimeKeyAlgorithm, UInt> = request
        .one_time_keys_counts
        .iter()
        .filter_map(|(k, v)| {
            Some((OneTimeKeyAlgorithm::from(k.as_str()), UInt::try_from(*v).ok()?))
        })
        .collect();
    let fallback_keys: Vec<OneTimeKeyAlgorithm> = request
        .unused_fallback_keys
        .unwrap_or_default()
        .iter()
        .map(|k| OneTimeKeyAlgorithm::from(k.as_str()))
        .collect();

    // Trust requirement mirrors what js-sdk's wasm crypto uses for normal
    // operation; strict cross-signing enforcement comes later in Phase 1.
    let decryption_settings = DecryptionSettings {
        sender_device_trust_requirement: TrustRequirement::Untrusted,
    };

    let (processed, room_keys) = machine
        .receive_sync_changes(
            EncryptionSyncChanges {
                to_device_events,
                changed_devices: &device_lists,
                one_time_keys_counts: &key_counts,
                unused_fallback_keys: Some(&fallback_keys),
                next_batch_token: request.next_batch_token,
            },
            &decryption_settings,
        )
        .await
        .map_err(|e| format!("receive_sync_changes failed: {e}"))?;

    let to_device_events = processed
        .iter()
        .map(|e| e.to_raw().json().get().to_owned())
        .collect::<Vec<_>>();

    Ok(SyncChangesResult {
        to_device_events,
        room_keys_received: room_keys.len(),
    })
}

// ---------------------------------------------------------- request pump

// No serde rename: tauri-typegen emits the Rust variant names verbatim and
// ignores `rename_all`, so renaming here would make the generated TypeScript
// disagree with the wire format.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Clone, Copy)]
pub enum CryptoRequestKind {
    KeysUpload,
    KeysQuery,
    KeysClaim,
    ToDevice,
    SignatureUpload,
    RoomMessage,
}

#[derive(Debug, Serialize)]
pub struct OutgoingCryptoRequest {
    pub request_id: String,
    pub kind: CryptoRequestKind,
    /// JSON body to send, as a string (see kind for the endpoint mapping,
    /// mirroring js-sdk's OutgoingRequestProcessor).
    pub body: String,
    /// Only for ToDevice: the to-device event type (e.g. "m.room.encrypted").
    pub event_type: Option<String>,
}

#[tauri::command]
pub async fn engine_outgoing_requests(
    state: State<'_, CryptoEngineState>,
    user_id: String,
    device_id: String,
) -> Result<Vec<OutgoingCryptoRequest>, String> {
    let machine = state.machine(&user_id, &device_id)?;
    let requests = machine
        .outgoing_requests()
        .await
        .map_err(|e| format!("outgoing_requests failed: {e}"))?;

    requests
        .into_iter()
        .map(|r| {
            let request_id = r.request_id().to_string();
            let (kind, body, event_type) = match r.request() {
                AnyOutgoingRequest::KeysUpload(req) => (
                    CryptoRequestKind::KeysUpload,
                    serde_json::json!({
                        "device_keys": req.device_keys,
                        "one_time_keys": req.one_time_keys,
                        "fallback_keys": req.fallback_keys,
                    }),
                    None,
                ),
                AnyOutgoingRequest::KeysQuery(req) => (
                    CryptoRequestKind::KeysQuery,
                    serde_json::json!({
                        "timeout": req.timeout,
                        "device_keys": req.device_keys,
                    }),
                    None,
                ),
                AnyOutgoingRequest::KeysClaim(req) => (
                    CryptoRequestKind::KeysClaim,
                    serde_json::json!({
                        "timeout": req.timeout,
                        "one_time_keys": req.one_time_keys,
                    }),
                    None,
                ),
                AnyOutgoingRequest::ToDeviceRequest(req) => (
                    CryptoRequestKind::ToDevice,
                    serde_json::json!({ "messages": req.messages }),
                    Some(req.event_type.to_string()),
                ),
                AnyOutgoingRequest::SignatureUpload(req) => (
                    CryptoRequestKind::SignatureUpload,
                    serde_json::json!({ "signed_keys": req.signed_keys }),
                    None,
                ),
                AnyOutgoingRequest::RoomMessage(req) => (
                    CryptoRequestKind::RoomMessage,
                    serde_json::json!({
                        "room_id": req.room_id,
                        "txn_id": req.txn_id,
                        "event_type": req.content.as_ref().event_type().to_string(),
                        "content": req.content,
                    }),
                    None,
                ),
            };
            Ok(OutgoingCryptoRequest {
                request_id,
                kind,
                body: body.to_string(),
                event_type,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn engine_mark_request_sent(
    state: State<'_, CryptoEngineState>,
    user_id: String,
    device_id: String,
    request_id: String,
    kind: CryptoRequestKind,
    response_body: String,
) -> Result<(), String> {
    let machine = state.machine(&user_id, &device_id)?;
    let id: matrix_sdk::ruma::OwnedTransactionId = request_id.as_str().into();

    let build_response = || {
        http::Response::builder()
            .status(http::StatusCode::OK)
            .body(response_body.as_bytes().to_vec())
            .map_err(|e| e.to_string())
    };

    macro_rules! mark {
        ($resp_ty:ty) => {{
            let parsed = <$resp_ty>::try_from_http_response(build_response()?)
                .map_err(|e| format!("parsing {kind:?} response failed: {e}"))?;
            machine
                .mark_request_as_sent(&id, &parsed)
                .await
                .map_err(|e| format!("mark_request_as_sent failed: {e}"))
        }};
    }
    match kind {
        CryptoRequestKind::KeysUpload => mark!(KeysUploadResponse),
        CryptoRequestKind::KeysQuery => mark!(KeysQueryResponse),
        CryptoRequestKind::KeysClaim => mark!(KeysClaimResponse),
        CryptoRequestKind::ToDevice => mark!(ToDeviceResponse),
        CryptoRequestKind::SignatureUpload => mark!(SignatureUploadResponse),
        CryptoRequestKind::RoomMessage => mark!(RoomMessageResponse),
    }
}

// ------------------------------------------------------------ room events

#[derive(Debug, Serialize)]
pub struct DecryptedEventResult {
    /// The decrypted event, as a JSON string (full event as returned by the
    /// crypto store).
    pub clear_event: String,
    pub sender_curve25519_key: Option<String>,
    pub claimed_ed25519_key: Option<String>,
    pub forwarding_curve25519_chain: Vec<String>,
    /// Debug-formatted `VerificationState` for now; Phase 1 exposes the full
    /// shield state to match js-sdk's `EventDecryptionResult`.
    pub shield: String,
    pub session_id: Option<String>,
}

#[tauri::command]
pub async fn engine_decrypt_event(
    state: State<'_, CryptoEngineState>,
    user_id: String,
    device_id: String,
    room_id: String,
    event_json: String,
) -> Result<DecryptedEventResult, String> {
    let machine = state.machine(&user_id, &device_id)?;
    let room: &matrix_sdk::ruma::RoomId =
        room_id.as_str().try_into().map_err(|e| format!("bad room id: {e}"))?;
    let event: Raw<EncryptedEvent> =
        serde_json::from_str(&event_json).map_err(|e| format!("bad event json: {e}"))?;

    let decryption_settings = DecryptionSettings {
        sender_device_trust_requirement: TrustRequirement::Untrusted,
    };

    let decrypted = machine
        .decrypt_room_event(&event, room, &decryption_settings)
        .await
        .map_err(|e| format!("decrypt_room_event failed: {e:?}"))?;

    let info = decrypted.encryption_info;
    let clear_event = decrypted.event.json().get().to_owned();

    let mut result = DecryptedEventResult {
        clear_event,
        sender_curve25519_key: None,
        claimed_ed25519_key: None,
        forwarding_curve25519_chain: vec![],
        shield: format!("{:?}", info.verification_state),
        session_id: info.session_id().map(|s| s.to_string()),
    };
    if let AlgorithmInfo::MegolmV1AesSha2 {
        curve25519_key,
        sender_claimed_keys,
        ..
    } = &info.algorithm_info
    {
        result.sender_curve25519_key = Some(curve25519_key.clone());
        result.claimed_ed25519_key = sender_claimed_keys
            .get(&matrix_sdk::ruma::DeviceKeyAlgorithm::Ed25519)
            .cloned();
    }
    Ok(result)
}

/// Encrypt `content` for `room_id`. Callers must run the outgoing-request pump
/// and retry if this errors with missing sessions.
#[tauri::command]
pub async fn engine_encrypt_event(
    state: State<'_, CryptoEngineState>,
    user_id: String,
    device_id: String,
    room_id: String,
    event_type: String,
    content_json: String,
) -> Result<String, String> {
    let machine = state.machine(&user_id, &device_id)?;
    let room: &matrix_sdk::ruma::RoomId =
        room_id.as_str().try_into().map_err(|e| format!("bad room id: {e}"))?;
    let content_box = serde_json::value::RawValue::from_string(content_json)
        .map_err(|e| format!("bad content json: {e}"))?;
    let content: Raw<matrix_sdk::ruma::events::AnyMessageLikeEventContent> =
        Raw::from_json(content_box);

    let encrypted = machine
        .encrypt_room_event_raw(room, &event_type, &content)
        .await
        .map_err(|e| format!("encrypt_room_event failed: {e:?}"))?;
    Ok(encrypted.content.json().get().to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Plumbing test: a fresh OlmMachine always wants to upload its device
    /// keys; empty syncs must not error; garbage megolm events must fail
    /// cleanly (the UTD path the JS adapter translates into decryption errors).
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

        // A fresh machine always wants to upload its device/one-time keys.
        let out = machine.outgoing_requests().await.unwrap();
        assert!(
            out.iter()
                .any(|r| matches!(r.request(), AnyOutgoingRequest::KeysUpload(_))),
            "expected at least one keys-upload request"
        );

        // Decrypting an unrelated synthetic event must fail cleanly.
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

    /// tauri-typegen emits the Rust variant names verbatim and ignores
    /// `#[serde(rename_all)]`, so the wire format has to stay PascalCase or the
    /// generated TypeScript would describe a shape the engine cannot parse.
    #[test]
    fn request_kind_wire_format_matches_generated_bindings() {
        for (kind, expected) in [
            (CryptoRequestKind::KeysUpload, "\"KeysUpload\""),
            (CryptoRequestKind::KeysQuery, "\"KeysQuery\""),
            (CryptoRequestKind::KeysClaim, "\"KeysClaim\""),
            (CryptoRequestKind::ToDevice, "\"ToDevice\""),
            (CryptoRequestKind::SignatureUpload, "\"SignatureUpload\""),
            (CryptoRequestKind::RoomMessage, "\"RoomMessage\""),
        ] {
            assert_eq!(serde_json::to_string(&kind).unwrap(), expected);
            assert_eq!(
                serde_json::from_str::<CryptoRequestKind>(expected).unwrap(),
                kind
            );
        }
    }
}
