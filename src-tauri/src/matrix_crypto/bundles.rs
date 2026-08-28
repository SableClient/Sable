//! Room key bundles (MSC4268) and dehydrated devices for the `OlmMachine` IPC proxy.

use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::sync::{Arc, Mutex, OnceLock};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use matrix_sdk::ruma::events::room::EncryptedFile;
use matrix_sdk_crypto::dehydrated_devices::RehydratedDevice;
use matrix_sdk_crypto::store::types::{
    Changes, DehydratedDeviceKey, RoomPendingKeyBundleDetails, StoredRoomKeyBundleData,
};
use matrix_sdk_crypto::types::events::room_key_bundle::RoomKeyBundleContent;
use matrix_sdk_crypto::types::room_history::RoomKeyBundle;
use matrix_sdk_crypto::{
    AttachmentDecryptor, AttachmentEncryptor, CollectStrategy, MediaEncryptionInfo, OlmMachine,
};
use serde_json::{json, Map, Value};
use zeroize::Zeroizing;

use super::args::{decryption_settings, room_id, str_arg, user_id};
use super::events::room_key_json;
use super::wasm_enums::request_type::TO_DEVICE as REQUEST_TYPE_TO_DEVICE;

/// Never put the key in an error: it would end up in a log line.
fn dehydration_key(args: &Value, method: &str) -> Result<DehydratedDeviceKey, String> {
    let raw = str_arg(args, method, "dehydratedDeviceKey")?;
    let bytes = BASE64
        .decode(raw)
        .map_err(|_| format!("{method}: `dehydratedDeviceKey` is not valid base64"))?;
    DehydratedDeviceKey::from_slice(&bytes)
        .map_err(|e| format!("{method}: unusable dehydrated device key: {e}"))
}

fn collect_strategy(args: &Value, method: &str) -> Result<CollectStrategy, String> {
    match args.get("sharingStrategy").and_then(Value::as_str) {
        None | Some("identityBasedStrategy") => Ok(CollectStrategy::IdentityBasedStrategy),
        Some("allDevices") => Ok(CollectStrategy::AllDevices),
        Some("errorOnVerifiedUserProblem") => Ok(CollectStrategy::ErrorOnVerifiedUserProblem),
        Some("onlyTrustedDevices") => Ok(CollectStrategy::OnlyTrustedDevices),
        Some(other) => Err(format!("{method}: unknown sharing strategy `{other}`")),
    }
}

fn pending_details_json(details: &RoomPendingKeyBundleDetails) -> Value {
    json!({
        "roomId": details.room_id.to_string(),
        "inviterId": details.inviter.to_string(),
        "inviteAcceptedAtMillis": u64::from(details.invite_accepted_at.0),
    })
}

fn stored_bundle_json(data: &StoredRoomKeyBundleData) -> Result<Value, String> {
    let encryption_info =
        serde_json::to_string(&MediaEncryptionInfo::from(data.bundle_data.file.clone()))
            .map_err(|e| format!("getReceivedRoomKeyBundleData: bad encryption info: {e}"))?;
    Ok(json!({
        "senderUser": data.sender_user.to_string(),
        "roomId": data.bundle_data.room_id.to_string(),
        "url": data.bundle_data.file.url.to_string(),
        "encryptionInfo": encryption_info,
    }))
}

/// Must persist across the paged `/dehydrated_device/{id}/events` fetches.
type RehydratedDevices = Mutex<HashMap<String, (String, Arc<RehydratedDevice>)>>;

fn rehydrated_devices() -> &'static RehydratedDevices {
    static DEVICES: OnceLock<RehydratedDevices> = OnceLock::new();
    DEVICES.get_or_init(Default::default)
}

fn account_key(machine: &OlmMachine) -> String {
    super::account_key(machine.user_id().as_str(), machine.device_id().as_str())
}

