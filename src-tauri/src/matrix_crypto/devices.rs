//! Devices, user identities and key queries for the `OlmMachine` IPC proxy.

use std::collections::BTreeMap;
use std::time::Duration;

use matrix_sdk::ruma::api::client::keys::upload_signatures::v3::Request as SignatureUploadRequest;
use matrix_sdk::ruma::{OwnedDeviceId, UserId};
use matrix_sdk_crypto::types::Signatures;
use matrix_sdk_crypto::{
    CollectStrategy, Device, LocalTrust, OlmMachine, UserDevices, UserIdentity,
};
use serde::Serialize;
use serde_json::{json, Value};

use super::args::{str_arg, user_id};
use super::wasm_enums::{encryption_algorithm, request_type};

fn device_id(args: &Value, method: &str) -> Result<OwnedDeviceId, String> {
    Ok(str_arg(args, method, "deviceId")?.into())
}

fn timeout(args: &Value) -> Option<Duration> {
    args.get("timeoutSecs")
        .and_then(Value::as_f64)
        .map(Duration::from_secs_f64)
}

fn signatures_json(signatures: &Signatures, method: &str) -> Result<Value, String> {
    let json = serde_json::to_string(signatures)
        .map_err(|e| format!("{method}: serializing signatures failed: {e}"))?;
    Ok(json!({ "className": "Signatures", "json": json }))
}

fn key_json<T: Serialize>(key: &T, method: &str) -> Result<Value, String> {
    serde_json::to_string(key)
        .map(Value::String)
        .map_err(|e| format!("{method}: serializing cross-signing key failed: {e}"))
}

/// No `id`: that is how js-sdk knows to skip `markRequestAsSent`.
fn signature_upload_json(request: &SignatureUploadRequest) -> Value {
    json!({
        "id": Value::Null,
        "type": request_type::SIGNATURE_UPLOAD,
        "className": "SignatureUploadRequest",
        "body": json!(request.signed_keys).to_string(),
    })
}

fn device_json(device: &Device, method: &str) -> Result<Value, String> {
    let keys: BTreeMap<String, String> = device
        .keys()
        .iter()
        .map(|(key_id, key)| (key_id.to_string(), key.to_base64()))
        .collect();

    Ok(json!({
        "className": "Device",
        "userId": device.user_id(),
        "deviceId": device.device_id(),
        "displayName": device.display_name(),
        "algorithms": device
            .algorithms()
            .iter()
            .map(encryption_algorithm)
            .collect::<Vec<_>>(),
        "keys": keys,
        "signatures": signatures_json(device.signatures(), method)?,
        "curve25519Key": device.curve25519_key().map(|key| key.to_base64()),
        "ed25519Key": device.ed25519_key().map(|key| key.to_base64()),
        "localTrustState": device.local_trust_state() as u8,
        "isVerified": device.is_verified(),
        "isCrossSigningTrusted": device.is_cross_signing_trusted(),
        "isCrossSignedByOwner": device.is_cross_signed_by_owner(),
        "isLocallyTrusted": device.is_locally_trusted(),
        "isBlacklisted": device.is_blacklisted(),
        "isDeleted": device.is_deleted(),
        "isDehydrated": device.is_dehydrated(),
        "firstTimeSeen": device.first_time_seen_ts().0,
    }))
}

fn user_devices_json(devices: &UserDevices, user: &UserId, method: &str) -> Result<Value, String> {
    Ok(json!({
        "className": "UserDevices",
        "userId": user,
        "devices": devices
            .devices()
            .map(|device| device_json(&device, method))
            .collect::<Result<Vec<_>, String>>()?,
        "keys": devices.keys().map(|id| id.to_string()).collect::<Vec<_>>(),
        "isAnyVerified": devices.is_any_verified(),
    }))
}

