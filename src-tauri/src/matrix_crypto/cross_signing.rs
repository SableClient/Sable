//! Cross-signing bootstrap and private key transfer for the `OlmMachine` IPC proxy.

use matrix_sdk_crypto::types::requests::AnyOutgoingRequest;
use matrix_sdk_crypto::types::SecretsBundle;
use matrix_sdk_crypto::{CrossSigningKeyExport, OlmMachine};
use serde::Serialize;
use serde_json::{json, Map, Value};

use super::wasm_enums::request_type::{
    KEYS_UPLOAD as KEYS_UPLOAD_REQUEST_TYPE, SIGNATURE_UPLOAD as SIGNATURE_UPLOAD_REQUEST_TYPE,
};

/// Absent keys are omitted, not null: js-sdk gates on `!== undefined` and would otherwise
/// store a null into 4S. The mixed casing is wasm's own, not a typo.
#[derive(Serialize)]
struct CrossSigningKeyExportSnapshot {
    #[serde(rename = "masterKey", skip_serializing_if = "Option::is_none")]
    master_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    self_signing_key: Option<String>,
    #[serde(rename = "userSigningKey", skip_serializing_if = "Option::is_none")]
    user_signing_key: Option<String>,
}

fn opt_str_arg(args: &Value, field: &str) -> Option<String> {
    args.get(field).and_then(Value::as_str).map(str::to_owned)
}

pub async fn invoke(
    machine: &OlmMachine,
    method: &str,
    args: &Value,
) -> Option<Result<Value, String>> {
    Some(match method {
        "bootstrapCrossSigning" => bootstrap(machine, args).await,
        "exportCrossSigningKeys" => export_keys(machine).await,
        "importCrossSigningKeys" => import_keys(machine, args).await,
        "exportSecretsBundle" => export_secrets_bundle(machine).await,
        "importSecretsBundle" => import_secrets_bundle(machine, args).await,

        "pushSecretToVerifiedDevices" => push_secret(machine, args).await,

        _ => return None,
    })
}

async fn bootstrap(machine: &OlmMachine, args: &Value) -> Result<Value, String> {
    let reset = args
        .get("reset")
        .and_then(Value::as_bool)
        .ok_or_else(|| "bootstrapCrossSigning: missing boolean argument `reset`".to_owned())?;

    let requests = machine
        .bootstrap_cross_signing(reset)
        .await
        .map_err(|e| format!("bootstrapCrossSigning failed: {e}"))?;

    let upload_keys_request = match requests.upload_keys_req.as_ref() {
        Some(request) => match request.request() {
            AnyOutgoingRequest::KeysUpload(req) => json!({
                "id": request.request_id().to_string(),
                "type": KEYS_UPLOAD_REQUEST_TYPE,
                "className": "KeysUploadRequest",
                "body": json!({
                    "device_keys": req.device_keys,
                    "one_time_keys": req.one_time_keys,
                    "fallback_keys": req.fallback_keys,
                }).to_string(),
            }),
            _ => {
                return Err(
                    "bootstrapCrossSigning: upload_keys_req was not a /keys/upload request"
                        .to_owned(),
                )
            }
        },
        None => Value::Null,
    };

    let signing_keys = &requests.upload_signing_keys_req;
    let mut signing_keys_body = Map::new();
    for (field, key) in [
        ("master_key", &signing_keys.master_key),
        ("self_signing_key", &signing_keys.self_signing_key),
        ("user_signing_key", &signing_keys.user_signing_key),
    ] {
        if let Some(key) = key {
            signing_keys_body.insert(field.to_owned(), json!(key));
        }
    }

    Ok(json!({
        "uploadKeysRequest": upload_keys_request,
        "uploadSigningKeysRequest": {
            "className": "UploadSigningKeysRequest",
            "id": Value::Null,
            "body": Value::Object(signing_keys_body).to_string(),
        },
        "uploadSignaturesRequest": {
            "type": SIGNATURE_UPLOAD_REQUEST_TYPE,
            "className": "SignatureUploadRequest",
            "body": json!(requests.upload_signatures_req.signed_keys).to_string(),
        },
    }))
}