pub async fn invoke(
    machine: &OlmMachine,
    method: &str,
    args: &Value,
) -> Option<Result<Value, String>> {
    Some(match method {
        "getAllRoomsPendingKeyBundles" => machine
            .store()
            .get_all_rooms_pending_key_bundles()
            .await
            .map_err(|e| format!("getAllRoomsPendingKeyBundles failed: {e}"))
            .map(|rooms| Value::Array(rooms.iter().map(pending_details_json).collect())),

        "getPendingKeyBundleDetailsForRoom" => match room_id(args, method, "roomId") {
            Ok(room) => machine
                .store()
                .get_pending_key_bundle_details_for_room(&room)
                .await
                .map_err(|e| format!("getPendingKeyBundleDetailsForRoom failed: {e}"))
                .map(|details| {
                    details
                        .as_ref()
                        .map(pending_details_json)
                        .unwrap_or(Value::Null)
                }),
            Err(e) => Err(e),
        },

        "storeRoomPendingKeyBundle" => store_room_pending_key_bundle(machine, method, args).await,

        "clearRoomPendingKeyBundle" => match room_id(args, method, "roomId") {
            Ok(room) => machine
                .store()
                .clear_room_pending_key_bundle(&room)
                .await
                .map_err(|e| format!("clearRoomPendingKeyBundle failed: {e}"))
                .map(|()| Value::Null),
            Err(e) => Err(e),
        },

        "getReceivedRoomKeyBundleData" => received_bundle_data(machine, method, args).await,
        "receiveRoomKeyBundle" => receive_bundle(machine, method, args).await,

        "hasDownloadedAllRoomKeys" => match room_id(args, method, "roomId") {
            Ok(room) => machine
                .store()
                .has_downloaded_all_room_keys(&room)
                .await
                .map_err(|e| format!("hasDownloadedAllRoomKeys failed: {e}"))
                .map(Value::Bool),
            Err(e) => Err(e),
        },
        "setHasDownloadedAllRoomKeys" => match room_id(args, method, "roomId") {
            Ok(room) => machine
                .store()
                .save_changes(Changes {
                    room_key_backups_fully_downloaded: [room].into_iter().collect(),
                    ..Default::default()
                })
                .await
                .map_err(|e| format!("setHasDownloadedAllRoomKeys failed: {e}"))
                .map(|()| Value::Null),
            Err(e) => Err(e),
        },
        "buildRoomKeyBundle" => build_bundle(machine, method, args).await,
        "shareRoomKeyBundleData" => share_bundle_data(machine, method, args).await,

        "dehydratedDevices.getDehydratedDeviceKey" => machine
            .dehydrated_devices()
            .get_dehydrated_device_pickle_key()
            .await
            .map_err(|e| format!("{method} failed: {e}"))
            .map(|key| match key {
                Some(key) => Value::String(key.to_base64()),
                None => Value::Null,
            }),
        "dehydratedDevices.saveDehydratedDeviceKey" => match dehydration_key(args, method) {
            Ok(key) => machine
                .dehydrated_devices()
                .save_dehydrated_device_pickle_key(&key)
                .await
                .map_err(|e| format!("{method} failed: {e}"))
                .map(|()| Value::Null),
            Err(e) => Err(e),
        },
        "dehydratedDevices.deleteDehydratedDeviceKey" => machine
            .dehydrated_devices()
            .delete_dehydrated_device_pickle_key()
            .await
            .map_err(|e| format!("{method} failed: {e}"))
            .map(|()| Value::Null),

        "dehydratedDevices.create" => Ok(Value::Null),
        "dehydratedDevices.keysForUpload" => keys_for_upload(machine, method, args).await,

        "dehydratedDevices.rehydrate" => rehydrate(machine, method, args).await,
        "dehydratedDevices.receiveEvents" => receive_dehydrated_events(machine, method, args).await,

        _ => return None,
    })
}

async fn store_room_pending_key_bundle(
    machine: &OlmMachine,
    method: &str,
    args: &Value,
) -> Result<Value, String> {
    let room = room_id(args, method, "roomId")?;
    let inviter = user_id(args, method, "inviterId")?;
    machine
        .store()
        .store_room_pending_key_bundle(&room, &inviter)
        .await
        .map_err(|e| format!("storeRoomPendingKeyBundle failed: {e}"))?;
    Ok(Value::Null)
}

