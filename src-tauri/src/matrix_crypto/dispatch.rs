//! Generic `OlmMachine` dispatch for the IPC proxy: one Tauri command carries all
//! ~57 wasm `OlmMachine` members as a method name plus a JSON argument object.
//! Argument and return shapes mirror the wasm bindings, not the Rust API.

use std::collections::BTreeMap;

use matrix_sdk::deserialized_responses::{
    AlgorithmInfo, ProcessedToDeviceEvent, VerificationState,
};
use matrix_sdk::ruma::api::client::sync::sync_events::DeviceLists;
use matrix_sdk::ruma::events::secret::request::SecretName;
use matrix_sdk::ruma::events::{AnyMessageLikeEventContent, AnySyncMessageLikeEvent};
use matrix_sdk::ruma::serde::Raw;
use matrix_sdk::ruma::{DeviceKeyAlgorithm, OneTimeKeyAlgorithm, UInt, UserId};
use matrix_sdk_crypto::types::events::room::encrypted::EncryptedEvent;
use matrix_sdk_crypto::types::events::ToDeviceEvents;
use matrix_sdk_crypto::{EncryptionSyncChanges, OlmMachine};
use serde::Serialize;
use serde_json::{json, Value};

use super::args::{caller_decryption_settings, decryption_settings, room_id, str_arg};
use super::requests::{mark_request_sent, outgoing_requests};
use super::wasm_enums::processed_to_device_event_type;

#[derive(Serialize)]
#[serde(tag = "className")]
// Variant names mirror the WASM bindings' className tags, so the common
// `ToDeviceEvent` postfix is intentional.
#[allow(clippy::enum_variant_names)]
enum ProcessedToDeviceEventSnapshot<'a> {
    DecryptedToDeviceEvent {
        #[serde(rename = "type")]
        event_type: u8,
        #[serde(rename = "rawEvent")]
        raw_event: &'a str,
        #[serde(rename = "encryptionInfo")]
        encryption_info: ToDeviceEncryptionInfoSnapshot,
    },
    UTDToDeviceEvent {
        #[serde(rename = "type")]
        event_type: u8,
        #[serde(rename = "rawEvent")]
        raw_event: &'a str,
    },
    PlainTextToDeviceEvent {
        #[serde(rename = "type")]
        event_type: u8,
        #[serde(rename = "rawEvent")]
        raw_event: &'a str,
    },
    InvalidToDeviceEvent {
        #[serde(rename = "type")]
        event_type: u8,
        #[serde(rename = "rawEvent")]
        raw_event: &'a str,
    },
}

#[derive(Serialize)]
#[serde(tag = "className")]
enum ToDeviceEncryptionInfoSnapshot {
    ToDeviceEncryptionInfo {
        sender: String,
        #[serde(rename = "senderDevice")]
        sender_device: Option<String>,
        #[serde(rename = "senderCurve25519Key")]
        sender_curve25519_key: String,
        #[serde(rename = "isSenderVerified")]
        is_sender_verified: bool,
    },
}

fn processed_to_device_event_json(
    event: &ProcessedToDeviceEvent,
    verification_request: Option<Value>,
) -> Result<Value, String> {
    let raw_event = event.as_raw().json().get();

    let snapshot = match event {
        ProcessedToDeviceEvent::Decrypted {
            encryption_info, ..
        } => {
            let sender_curve25519_key = match &encryption_info.algorithm_info {
                AlgorithmInfo::OlmV1Curve25519AesSha2 {
                    curve25519_public_key_base64,
                } => curve25519_public_key_base64.as_str(),
                _ => {
                    return Err(
                        "receiveSyncChanges: decrypted to-device event did not use Olm v1"
                            .to_owned(),
                    )
                }
            };

            ProcessedToDeviceEventSnapshot::DecryptedToDeviceEvent {
                event_type: processed_to_device_event_type::DECRYPTED,
                raw_event,
                encryption_info: ToDeviceEncryptionInfoSnapshot::ToDeviceEncryptionInfo {
                    sender: encryption_info.sender.to_string(),
                    sender_device: encryption_info
                        .sender_device
                        .as_ref()
                        .map(ToString::to_string),
                    sender_curve25519_key: sender_curve25519_key.to_owned(),
                    is_sender_verified: matches!(
                        encryption_info.verification_state,
                        VerificationState::Verified
                    ),
                },
            }
        }
        ProcessedToDeviceEvent::UnableToDecrypt { .. } => {
            ProcessedToDeviceEventSnapshot::UTDToDeviceEvent {
                event_type: processed_to_device_event_type::UNABLE_TO_DECRYPT,
                raw_event,
            }
        }
        ProcessedToDeviceEvent::PlainText(_) => {
            ProcessedToDeviceEventSnapshot::PlainTextToDeviceEvent {
                event_type: processed_to_device_event_type::PLAIN_TEXT,
                raw_event,
            }
        }
        ProcessedToDeviceEvent::Invalid(_) => {
            ProcessedToDeviceEventSnapshot::InvalidToDeviceEvent {
                event_type: processed_to_device_event_type::INVALID,
                raw_event,
            }
        }
    };

    let mut value = serde_json::to_value(snapshot)
        .map_err(|e| format!("receiveSyncChanges: failed to serialize processed event: {e}"))?;
    if let Some(request) = verification_request {
        value["verificationRequest"] = request;
    }
    Ok(value)
}