/// wasm's `self_signing_key` is snake_case while its siblings are camelCase.
async fn export_keys(machine: &OlmMachine) -> Result<Value, String> {
    let export = machine
        .export_cross_signing_keys()
        .await
        .map_err(|e| format!("exportCrossSigningKeys failed: {e}"))?;

    Ok(match export {
        Some(export) => serde_json::to_value(CrossSigningKeyExportSnapshot {
            master_key: export.master_key.clone(),
            self_signing_key: export.self_signing_key.clone(),
            user_signing_key: export.user_signing_key.clone(),
        })
        .map_err(|e| format!("exportCrossSigningKeys: serialising the export failed: {e}"))?,
        None => Value::Null,
    })
}

async fn import_keys(machine: &OlmMachine, args: &Value) -> Result<Value, String> {
    let export = CrossSigningKeyExport {
        master_key: opt_str_arg(args, "master_key"),
        self_signing_key: opt_str_arg(args, "self_signing_key"),
        user_signing_key: opt_str_arg(args, "user_signing_key"),
    };

    let status = machine
        .import_cross_signing_keys(export)
        .await
        .map_err(|e| format!("importCrossSigningKeys failed: {e}"))?;

    Ok(json!({
        "hasMaster": status.has_master,
        "hasSelfSigning": status.has_self_signing,
        "hasUserSigning": status.has_user_signing,
    }))
}

async fn export_secrets_bundle(machine: &OlmMachine) -> Result<Value, String> {
    let bundle = machine
        .store()
        .export_secrets_bundle()
        .await
        .map_err(|e| format!("exportSecretsBundle failed: {e}"))?;

    serde_json::to_value(&bundle)
        .map_err(|e| format!("exportSecretsBundle: serializing the bundle failed: {e}"))
}

async fn import_secrets_bundle(machine: &OlmMachine, args: &Value) -> Result<Value, String> {
    let bundle = args
        .get("bundle")
        .ok_or_else(|| "importSecretsBundle: missing argument `bundle`".to_owned())?;
    let bundle: SecretsBundle = serde_json::from_value(bundle.clone())
        .map_err(|e| format!("importSecretsBundle: bad bundle json: {e}"))?;

    machine
        .store()
        .import_secrets_bundle(&bundle)
        .await
        .map_err(|e| format!("importSecretsBundle failed: {e}"))?;
    Ok(Value::Null)
}

async fn push_secret(machine: &OlmMachine, args: &Value) -> Result<Value, String> {
    let name = opt_str_arg(args, "secretName")
        .ok_or_else(|| "pushSecretToVerifiedDevices: missing `secretName`".to_owned())?;

    let failures = machine
        .push_secret_to_verified_devices(name.as_str().into())
        .await
        .map_err(|e| format!("pushSecretToVerifiedDevices failed: {e}"))?;

    Ok(Value::Array(
        failures
            .keys()
            .map(|device| Value::String(device.to_string()))
            .collect(),
    ))
}

#[cfg(test)]
mod tests {
    use super::CrossSigningKeyExportSnapshot;

    #[test]
    fn absent_keys_are_omitted_so_null_is_never_stored_in_secret_storage() {
        let value = serde_json::to_value(CrossSigningKeyExportSnapshot {
            master_key: Some("master".to_owned()),
            self_signing_key: None,
            user_signing_key: None,
        })
        .unwrap();

        let object = value.as_object().unwrap();
        assert_eq!(object.get("masterKey").unwrap(), "master");
        assert!(!object.contains_key("self_signing_key"), "{value}");
        assert!(!object.contains_key("userSigningKey"), "{value}");
    }
}