/// `className` is required: js-sdk tells own from other identities with `instanceof`.
fn identity_json(identity: &UserIdentity, method: &str) -> Result<Value, String> {
    match identity {
        UserIdentity::Own(own) => Ok(json!({
            "className": "OwnUserIdentity",
            "userId": own.user_id(),
            "isVerified": own.is_verified(),
            "wasPreviouslyVerified": own.was_previously_verified(),
            "hasVerificationViolation": own.has_verification_violation(),
            "masterKey": key_json(own.master_key(), method)?,
            "selfSigningKey": key_json(own.self_signing_key(), method)?,
            "userSigningKey": key_json(own.user_signing_key(), method)?,
        })),
        UserIdentity::Other(other) => Ok(json!({
            "className": "OtherUserIdentity",
            "userId": other.user_id(),
            "isVerified": other.is_verified(),
            "wasPreviouslyVerified": other.was_previously_verified(),
            "hasVerificationViolation": other.has_verification_violation(),
            "identityNeedsUserApproval": other.identity_needs_user_approval(),
            "masterKey": key_json(other.master_key(), method)?,
            "selfSigningKey": key_json(other.self_signing_key(), method)?,
        })),
    }
}

async fn device_for(
    machine: &OlmMachine,
    args: &Value,
    method: &str,
) -> Result<Option<Device>, String> {
    let user = user_id(args, method, "userId")?;
    let device = device_id(args, method)?;
    machine
        .get_device(&user, &device, timeout(args))
        .await
        .map_err(|e| format!("{method} failed: {e}"))
}

async fn identity_for(
    machine: &OlmMachine,
    args: &Value,
    method: &str,
) -> Result<Option<UserIdentity>, String> {
    let user = user_id(args, method, "userId")?;
    machine
        .get_identity(&user, timeout(args))
        .await
        .map_err(|e| format!("{method} failed: {e}"))
}

async fn get_device(machine: &OlmMachine, args: &Value, method: &str) -> Result<Value, String> {
    match device_for(machine, args, method).await? {
        Some(device) => device_json(&device, method),
        None => Ok(Value::Null),
    }
}

async fn get_user_devices(
    machine: &OlmMachine,
    args: &Value,
    method: &str,
) -> Result<Value, String> {
    let user = user_id(args, method, "userId")?;
    let devices = machine
        .get_user_devices(&user, timeout(args))
        .await
        .map_err(|e| format!("{method} failed: {e}"))?;
    user_devices_json(&devices, &user, method)
}

async fn get_identity(machine: &OlmMachine, args: &Value, method: &str) -> Result<Value, String> {
    match identity_for(machine, args, method).await? {
        Some(identity) => identity_json(&identity, method),
        None => Ok(Value::Null),
    }
}

fn query_keys_for_users(machine: &OlmMachine, args: &Value, method: &str) -> Result<Value, String> {
    let users = args
        .get("users")
        .and_then(Value::as_array)
        .ok_or_else(|| format!("{method}: missing array argument `users`"))?
        .iter()
        .filter_map(Value::as_str)
        .filter_map(|id| UserId::parse(id).ok())
        .collect::<Vec<_>>();

    let (id, request) = machine.query_keys_for_users(users.iter().map(AsRef::as_ref));
    Ok(json!({
        "id": id.to_string(),
        "type": request_type::KEYS_QUERY,
        "className": "KeysQueryRequest",
        "body": super::requests::keys_query_body(
            &request.timeout,
            &json!(request.device_keys),
        ),
    }))
}

async fn verify_device(machine: &OlmMachine, args: &Value, method: &str) -> Result<Value, String> {
    let Some(device) = device_for(machine, args, method).await? else {
        return Ok(Value::Null);
    };
    let request = device
        .verify()
        .await
        .map_err(|e| format!("{method} failed: {e}"))?;
    Ok(signature_upload_json(&request))
}

