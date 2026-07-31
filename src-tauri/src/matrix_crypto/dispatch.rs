//! Generic `OlmMachine` dispatch for the IPC proxy: one Tauri command carries all
//! ~57 wasm `OlmMachine` members as a method name plus a JSON argument object.
//! Argument and return shapes mirror the wasm bindings, not the Rust API.

use std::collections::BTreeMap;

use matrix_sdk::deserialized_responses::AlgorithmInfo;
use matrix_sdk::ruma::api::client::sync::sync_events::DeviceLists;
use matrix_sdk::ruma::events::secret::request::SecretName;
use matrix_sdk::ruma::events::AnyMessageLikeEventContent;
use matrix_sdk::ruma::serde::Raw;
use matrix_sdk::ruma::{DeviceKeyAlgorithm, OneTimeKeyAlgorithm, RoomId, UInt, UserId};
use matrix_sdk_crypto::types::events::room::encrypted::EncryptedEvent;
use matrix_sdk_crypto::{DecryptionSettings, EncryptionSyncChanges, OlmMachine, TrustRequirement};
use serde_json::{json, Value};

use super::requests::{outgoing_requests, mark_request_sent};

fn str_arg(args: &Value, method: &str, field: &str) -> Result<String, String> {
    args.get(field)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| format!("{method}: missing string argument `{field}`"))
}

fn user_id(args: &Value, method: &str, field: &str) -> Result<matrix_sdk::ruma::OwnedUserId, String> {
    let raw = str_arg(args, method, field)?;
    UserId::parse(&raw).map_err(|e| format!("{method}: bad user id in `{field}`: {e}"))
}

fn room_id(args: &Value, method: &str, field: &str) -> Result<matrix_sdk::ruma::OwnedRoomId, String> {
    let raw = str_arg(args, method, field)?;
    RoomId::parse(&raw).map_err(|e| format!("{method}: bad room id in `{field}`: {e}"))
}

fn decryption_settings() -> DecryptionSettings {
    DecryptionSettings {
        sender_device_trust_requirement: TrustRequirement::Untrusted,
    }
}