fn verification_request_snapshot(
    machine: &OlmMachine,
    event: &ProcessedToDeviceEvent,
) -> Option<Value> {
    let ToDeviceEvents::KeyVerificationRequest(event) =
        event.as_raw().deserialize_as::<ToDeviceEvents>().ok()?
    else {
        return None;
    };
    machine
        .get_verification_request(&event.sender, &event.content.transaction_id)
        .map(|request| super::verification::request_state(&request))
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
                    serde_json::from_str::<Vec<Raw<_>>>(raw.json().get()).map_err(|e| {
                        format!("receiveSyncChanges: toDeviceEvents not an array: {e}")
                    })
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

            processed
                .iter()
                .map(|event| {
                    processed_to_device_event_json(
                        event,
                        verification_request_snapshot(machine, event),
                    )
                })
                .collect::<Result<Vec<_>, _>>()
                .map(Value::Array)
        }

        "outgoingRequests" => outgoing_requests(machine).await,
        "markRequestAsSent" => mark_request_sent(machine, &args).await,

        "receiveVerificationEvent" => {
            let room = room_id(&args, method, "roomId")?;
            let event_json = str_arg(&args, method, "event")?;
            let event: AnySyncMessageLikeEvent = serde_json::from_str(&event_json)
                .map_err(|e| format!("receiveVerificationEvent: bad event json: {e}"))?;

            machine
                .receive_verification_event(&event.into_full_event(room))
                .await
                .map_err(|e| format!("receiveVerificationEvent failed: {e}"))?;
            Ok(Value::Null)
        }

        "decryptRoomEvent" => {
            let room = room_id(&args, method, "roomId")?;
            let event_json = str_arg(&args, method, "event")?;
            let event: Raw<EncryptedEvent> = serde_json::from_str(&event_json)
                .map_err(|e| format!("decryptRoomEvent: bad event json: {e}"))?;

            let decrypted = machine
                .decrypt_room_event(&event, &room, &caller_decryption_settings(&args))
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

            // Names follow wasm's `DecryptedRoomEvent`; `event` is a JSON string, not an object.
            Ok(json!({
                "className": "DecryptedRoomEvent",
                "event": decrypted.event.json().get(),
                "sender": info.sender.to_string(),
                "senderDevice": info.sender_device.as_ref().map(ToString::to_string),
                "senderCurve25519Key": sender_curve25519_key,
                "senderClaimedEd25519Key": claimed_ed25519_key,
                "forwarder": Value::Null,
                "forwarderDevice": Value::Null,
                "forwardingCurve25519KeyChain": Vec::<String>::new(),
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
            let encrypted_json = encrypted.content.json().get();
            serde_json::from_str::<Value>(encrypted_json)
                .map_err(|e| format!("encryptRoomEvent: bad encrypted content json: {e}"))?;

            // Match wasm's JSON-string return type.
            Ok(Value::String(encrypted_json.to_owned()))
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

#[cfg(test)]
mod tests {
    use matrix_sdk::ruma::events::AnyToDeviceEvent;

    use super::*;

    #[test]
    fn plaintext_to_device_event_uses_the_wasm_wrapper_shape() {
        let raw_json = r#"{"type":"m.test","sender":"@alice:example.org","content":{}}"#;
        let raw: Raw<AnyToDeviceEvent> = serde_json::from_str(raw_json).unwrap();

        let value =
            processed_to_device_event_json(&ProcessedToDeviceEvent::PlainText(raw), None).unwrap();

        assert_eq!(
            value,
            json!({
                "className": "PlainTextToDeviceEvent",
                "type": processed_to_device_event_type::PLAIN_TEXT,
                "rawEvent": raw_json,
            })
        );
    }
}
