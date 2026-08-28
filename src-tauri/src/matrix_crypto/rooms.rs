//! Per-room encryption settings and megolm sessions for the `OlmMachine` IPC proxy.

use std::time::Duration;

use matrix_sdk::deserialized_responses::{
    AlgorithmInfo, ShieldState, ShieldStateCode, VerificationState,
};
use matrix_sdk::ruma::events::room::history_visibility::HistoryVisibility;
use matrix_sdk::ruma::serde::Raw;
use matrix_sdk::ruma::{DeviceKeyAlgorithm, OwnedUserId, UserId};
use matrix_sdk_crypto::olm::EncryptionSettings;
use matrix_sdk_crypto::store::types::RoomSettings;
use matrix_sdk_crypto::types::events::room::encrypted::EncryptedEvent;
use matrix_sdk_crypto::types::EventEncryptionAlgorithm;
use matrix_sdk_crypto::{CollectStrategy, OlmMachine};
use serde_json::{json, Value};

use super::args::{room_id, str_arg};
use super::wasm_enums::{encryption_algorithm as algorithm_to_wasm, request_type};

fn user_ids(args: &Value, method: &str, field: &str) -> Result<Vec<OwnedUserId>, String> {
    args.get(field)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("{method}: missing array argument `{field}`"))?
        .iter()
        .map(|id| {
            let id = id
                .as_str()
                .ok_or_else(|| format!("{method}: `{field}` must contain user id strings"))?;
            UserId::parse(id).map_err(|e| format!("{method}: bad user id `{id}` in `{field}`: {e}"))
        })
        .collect()
}