pub async fn invoke(machine: &OlmMachine, method: &str, args: Value) -> Result<Value, String> {
    match method {
        "identityKeys" => {
            let keys = machine.identity_keys();
            Ok(json!({
                "ed25519": keys.ed25519.to_base64(),
                "curve25519": keys.curve25519.to_base64(),
            }))
        }
        "deviceCreationTimeMs" => Ok(json!(machine.device_creation_time().get())),

        "receiveSyncChanges" => {
            let to_device_events = args
                .get("toDeviceEvents")
                .and_then(Value::as_str)
                .map(|raw| {
                    serde_json::value::RawValue::from_string(raw.to_owned())
                        .map(Raw::from_json)
                        .map_err(|e| format!("receiveSyncChanges: bad toDeviceEvents json: {e}"))
                })
                .transpose()?
                .map(|raw: Raw<Value>| {
                    serde_json::from_str::<Vec<Raw<_>>>(raw.json().get())
                        .map_err(|e| format!("receiveSyncChanges: toDeviceEvents not an array: {e}"))
                })
                .transpose()?
                .unwrap_or_default();

            let mut device_lists = DeviceLists::new();
            device_lists.changed = args
                .get("changedDevices")
                .and_then(Value::as_array)
                .map(|ids| {
                    ids.iter()
                        .filter_map(Value::as_str)
                        .filter_map(|id| UserId::parse(id).ok())
                        .collect()
                })
                .unwrap_or_default();
            device_lists.left = args
                .get("leftDevices")
                .and_then(Value::as_array)
                .map(|ids| {
                    ids.iter()
                        .filter_map(Value::as_str)
                        .filter_map(|id| UserId::parse(id).ok())
                        .collect()
                })
                .unwrap_or_default();

            let key_counts: BTreeMap<OneTimeKeyAlgorithm, UInt> = args
                .get("oneTimeKeysCounts")
                .and_then(Value::as_object)
                .map(|counts| {
                    counts
                        .iter()
                        .filter_map(|(alg, count)| {
                            Some((
                                OneTimeKeyAlgorithm::from(alg.as_str()),
                                UInt::try_from(count.as_u64()?).ok()?,
                            ))
                        })
                        .collect()
                })
                .unwrap_or_default();

            let fallback_keys: Vec<OneTimeKeyAlgorithm> = args
                .get("unusedFallbackKeys")
                .and_then(Value::as_array)
                .map(|keys| {
                    keys.iter()
                        .filter_map(Value::as_str)
                        .map(OneTimeKeyAlgorithm::from)
                        .collect()
                })
                .unwrap_or_default();

            let (processed, _room_keys) = machine
                .receive_sync_changes(
                    EncryptionSyncChanges {
                        to_device_events,
                        changed_devices: &device_lists,
                        one_time_keys_counts: &key_counts,
                        unused_fallback_keys: Some(&fallback_keys),
                        next_batch_token: args
                            .get("nextBatchToken")
                            .and_then(Value::as_str)
                            .map(str::to_owned),
                    },
                    &decryption_settings(),
                )
                .await
                .map_err(|e| format!("receiveSyncChanges failed: {e}"))?;

            Ok(Value::Array(
                processed
                    .iter()
                    .map(|event| {
                        serde_json::from_str::<Value>(event.to_raw().json().get())
                            .unwrap_or(Value::Null)
                    })
                    .collect(),
            ))
        }

        "outgoingRequests" => outgoing_requests(machine).await,
        "markRequestAsSent" => mark_request_sent(machine, &args).await,

        "decryptRoomEvent" => {
            let room = room_id(&args, method, "roomId")?;
            let event_json = str_arg(&args, method, "event")?;
            let event: Raw<EncryptedEvent> = serde_json::from_str(&event_json)
                .map_err(|e| format!("decryptRoomEvent: bad event json: {e}"))?;

            let decrypted = machine
                .decrypt_room_event(&event, &room, &decryption_settings())
                .await
                .map_err(|e| format!("decryptRoomEvent failed: {e:?}"))?;

            let info = decrypted.encryption_info;
            let (sender_curve25519_key, claimed_ed25519_key) = match &info.algorithm_info {
                AlgorithmInfo::MegolmV1AesSha2 {
                    curve25519_key,
                    sender_claimed_keys,
                    ..
                } => (
                    Some(curve25519_key.clone()),
                    sender_claimed_keys
                        .get(&DeviceKeyAlgorithm::Ed25519)
                        .cloned(),
                ),
                _ => (None, None),
            };

            Ok(json!({
                "clearEvent": serde_json::from_str::<Value>(decrypted.event.json().get())
                    .map_err(|e| format!("decryptRoomEvent: bad clear event json: {e}"))?,
                "senderCurve25519Key": sender_curve25519_key,
                "claimedEd25519Key": claimed_ed25519_key,
                "forwardingCurve25519KeyChain": Vec::<String>::new(),
                "verificationState": format!("{:?}", info.verification_state),
                "sessionId": info.session_id().map(str::to_owned),
            }))
        }
        "encryptRoomEvent" => {
            let room = room_id(&args, method, "roomId")?;
            let event_type = str_arg(&args, method, "eventType")?;
            let content_json = str_arg(&args, method, "content")?;
            let content_box = serde_json::value::RawValue::from_string(content_json)
                .map_err(|e| format!("encryptRoomEvent: bad content json: {e}"))?;
            let content: Raw<AnyMessageLikeEventContent> = Raw::from_json(content_box);

            let encrypted = machine
                .encrypt_room_event_raw(&room, &event_type, &content)
                .await
                .map_err(|e| format!("encryptRoomEvent failed: {e:?}"))?;
            serde_json::from_str::<Value>(encrypted.content.json().get())
                .map_err(|e| format!("encryptRoomEvent: bad encrypted content json: {e}"))
        }

        "getSecretsFromInbox" => {
            let name: SecretName = str_arg(&args, method, "secretName")?.as_str().into();
            let secrets = machine
                .store()
                .get_secrets_from_inbox(&name)
                .await
                .map_err(|e| format!("getSecretsFromInbox failed: {e}"))?;
            Ok(Value::Array(
                secrets
                    .into_iter()
                    .map(|secret| Value::String(secret.as_str().to_owned()))
                    .collect(),
            ))
        }
        "deleteSecretsFromInbox" => {
            let name: SecretName = str_arg(&args, method, "secretName")?.as_str().into();
            machine
                .store()
                .delete_secrets_from_inbox(&name)
                .await
                .map_err(|e| format!("deleteSecretsFromInbox failed: {e}"))?;
            Ok(Value::Null)
        }

        "crossSigningStatus" => {
            let status = machine.cross_signing_status().await;
            Ok(json!({
                "hasMaster": status.has_master,
                "hasSelfSigning": status.has_self_signing,
                "hasUserSigning": status.has_user_signing,
            }))
        }

        "updateTrackedUsers" => {
            let users = args
                .get("users")
                .and_then(Value::as_array)
                .ok_or_else(|| format!("{method}: missing array argument `users`"))?
                .iter()
                .filter_map(Value::as_str)
                .filter_map(|id| UserId::parse(id).ok())
                .collect::<Vec<_>>();
            machine
                .update_tracked_users(users.iter().map(AsRef::as_ref))
                .await
                .map_err(|e| format!("updateTrackedUsers failed: {e}"))?;
            Ok(Value::Null)
        }
        "markAllTrackedUsersAsDirty" => {
            machine
                .mark_all_tracked_users_as_dirty()
                .await
                .map_err(|e| format!("markAllTrackedUsersAsDirty failed: {e}"))?;
            Ok(Value::Null)
        }

        other => {
            if let Some(result) = super::devices::invoke(machine, other, &args).await {
                return result;
            }
            if let Some(result) = super::cross_signing::invoke(machine, other, &args).await {
                return result;
            }
            if let Some(result) = super::backup::invoke(machine, other, &args).await {
                return result;
            }
            if let Some(result) = super::rooms::invoke(machine, other, &args).await {
                return result;
            }
            if let Some(result) = super::verification::invoke(machine, other, &args).await {
                return result;
            }
            if let Some(result) = super::bundles::invoke(machine, other, &args).await {
                return result;
            }
            Err(format!(
                "OlmMachine method not implemented by the Rust engine: {other}"
            ))
        }
    }
}
