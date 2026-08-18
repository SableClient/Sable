//! Argument parsing shared by the `OlmMachine` dispatch modules.

use matrix_sdk::ruma::{OwnedRoomId, OwnedUserId, RoomId, UserId};
use matrix_sdk_crypto::{DecryptionSettings, TrustRequirement};
use serde_json::Value;

pub fn str_arg(args: &Value, method: &str, field: &str) -> Result<String, String> {
    args.get(field)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| format!("{method}: missing string argument `{field}`"))
}

pub fn room_id(args: &Value, method: &str, field: &str) -> Result<OwnedRoomId, String> {
    let raw = str_arg(args, method, field)?;
    RoomId::parse(&raw).map_err(|e| format!("{method}: bad room id in `{field}`: {e}"))
}

pub fn user_id(args: &Value, method: &str, field: &str) -> Result<OwnedUserId, String> {
    let raw = str_arg(args, method, field)?;
    UserId::parse(&raw).map_err(|e| format!("{method}: bad user id in `{field}`: {e}"))
}

pub fn decryption_settings() -> DecryptionSettings {
    DecryptionSettings {
        sender_device_trust_requirement: TrustRequirement::Untrusted,
    }
}

/// Codes are wasm's `TrustRequirement`; anything unrecognised stays permissive.
pub fn caller_decryption_settings(args: &Value) -> DecryptionSettings {
    let requirement = args
        .get("decryptionSettings")
        .and_then(|settings| settings.get("senderDeviceTrustRequirement"))
        .and_then(Value::as_u64);

    DecryptionSettings {
        sender_device_trust_requirement: match requirement {
            Some(1) => TrustRequirement::CrossSignedOrLegacy,
            Some(2) => TrustRequirement::CrossSigned,
            _ => TrustRequirement::Untrusted,
        },
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn requirement(args: &Value) -> TrustRequirement {
        caller_decryption_settings(args).sender_device_trust_requirement
    }

    #[test]
    fn reads_the_callers_trust_requirement() {
        let args = json!({ "decryptionSettings": { "senderDeviceTrustRequirement": 1 } });
        assert!(matches!(
            requirement(&args),
            TrustRequirement::CrossSignedOrLegacy
        ));

        let args = json!({ "decryptionSettings": { "senderDeviceTrustRequirement": 2 } });
        assert!(matches!(requirement(&args), TrustRequirement::CrossSigned));
    }

    #[test]
    fn falls_back_to_untrusted_when_absent_or_unknown() {
        assert!(matches!(
            requirement(&json!({})),
            TrustRequirement::Untrusted
        ));

        let args = json!({ "decryptionSettings": { "senderDeviceTrustRequirement": 99 } });
        assert!(matches!(requirement(&args), TrustRequirement::Untrusted));
    }

    #[test]
    fn rejects_a_missing_string_argument() {
        let error = str_arg(&json!({}), "someMethod", "roomId").unwrap_err();
        assert!(error.contains("someMethod"), "{error}");
        assert!(error.contains("roomId"), "{error}");
    }
}