async fn received_bundle_data(
    machine: &OlmMachine,
    method: &str,
    args: &Value,
) -> Result<Value, String> {
    let room = room_id(args, method, "roomId")?;
    let inviter = user_id(args, method, "inviterId")?;
    let data = machine
        .store()
        .get_received_room_key_bundle_data(&room, &inviter)
        .await
        .map_err(|e| format!("getReceivedRoomKeyBundleData failed: {e}"))?;
    match data {
        Some(data) => stored_bundle_json(&data),
        None => Ok(Value::Null),
    }
}

async fn receive_bundle(machine: &OlmMachine, method: &str, args: &Value) -> Result<Value, String> {
    let room = room_id(args, method, "roomId")?;
    let inviter = user_id(args, method, "inviterId")?;
    let encrypted = BASE64
        .decode(str_arg(args, method, "bundle")?)
        .map_err(|e| format!("receiveRoomKeyBundle: `bundle` is not valid base64: {e}"))?;

    let info = machine
        .store()
        .get_received_room_key_bundle_data(&room, &inviter)
        .await
        .map_err(|e| format!("receiveRoomKeyBundle failed: {e}"))?
        .ok_or_else(|| {
            format!("receiveRoomKeyBundle: no stored bundle data for {room} from {inviter}")
        })?;

    let bundle: RoomKeyBundle = {
        let mut cursor = Cursor::new(encrypted.as_slice());
        let mut decryptor = AttachmentDecryptor::new(
            &mut cursor,
            MediaEncryptionInfo::from(info.bundle_data.file.clone()),
        )
        .map_err(|e| format!("receiveRoomKeyBundle: bundle is not decryptable: {e}"))?;

        let mut decrypted = Zeroizing::new(Vec::new());
        decryptor
            .read_to_end(&mut decrypted)
            .map_err(|e| format!("receiveRoomKeyBundle: decrypting the bundle failed: {e}"))?;
        serde_json::from_slice(&decrypted)
            .map_err(|e| format!("receiveRoomKeyBundle: malformed bundle: {e}"))?
    };

    machine
        .store()
        .receive_room_key_bundle(&info, bundle, |_, _| {})
        .await
        .map_err(|e| format!("receiveRoomKeyBundle failed: {e}"))?;
    Ok(Value::Null)
}

async fn build_bundle(machine: &OlmMachine, method: &str, args: &Value) -> Result<Value, String> {
    let room = room_id(args, method, "roomId")?;
    let bundle = machine
        .store()
        .build_room_key_bundle(&room)
        .await
        .map_err(|e| format!("buildRoomKeyBundle failed: {e}"))?;

    if bundle.is_empty() {
        return Ok(Value::Null);
    }

    let json = Zeroizing::new(
        serde_json::to_vec(&bundle)
            .map_err(|e| format!("buildRoomKeyBundle: serialising the bundle failed: {e}"))?,
    );
    let mut cursor = Cursor::new(json.as_slice());
    let mut encryptor = AttachmentEncryptor::new(&mut cursor);
    let mut encrypted = Vec::new();
    encryptor
        .read_to_end(&mut encrypted)
        .map_err(|e| format!("buildRoomKeyBundle: encrypting the bundle failed: {e}"))?;
    let encryption_info = serde_json::to_string(&encryptor.finish())
        .map_err(|e| format!("buildRoomKeyBundle: bad encryption info: {e}"))?;

    Ok(json!({
        "encryptedData": BASE64.encode(&encrypted),
        "mediaEncryptionInfo": encryption_info,
    }))
}