fn as_u64(value: &Value) -> Option<u64> {
    match value {
        Value::Number(n) => n.as_u64().or_else(|| {
            let f = n.as_f64()?;
            (f >= 0.0).then_some(f as u64)
        }),
        Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

fn algorithm(value: &Value, method: &str) -> Result<EventEncryptionAlgorithm, String> {
    match value {
        Value::Number(_) => match as_u64(value) {
            Some(0) => Ok(EventEncryptionAlgorithm::OlmV1Curve25519AesSha2),
            Some(1) => Ok(EventEncryptionAlgorithm::MegolmV1AesSha2),
            _ => Err(format!("{method}: unsupported algorithm {value}")),
        },
        Value::String(name) => Ok(EventEncryptionAlgorithm::from(name.as_str())),
        _ => Err(format!(
            "{method}: `algorithm` must be a number or a string"
        )),
    }
}

fn history_visibility(value: &Value, method: &str) -> Result<HistoryVisibility, String> {
    match value {
        Value::Number(_) => match as_u64(value) {
            Some(0) => Ok(HistoryVisibility::Invited),
            Some(1) => Ok(HistoryVisibility::Joined),
            Some(2) => Ok(HistoryVisibility::Shared),
            Some(3) => Ok(HistoryVisibility::WorldReadable),
            _ => Err(format!("{method}: unknown history visibility {value}")),
        },
        Value::String(name) => Ok(HistoryVisibility::from(name.as_str())),
        _ => Err(format!(
            "{method}: `historyVisibility` must be a number or a string"
        )),
    }
}

fn collect_strategy(value: Option<&Value>, method: &str) -> Result<CollectStrategy, String> {
    match value {
        None | Some(Value::Null) => Ok(CollectStrategy::AllDevices),
        Some(Value::String(name)) => match name.as_str() {
            "allDevices" => Ok(CollectStrategy::AllDevices),
            "errorOnVerifiedUserProblem" => Ok(CollectStrategy::ErrorOnVerifiedUserProblem),
            "identityBasedStrategy" => Ok(CollectStrategy::IdentityBasedStrategy),
            "onlyTrustedDevices" => Ok(CollectStrategy::OnlyTrustedDevices),
            other => Err(format!("{method}: unknown sharing strategy `{other}`")),
        },
        Some(Value::Object(fields)) => {
            let flag = |name: &str| fields.get(name).and_then(Value::as_bool).unwrap_or(false);
            if flag("identityBasedStrategy") {
                Ok(CollectStrategy::IdentityBasedStrategy)
            } else if flag("onlyAllowTrustedDevices") {
                Ok(CollectStrategy::OnlyTrustedDevices)
            } else if flag("errorOnVerifiedUserProblem") {
                Ok(CollectStrategy::ErrorOnVerifiedUserProblem)
            } else {
                Ok(CollectStrategy::AllDevices)
            }
        }
        Some(_) => Err(format!(
            "{method}: `sharingStrategy` must be a string or an object"
        )),
    }
}

fn encryption_settings(args: &Value, method: &str) -> Result<EncryptionSettings, String> {
    let settings = args
        .get("encryptionSettings")
        .ok_or_else(|| format!("{method}: missing object argument `encryptionSettings`"))?;

    let mut out = EncryptionSettings::default();
    if let Some(value) = settings.get("algorithm") {
        out.algorithm = algorithm(value, method)?;
    }
    if let Some(value) = settings.get("historyVisibility") {
        out.history_visibility = history_visibility(value, method)?;
    }
    if let Some(micros) = settings.get("rotationPeriod").and_then(as_u64) {
        out.rotation_period = Duration::from_micros(micros);
    }
    if let Some(count) = settings.get("rotationPeriodMessages").and_then(as_u64) {
        out.rotation_period_msgs = count;
    }
    out.sharing_strategy = collect_strategy(settings.get("sharingStrategy"), method)?;
    Ok(out)
}

fn room_settings(args: &Value, method: &str) -> Result<RoomSettings, String> {
    let settings = args
        .get("settings")
        .ok_or_else(|| format!("{method}: missing object argument `settings`"))?;

    let mut out = RoomSettings::default();
    if let Some(value) = settings.get("algorithm") {
        out.algorithm = algorithm(value, method)?;
    }
    out.only_allow_trusted_devices = settings
        .get("onlyAllowTrustedDevices")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    out.session_rotation_period = settings
        .get("sessionRotationPeriodMs")
        .and_then(as_u64)
        .map(Duration::from_millis);
    out.session_rotation_period_messages = settings
        .get("sessionRotationPeriodMessages")
        .and_then(as_u64)
        .map(|count| count as usize);
    Ok(out)
}

fn shield_state_json(state: ShieldState) -> Value {
    let (color, code, message) = match state {
        ShieldState::Red { code, message } => (0, Some(code), Some(message)),
        ShieldState::Grey { code, message } => (1, Some(code), Some(message)),
        ShieldState::None => (2, None, None),
    };
    json!({
        "color": color,
        "code": code.map(|code| match code {
            ShieldStateCode::AuthenticityNotGuaranteed => 0,
            ShieldStateCode::UnknownDevice => 1,
            ShieldStateCode::UnsignedDevice => 2,
            ShieldStateCode::UnverifiedIdentity => 3,
            ShieldStateCode::VerificationViolation => 4,
            ShieldStateCode::MismatchedSender => 5,
        }),
        "message": message,
    })
}

fn shield_states_json(state: &VerificationState) -> (Value, Value) {
    (
        shield_state_json(state.to_shield_state_lax()),
        shield_state_json(state.to_shield_state_strict()),
    )
}

pub async fn invoke(
    machine: &OlmMachine,
    method: &str,
    args: &Value,
) -> Option<Result<Value, String>> {
    Some(match method {
        "getRoomSettings" => {
            let room = match room_id(args, method, "roomId") {
                Ok(room) => room,
                Err(e) => return Some(Err(e)),
            };
            match machine.room_settings(&room).await {
                Ok(Some(settings)) => Ok(json!({
                    "algorithm": algorithm_to_wasm(&settings.algorithm),
                    "encryptStateEvents": false,
                    "onlyAllowTrustedDevices": settings.only_allow_trusted_devices,
                    "sessionRotationPeriodMs": settings
                        .session_rotation_period
                        .map(|period| period.as_millis() as u64),
                    "sessionRotationPeriodMessages": settings
                        .session_rotation_period_messages
                        .map(|count| count as u64),
                })),
                Ok(None) => Ok(Value::Null),
                Err(e) => Err(format!("getRoomSettings failed: {e}")),
            }
        }
        "setRoomSettings" => {
            let room = match room_id(args, method, "roomId") {
                Ok(room) => room,
                Err(e) => return Some(Err(e)),
            };
            let settings = match room_settings(args, method) {
                Ok(settings) => settings,
                Err(e) => return Some(Err(e)),
            };
            machine
                .set_room_settings(&room, &settings)
                .await
                .map(|()| Value::Null)
                .map_err(|e| format!("setRoomSettings failed: {e}"))
        }

        "shareRoomKey" => {
            let room = match room_id(args, method, "roomId") {
                Ok(room) => room,
                Err(e) => return Some(Err(e)),
            };
            let users = match user_ids(args, method, "users") {
                Ok(users) => users,
                Err(e) => return Some(Err(e)),
            };
            let settings = match encryption_settings(args, method) {
                Ok(settings) => settings,
                Err(e) => return Some(Err(e)),
            };

            match machine
                .share_room_key(&room, users.iter().map(AsRef::as_ref), settings)
                .await
            {
                Ok(requests) => Ok(Value::Array(
                    requests
                        .into_iter()
                        .map(|request| {
                            json!({
                                "type": request_type::TO_DEVICE,
                                "className": "ToDeviceRequest",
                                "id": request.txn_id.to_string(),
                                "event_type": request.event_type.to_string(),
                                "txn_id": request.txn_id.to_string(),
                                "body": json!({ "messages": request.messages }).to_string(),
                            })
                        })
                        .collect(),
                )),
                Err(e) => Err(format!("shareRoomKey failed: {e:?}")),
            }
        }
        "getMissingSessions" => {
            let users = match user_ids(args, method, "users") {
                Ok(users) => users,
                Err(e) => return Some(Err(e)),
            };
            match machine
                .get_missing_sessions(users.iter().map(AsRef::as_ref))
                .await
            {
                Ok(Some((txn_id, request))) => Ok(json!({
                    "type": request_type::KEYS_CLAIM,
                    "className": "KeysClaimRequest",
                    "id": txn_id.to_string(),
                    "body": super::requests::keys_claim_body(
                        &request.timeout,
                        &json!(request.one_time_keys),
                    ),
                })),
                Ok(None) => Ok(Value::Null),
                Err(e) => Err(format!("getMissingSessions failed: {e}")),
            }
        }
        "invalidateGroupSession" => {
            let room = match room_id(args, method, "roomId") {
                Ok(room) => room,
                Err(e) => return Some(Err(e)),
            };
            machine
                .discard_room_key(&room)
                .await
                .map(Value::Bool)
                .map_err(|e| format!("invalidateGroupSession failed: {e}"))
        }

        "getRoomEventEncryptionInfo" => {
            let room = match room_id(args, method, "roomId") {
                Ok(room) => room,
                Err(e) => return Some(Err(e)),
            };
            let event_json = match str_arg(args, method, "event") {
                Ok(json) => json,
                Err(e) => return Some(Err(e)),
            };
            let event: Raw<EncryptedEvent> = match serde_json::from_str(&event_json) {
                Ok(event) => event,
                Err(e) => {
                    return Some(Err(format!(
                        "getRoomEventEncryptionInfo: bad event json: {e}"
                    )))
                }
            };

            match machine.get_room_event_encryption_info(&event, &room).await {
                Ok(info) => {
                    let AlgorithmInfo::MegolmV1AesSha2 {
                        curve25519_key,
                        sender_claimed_keys,
                        ..
                    } = &info.algorithm_info
                    else {
                        return Some(Err(
                            "getRoomEventEncryptionInfo: event was not encrypted with megolm v1"
                                .to_owned(),
                        ));
                    };
                    let (lax, strict) = shield_states_json(&info.verification_state);
                    Ok(json!({
                        // Without this js-sdk's `shieldState()` call hits a plain object.
                        "className": "EncryptionInfo",
                        "sender": info.sender.to_string(),
                        "senderDevice": info.sender_device.as_ref().map(ToString::to_string),
                        "senderCurve25519Key": curve25519_key,
                        "senderClaimedEd25519Key": sender_claimed_keys
                            .get(&DeviceKeyAlgorithm::Ed25519),
                        "forwarder": info
                            .forwarder
                            .as_ref()
                            .map(|forwarder| forwarder.user_id.to_string()),
                        "forwarderDevice": info
                            .forwarder
                            .as_ref()
                            .map(|forwarder| forwarder.device_id.to_string()),
                        "shieldStateLax": lax,
                        "shieldStateStrict": strict,
                    }))
                }
                Err(e) => Err(format!("getRoomEventEncryptionInfo failed: {e:?}")),
            }
        }

        // Gated in matrix-sdk-crypto 0.18 behind `experimental-encrypted-state-events`.
        "encryptStateEvent" => Err(
            "encryptStateEvent: state-event encryption requires matrix-sdk-crypto's \
             `experimental-encrypted-state-events` feature, which this build does not enable"
                .to_owned(),
        ),

        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use matrix_sdk_crypto::CollectStrategy;

    use super::{collect_strategy, encryption_settings};

    #[test]
    fn parses_every_sharing_strategy_the_webview_can_send() {
        let cases = [
            (
                "identityBasedStrategy",
                CollectStrategy::IdentityBasedStrategy,
            ),
            ("onlyTrustedDevices", CollectStrategy::OnlyTrustedDevices),
            (
                "errorOnVerifiedUserProblem",
                CollectStrategy::ErrorOnVerifiedUserProblem,
            ),
            ("allDevices", CollectStrategy::AllDevices),
        ];

        for (name, expected) in cases {
            let parsed = collect_strategy(Some(&json!(name)), "shareRoomKey")
                .unwrap_or_else(|e| panic!("{name}: {e}"));
            assert_eq!(
                std::mem::discriminant(&parsed),
                std::mem::discriminant(&expected),
                "{name} parsed to the wrong strategy"
            );
        }
    }

    #[test]
    fn rejects_an_unknown_strategy_rather_than_silently_sharing_with_everyone() {
        let error = collect_strategy(Some(&json!("somethingElse")), "shareRoomKey").unwrap_err();
        assert!(error.contains("somethingElse"), "{error}");
    }

    #[test]
    fn reads_the_settings_shape_the_webview_encodes() {
        let settings = encryption_settings(
            &json!({
                "encryptionSettings": {
                    "algorithm": 1,
                    "historyVisibility": 2,
                    "rotationPeriod": 604_800_000_000u64,
                    "rotationPeriodMessages": 100,
                    "sharingStrategy": "onlyTrustedDevices",
                }
            }),
            "shareRoomKey",
        )
        .unwrap();

        assert_eq!(settings.rotation_period_msgs, 100);
        assert_eq!(settings.rotation_period.as_secs(), 604_800);
        assert_eq!(
            std::mem::discriminant(&settings.sharing_strategy),
            std::mem::discriminant(&CollectStrategy::OnlyTrustedDevices),
        );
    }
}