async fn set_local_trust(
    machine: &OlmMachine,
    args: &Value,
    method: &str,
) -> Result<Value, String> {
    let trust = args
        .get("trustState")
        .and_then(Value::as_i64)
        .ok_or_else(|| format!("{method}: missing numeric argument `trustState`"))?;
    let Some(device) = device_for(machine, args, method).await? else {
        return Ok(Value::Null);
    };
    device
        .set_local_trust(LocalTrust::from(trust))
        .await
        .map_err(|e| format!("{method} failed: {e}"))?;
    Ok(Value::Null)
}

async fn encrypt_to_device_event(
    machine: &OlmMachine,
    args: &Value,
    method: &str,
) -> Result<Value, String> {
    let event_type = str_arg(args, method, "eventType")?;
    let content = args
        .get("content")
        .ok_or_else(|| format!("{method}: missing argument `content`"))?;
    let Some(device) = device_for(machine, args, method).await? else {
        return Err(format!("{method}: unknown device"));
    };

    let encrypted = device
        .encrypt_event_raw(&event_type, content, CollectStrategy::AllDevices)
        .await
        .map_err(|e| format!("{method} failed: {e}"))?;
    Ok(Value::String(encrypted.json().get().to_owned()))
}

async fn verify_identity(
    machine: &OlmMachine,
    args: &Value,
    method: &str,
) -> Result<Value, String> {
    let Some(identity) = identity_for(machine, args, method).await? else {
        return Ok(Value::Null);
    };
    let request = match identity {
        UserIdentity::Own(own) => own.verify().await,
        UserIdentity::Other(other) => other.verify().await,
    }
    .map_err(|e| format!("{method} failed: {e}"))?;
    Ok(signature_upload_json(&request))
}

async fn pin_identity(machine: &OlmMachine, args: &Value, method: &str) -> Result<Value, String> {
    let Some(identity) = identity_for(machine, args, method).await? else {
        return Err(format!("{method}: unknown user identity"));
    };
    identity
        .pin()
        .await
        .map_err(|e| format!("{method} failed: {e}"))?;
    Ok(Value::Null)
}

async fn withdraw_identity_verification(
    machine: &OlmMachine,
    args: &Value,
    method: &str,
) -> Result<Value, String> {
    let Some(identity) = identity_for(machine, args, method).await? else {
        return Err(format!("{method}: unknown user identity"));
    };
    identity
        .withdraw_verification()
        .await
        .map_err(|e| format!("{method} failed: {e}"))?;
    Ok(Value::Null)
}

pub async fn invoke(
    machine: &OlmMachine,
    method: &str,
    args: &Value,
) -> Option<Result<Value, String>> {
    Some(match method {
        "getDevice" => get_device(machine, args, method).await,
        "getUserDevices" => get_user_devices(machine, args, method).await,
        "getIdentity" => get_identity(machine, args, method).await,
        "queryKeysForUsers" => query_keys_for_users(machine, args, method),
        "trackedUsers" => machine
            .tracked_users()
            .await
            .map(|users| {
                Value::Array(
                    users
                        .into_iter()
                        .map(|user| Value::String(user.to_string()))
                        .collect(),
                )
            })
            .map_err(|e| format!("trackedUsers failed: {e}")),
        "sign" => match str_arg(args, method, "message") {
            Ok(message) => match machine.sign(&message).await {
                Ok(signatures) => signatures_json(&signatures, method),
                Err(e) => Err(format!("sign failed: {e}")),
            },
            Err(e) => Err(e),
        },

        "device.verify" => verify_device(machine, args, method).await,
        "device.setLocalTrust" => set_local_trust(machine, args, method).await,
        "device.encryptToDeviceEvent" => encrypt_to_device_event(machine, args, method).await,
        "userIdentity.verify" => verify_identity(machine, args, method).await,
        "userIdentity.pin" => pin_identity(machine, args, method).await,
        "userIdentity.withdrawVerification" => {
            withdraw_identity_verification(machine, args, method).await
        }

        _ => return None,
    })
}
