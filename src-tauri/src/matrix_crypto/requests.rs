//! Outgoing-request pump, shaped for matrix-js-sdk's `OutgoingRequestProcessor`.

use matrix_sdk::ruma::api::client::{
    backup::add_backup_keys::v3::Response as KeysBackupResponse,
    keys::{
        claim_keys::v3::Response as KeysClaimResponse, get_keys::v3::Response as KeysQueryResponse,
        upload_keys::v3::Response as KeysUploadResponse,
        upload_signatures::v3::Response as SignatureUploadResponse,
    },
    message::send_message_event::v3::Response as RoomMessageResponse,
    to_device::send_event_to_device::v3::Response as ToDeviceResponse,
};
use matrix_sdk::ruma::api::IncomingResponse as _;
use matrix_sdk::ruma::events::MessageLikeEventContent as _;
use matrix_sdk_crypto::types::requests::AnyOutgoingRequest;
use matrix_sdk_crypto::OlmMachine;
use serde_json::{json, Value};

use super::wasm_enums::request_type;

pub async fn outgoing_requests(machine: &OlmMachine) -> Result<Value, String> {
    let requests = machine
        .outgoing_requests()
        .await
        .map_err(|e| format!("outgoingRequests failed: {e}"))?;

    Ok(Value::Array(
        requests
            .into_iter()
            .map(|request| {
                let id = request.request_id().to_string();
                // `className` is required: js-sdk dispatches on `instanceof`.
                // `body` must be a JSON string; js-sdk forwards it verbatim.
                let mut entry = match request.request() {
                    AnyOutgoingRequest::KeysUpload(req) => json!({
                        "type": request_type::KEYS_UPLOAD,
                        "className": "KeysUploadRequest",
                        "body": json!({
                            "device_keys": req.device_keys,
                            "one_time_keys": req.one_time_keys,
                            "fallback_keys": req.fallback_keys,
                        }).to_string(),
                    }),
                    AnyOutgoingRequest::KeysQuery(req) => json!({
                        "type": request_type::KEYS_QUERY,
                        "className": "KeysQueryRequest",
                        "body": json!({
                            "timeout": req.timeout,
                            "device_keys": req.device_keys,
                        }).to_string(),
                    }),
                    AnyOutgoingRequest::KeysClaim(req) => json!({
                        "type": request_type::KEYS_CLAIM,
                        "className": "KeysClaimRequest",
                        "body": json!({
                            "timeout": req.timeout,
                            "one_time_keys": req.one_time_keys,
                        }).to_string(),
                    }),
                    AnyOutgoingRequest::ToDeviceRequest(req) => json!({
                        "type": request_type::TO_DEVICE,
                        "className": "ToDeviceRequest",
                        "body": json!({ "messages": req.messages }).to_string(),
                        "event_type": req.event_type.to_string(),
                        "txn_id": req.txn_id.to_string(),
                    }),
                    AnyOutgoingRequest::SignatureUpload(req) => json!({
                        "type": request_type::SIGNATURE_UPLOAD,
                        "className": "SignatureUploadRequest",
                        "body": json!(req.signed_keys).to_string(),
                    }),
                    AnyOutgoingRequest::RoomMessage(req) => json!({
                        "type": request_type::ROOM_MESSAGE,
                        "className": "RoomMessageRequest",
                        "body": json!(req.content).to_string(),
                        "room_id": req.room_id.to_string(),
                        "txn_id": req.txn_id.to_string(),
                        "event_type": req.content.as_ref().event_type().to_string(),
                    }),
                };
                entry["id"] = Value::String(id);
                entry
            })
            .collect(),
    ))
}

pub async fn mark_request_sent(machine: &OlmMachine, args: &Value) -> Result<Value, String> {
    let request_id = args
        .get("requestId")
        .and_then(Value::as_str)
        .ok_or_else(|| "markRequestAsSent: missing `requestId`".to_owned())?;
    let request_type = args
        .get("requestType")
        .and_then(Value::as_u64)
        .ok_or_else(|| "markRequestAsSent: missing numeric `requestType`".to_owned())?
        as u8;
    let response_body = args
        .get("response")
        .and_then(Value::as_str)
        .ok_or_else(|| "markRequestAsSent: missing `response`".to_owned())?;

    let id: matrix_sdk::ruma::OwnedTransactionId = request_id.into();

    let http_response = || {
        http::Response::builder()
            .status(http::StatusCode::OK)
            .body(response_body.as_bytes().to_vec())
            .map_err(|e| e.to_string())
    };

    macro_rules! mark {
        ($resp_ty:ty) => {{
            let parsed = <$resp_ty>::try_from_http_response(http_response()?).map_err(|e| {
                format!("markRequestAsSent: parsing type {request_type} response failed: {e}")
            })?;
            machine
                .mark_request_as_sent(&id, &parsed)
                .await
                .map_err(|e| format!("markRequestAsSent failed: {e}"))?;
        }};
    }

    match request_type {
        request_type::KEYS_UPLOAD => mark!(KeysUploadResponse),
        request_type::KEYS_QUERY => mark!(KeysQueryResponse),
        request_type::KEYS_CLAIM => mark!(KeysClaimResponse),
        request_type::TO_DEVICE => mark!(ToDeviceResponse),
        request_type::SIGNATURE_UPLOAD => mark!(SignatureUploadResponse),
        request_type::ROOM_MESSAGE => mark!(RoomMessageResponse),
        // Without this ack the backup machine never clears the batch and re-uploads forever.
        request_type::KEYS_BACKUP => mark!(KeysBackupResponse),
        other => return Err(format!("markRequestAsSent: unknown request type {other}")),
    }

    Ok(Value::Null)
}
