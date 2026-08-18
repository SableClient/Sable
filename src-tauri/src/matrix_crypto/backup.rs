//! Server-side key backup and room-key import/export for the `OlmMachine` IPC proxy.

use std::collections::BTreeMap;

use matrix_sdk::ruma::RoomId;
use matrix_sdk_crypto::backups::{MegolmV1BackupKey, SignatureState};
use matrix_sdk_crypto::olm::{BackedUpRoomKey, ExportedRoomKey};
use matrix_sdk_crypto::store::types::BackupDecryptionKey;
use matrix_sdk_crypto::types::RoomKeyBackupInfo;
use matrix_sdk_crypto::{OlmMachine, RoomKeyImportResult};
use serde_json::{json, Value};

use super::args::str_arg;
use super::wasm_enums::request_type::KEYS_BACKUP as REQUEST_TYPE_KEYS_BACKUP;

pub async fn invoke(
    machine: &OlmMachine,
    method: &str,
    args: &Value,
) -> Option<Result<Value, String>> {
    match handle(machine, method, args).await {
        Ok(Some(value)) => Some(Ok(value)),
        Ok(None) => None,
        Err(error) => Some(Err(error)),
    }
}

fn signature_state(state: SignatureState) -> u8 {
    match state {
        SignatureState::Missing => 0,
        SignatureState::Invalid => 1,
        SignatureState::ValidButNotTrusted => 2,
        SignatureState::ValidAndTrusted => 3,
    }
}

fn ignore_progress(_progress: usize, _total: usize) {}

fn import_result(result: RoomKeyImportResult) -> Value {
    json!({
        "importedCount": result.imported_count,
        "totalCount": result.total_count,
        "keys": result.keys,
    })
}

async fn handle(machine: &OlmMachine, method: &str, args: &Value) -> Result<Option<Value>, String> {
    let value = match method {
        "getBackupKeys" => {
            let keys = machine
                .backup_machine()
                .get_backup_keys()
                .await
                .map_err(|e| format!("getBackupKeys failed: {e}"))?;
            json!({
                "className": "BackupKeys",
                "backupVersion": keys.backup_version,
                "decryptionKeyBase64": keys.decryption_key.map(|key| key.to_base64()),
            })
        }
        "saveBackupDecryptionKey" => {
            let version = str_arg(args, method, "version")?;
            // Never let the key itself reach a log or an error string.
            let key = BackupDecryptionKey::from_base64(&str_arg(args, method, "decryptionKey")?)
                .map_err(|e| format!("saveBackupDecryptionKey: bad decryption key: {e}"))?;
            machine
                .backup_machine()
                .save_decryption_key(Some(key), Some(version))
                .await
                .map_err(|e| format!("saveBackupDecryptionKey failed: {e}"))?;
            Value::Null
        }

        "enableBackupV1" => {
            let version = str_arg(args, method, "version")?;
            let key = MegolmV1BackupKey::from_base64(&str_arg(args, method, "publicKeyBase64")?)
                .map_err(|e| format!("enableBackupV1: bad public key: {e}"))?;
            key.set_version(version);
            machine
                .backup_machine()
                .enable_backup_v1(key)
                .await
                .map_err(|e| format!("enableBackupV1 failed: {e}"))?;
            Value::Null
        }
        "disableBackup" => {
            machine
                .backup_machine()
                .disable_backup()
                .await
                .map_err(|e| format!("disableBackup failed: {e}"))?;
            Value::Null
        }
        "isBackupEnabled" => Value::Bool(machine.backup_machine().enabled().await),
        "verifyBackup" => {
            let info = args
                .get("backupInfo")
                .ok_or_else(|| format!("{method}: missing argument `backupInfo`"))?;
            let info: RoomKeyBackupInfo = serde_json::from_value(info.clone())
                .map_err(|e| format!("verifyBackup: bad backupInfo: {e}"))?;
            let verification = machine
                .backup_machine()
                .verify_backup(info, false)
                .await
                .map_err(|e| format!("verifyBackup failed: {e}"))?;
            json!({
                "className": "SignatureVerification",
                "deviceState": signature_state(verification.device_signature),
                "userState": signature_state(verification.user_identity_signature),
                "trusted": verification.trusted(),
            })
        }
        "roomKeyCounts" => {
            let counts = machine
                .backup_machine()
                .room_key_counts()
                .await
                .map_err(|e| format!("roomKeyCounts failed: {e}"))?;
            json!({ "total": counts.total, "backedUp": counts.backed_up })
        }

        "backupRoomKeys" => {
            let pending = machine
                .backup_machine()
                .backup()
                .await
                .map_err(|e| format!("backupRoomKeys failed: {e}"))?;
            match pending {
                Some((id, request)) => json!({
                    "type": REQUEST_TYPE_KEYS_BACKUP,
                    "className": "KeysBackupRequest",
                    "id": id.to_string(),
                    "version": request.version,
                    "body": json!({ "rooms": request.rooms }).to_string(),
                }),
                None => Value::Null,
            }
        }

        "importBackedUpRoomKeys" => {
            let backup_version = str_arg(args, method, "backupVersion")?;
            let rooms = args
                .get("keys")
                .and_then(Value::as_object)
                .ok_or_else(|| format!("{method}: missing object argument `keys`"))?;

            let mut exported = Vec::new();
            for (room, sessions) in rooms {
                let room = RoomId::parse(room)
                    .map_err(|e| format!("importBackedUpRoomKeys: bad room id: {e}"))?;
                let sessions: BTreeMap<String, BackedUpRoomKey> =
                    serde_json::from_value(sessions.clone()).map_err(|e| {
                        format!("importBackedUpRoomKeys: bad keys for room {room}: {e}")
                    })?;
                exported.extend(sessions.into_iter().map(|(session_id, key)| {
                    ExportedRoomKey::from_backed_up_room_key(room.clone(), session_id, key)
                }));
            }

            let result = machine
                .store()
                .import_room_keys(exported, Some(&backup_version), ignore_progress)
                .await
                .map_err(|e| format!("importBackedUpRoomKeys failed: {e}"))?;
            import_result(result)
        }
        "importExportedRoomKeys" => {
            let keys: Vec<ExportedRoomKey> = serde_json::from_str(&str_arg(args, method, "keys")?)
                .map_err(|e| format!("importExportedRoomKeys: bad key export json: {e}"))?;
            let result = machine
                .store()
                .import_exported_room_keys(keys, ignore_progress)
                .await
                .map_err(|e| format!("importExportedRoomKeys failed: {e}"))?;
            import_result(result)
        }
        "exportRoomKeys" => {
            let keys = machine
                .store()
                .export_room_keys(|_| true)
                .await
                .map_err(|e| format!("exportRoomKeys failed: {e}"))?;
            Value::String(
                serde_json::to_string(&keys)
                    .map_err(|e| format!("exportRoomKeys: serialising the export failed: {e}"))?,
            )
        }

        _ => return Ok(None),
    };

    Ok(Some(value))
}