async fn share_bundle_data(
    machine: &OlmMachine,
    method: &str,
    args: &Value,
) -> Result<Value, String> {
    let user = user_id(args, method, "userId")?;
    let room = room_id(args, method, "roomId")?;
    let url = str_arg(args, method, "url")?;
    let strategy = collect_strategy(args, method)?;

    let mut file_json: Value = serde_json::from_str(&str_arg(args, method, "mediaEncryptionInfo")?)
        .map_err(|e| format!("shareRoomKeyBundleData: bad media encryption info: {e}"))?;
    file_json
        .as_object_mut()
        .ok_or_else(|| {
            "shareRoomKeyBundleData: `mediaEncryptionInfo` must be an object".to_owned()
        })?
        .insert("url".to_owned(), Value::String(url));
    let file: EncryptedFile = serde_json::from_value(file_json)
        .map_err(|e| format!("shareRoomKeyBundleData: unusable bundle file: {e}"))?;

    let requests = machine
        .share_room_key_bundle_data(
            &user,
            &strategy,
            RoomKeyBundleContent {
                room_id: room,
                file,
            },
        )
        .await
        .map_err(|e| format!("shareRoomKeyBundleData failed: {e}"))?;

    Ok(Value::Array(
        requests
            .iter()
            .map(|request| {
                json!({
                    "type": REQUEST_TYPE_TO_DEVICE,
                    "className": "ToDeviceRequest",
                    "id": request.txn_id.to_string(),
                    "event_type": request.event_type.to_string(),
                    "txn_id": request.txn_id.to_string(),
                    "body": json!({ "messages": request.messages }).to_string(),
                })
            })
            .collect(),
    ))
}

async fn keys_for_upload(
    machine: &OlmMachine,
    method: &str,
    args: &Value,
) -> Result<Value, String> {
    let display_name = str_arg(args, method, "initialDeviceDisplayName")?;
    let key = dehydration_key(args, method)?;

    let devices = machine.dehydrated_devices();
    let device = devices
        .create()
        .await
        .map_err(|e| format!("{method}: creating the dehydrated device failed: {e}"))?;
    let request = device
        .keys_for_upload(display_name, &key)
        .await
        .map_err(|e| format!("{method} failed: {e}"))?;

    let mut body = Map::new();
    body.insert("device_id".to_owned(), json!(request.device_id));
    body.insert("device_data".to_owned(), json!(request.device_data));
    body.insert("device_keys".to_owned(), json!(request.device_keys));
    if let Some(name) = &request.initial_device_display_name {
        body.insert("initial_device_display_name".to_owned(), json!(name));
    }
    if !request.one_time_keys.is_empty() {
        body.insert("one_time_keys".to_owned(), json!(request.one_time_keys));
    }
    if !request.fallback_keys.is_empty() {
        body.insert("fallback_keys".to_owned(), json!(request.fallback_keys));
    }
    let body = Value::Object(body);

    Ok(json!({
        "className": "PutDehydratedDeviceRequest",
        "id": Value::Null,
        "body": body.to_string(),
    }))
}

async fn rehydrate(machine: &OlmMachine, method: &str, args: &Value) -> Result<Value, String> {
    let key = dehydration_key(args, method)?;
    let device_id = str_arg(args, method, "deviceId")?;
    let device_data = serde_json::from_str(&str_arg(args, method, "deviceData")?)
        .map_err(|e| format!("{method}: bad device data json: {e}"))?;

    let device = machine
        .dehydrated_devices()
        .rehydrate(&key, device_id.as_str().into(), device_data)
        .await
        .map_err(|e| format!("{method} failed: {e}"))?;

    rehydrated_devices()
        .lock()
        .map_err(|e| format!("{method}: rehydrated device registry poisoned: {e}"))?
        .insert(account_key(machine), (device_id.clone(), Arc::new(device)));

    Ok(json!({ "deviceId": device_id }))
}

async fn receive_dehydrated_events(
    machine: &OlmMachine,
    method: &str,
    args: &Value,
) -> Result<Value, String> {
    let device_id = str_arg(args, method, "deviceId")?;
    let events = serde_json::from_str(&str_arg(args, method, "toDeviceEvents")?)
        .map_err(|e| format!("{method}: bad to-device events json: {e}"))?;

    let device = {
        let registry = rehydrated_devices()
            .lock()
            .map_err(|e| format!("{method}: rehydrated device registry poisoned: {e}"))?;
        match registry.get(&account_key(machine)) {
            Some((id, device)) if *id == device_id => Arc::clone(device),
            _ => {
                return Err(format!(
                    "{method}: device {device_id} has not been rehydrated"
                ))
            }
        }
    };

    let room_keys = device
        .receive_events(events, &decryption_settings())
        .await
        .map_err(|e| format!("{method} failed: {e}"))?;
    Ok(Value::Array(room_keys.iter().map(room_key_json).collect()))
}
