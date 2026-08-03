//! Interactive verification (SAS and QR) for the `OlmMachine` IPC proxy.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use matrix_sdk::ruma::events::key::verification::VerificationMethod;
use matrix_sdk::ruma::events::room::message::RoomMessageEventContent;
use matrix_sdk::ruma::events::AnyMessageLikeEventContent;
use matrix_sdk::ruma::events::MessageLikeEventContent as _;
use matrix_sdk::ruma::{EventId, OwnedDeviceId, OwnedUserId, RoomId, TransactionId, UserId};
use matrix_sdk_crypto::matrix_sdk_qrcode::QrVerificationData;
use matrix_sdk_crypto::types::requests::{OutgoingVerificationRequest, RoomMessageRequest};
use matrix_sdk_crypto::{
    CancelInfo, Device, OlmMachine, OtherUserIdentity, OwnUserIdentity, QrVerification,
    QrVerificationState, Sas, UserIdentity, Verification, VerificationRequest,
    VerificationRequestState,
};
use serde_json::{json, Value};

use super::wasm_enums::request_type::{
    ROOM_MESSAGE as REQUEST_TYPE_ROOM_MESSAGE, SIGNATURE_UPLOAD as REQUEST_TYPE_SIGNATURE_UPLOAD,
    TO_DEVICE as REQUEST_TYPE_TO_DEVICE,
};

fn str_arg(args: &Value, method: &str, field: &str) -> Result<String, String> {
    args.get(field)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| format!("{method}: missing string argument `{field}`"))
}

fn flow(args: &Value, method: &str) -> Result<(OwnedUserId, String), String> {
    let raw = str_arg(args, method, "userId")?;
    let user = UserId::parse(&raw).map_err(|e| format!("{method}: bad user id in `userId`: {e}"))?;
    Ok((user, str_arg(args, method, "flowId")?))
}

fn request(machine: &OlmMachine, args: &Value, method: &str) -> Result<VerificationRequest, String> {
    let (user, flow_id) = flow(args, method)?;
    machine
        .get_verification_request(&user, &flow_id)
        .ok_or_else(|| format!("{method}: no verification request for {user} / {flow_id}"))
}

fn sas(machine: &OlmMachine, args: &Value, method: &str) -> Result<Sas, String> {
    let (user, flow_id) = flow(args, method)?;
    machine
        .get_verification(&user, &flow_id)
        .and_then(|verification| verification.sas_v1())
        .map(|sas| *sas)
        .ok_or_else(|| format!("{method}: no SAS verification for {user} / {flow_id}"))
}

fn qr(machine: &OlmMachine, args: &Value, method: &str) -> Result<QrVerification, String> {
    let (user, flow_id) = flow(args, method)?;
    machine
        .get_verification(&user, &flow_id)
        .and_then(|verification| verification.qr_v1())
        .map(|qr| *qr)
        .ok_or_else(|| format!("{method}: no QR verification for {user} / {flow_id}"))
}

fn user_arg(args: &Value, method: &str) -> Result<OwnedUserId, String> {
    let raw = str_arg(args, method, "userId")?;
    UserId::parse(&raw).map_err(|e| format!("{method}: bad user id in `userId`: {e}"))
}

async fn device(machine: &OlmMachine, args: &Value, method: &str) -> Result<Device, String> {
    let user = user_arg(args, method)?;
    let device_id: OwnedDeviceId = str_arg(args, method, "deviceId")?.into();
    machine
        .get_device(&user, &device_id, None)
        .await
        .map_err(|e| format!("{method}: cannot load device {user} / {device_id}: {e}"))?
        .ok_or_else(|| format!("{method}: unknown device {user} / {device_id}"))
}

async fn identity(machine: &OlmMachine, args: &Value, method: &str) -> Result<UserIdentity, String> {
    let user = user_arg(args, method)?;
    machine
        .get_identity(&user, None)
        .await
        .map_err(|e| format!("{method}: cannot load the identity of {user}: {e}"))?
        .ok_or_else(|| format!("{method}: no cross-signing identity for {user}"))
}

async fn own_identity(
    machine: &OlmMachine,
    args: &Value,
    method: &str,
) -> Result<OwnUserIdentity, String> {
    let identity = identity(machine, args, method).await?;
    let user = identity.user_id().to_owned();
    identity
        .own()
        .ok_or_else(|| format!("{method}: {user} is not our own user, use userIdentity.requestVerificationDm"))
}

async fn other_identity(
    machine: &OlmMachine,
    args: &Value,
    method: &str,
) -> Result<OtherUserIdentity, String> {
    let identity = identity(machine, args, method).await?;
    let user = identity.user_id().to_owned();
    identity
        .other()
        .ok_or_else(|| format!("{method}: {user} is our own user, use userIdentity.requestVerification"))
}

/// Absent or empty means "let the crate pick its default method set".
fn methods_arg(args: &Value, method: &str) -> Result<Option<Vec<VerificationMethod>>, String> {
    let Some(codes) = args.get("methods").and_then(Value::as_array) else {
        return Ok(None);
    };
    if codes.is_empty() {
        return Ok(None);
    }
    codes
        .iter()
        .map(|code| {
            code.as_u64()
                .and_then(method_from_code)
                .ok_or_else(|| format!("{method}: unknown verification method {code}"))
        })
        .collect::<Result<Vec<_>, _>>()
        .map(Some)
}

fn started(request: &VerificationRequest, outgoing_request: Value) -> Value {
    json!({ "request": request_state(request), "outgoingRequest": outgoing_request })
}

fn method_code(method: &VerificationMethod) -> Option<u8> {
    match method {
        VerificationMethod::SasV1 => Some(0),
        VerificationMethod::QrCodeScanV1 => Some(1),
        VerificationMethod::QrCodeShowV1 => Some(2),
        VerificationMethod::ReciprocateV1 => Some(3),
        _ => None,
    }
}

fn method_from_code(code: u64) -> Option<VerificationMethod> {
    match code {
        0 => Some(VerificationMethod::SasV1),
        1 => Some(VerificationMethod::QrCodeScanV1),
        2 => Some(VerificationMethod::QrCodeShowV1),
        3 => Some(VerificationMethod::ReciprocateV1),
        _ => None,
    }
}

fn method_codes(methods: Option<Vec<VerificationMethod>>) -> Value {
    match methods {
        Some(methods) => Value::Array(
            methods
                .iter()
                .filter_map(method_code)
                .map(|code| json!(code))
                .collect(),
        ),
        None => Value::Null,
    }
}

fn outgoing(request: OutgoingVerificationRequest) -> Value {
    let id = request.request_id().to_string();
    let mut entry = match request {
        OutgoingVerificationRequest::ToDevice(req) => json!({
            "type": REQUEST_TYPE_TO_DEVICE,
            "className": "ToDeviceRequest",
            "body": json!({ "messages": req.messages }).to_string(),
            "event_type": req.event_type.to_string(),
            "txn_id": req.txn_id.to_string(),
        }),
        OutgoingVerificationRequest::InRoom(req) => json!({
            "type": REQUEST_TYPE_ROOM_MESSAGE,
            "className": "RoomMessageRequest",
            "body": json!(req.content).to_string(),
            "room_id": req.room_id.to_string(),
            "txn_id": req.txn_id.to_string(),
            "event_type": req.content.as_ref().event_type().to_string(),
        }),
    };
    entry["id"] = Value::String(id);
    entry
}

fn optional_outgoing(request: Option<OutgoingVerificationRequest>) -> Value {
    request.map(outgoing).unwrap_or(Value::Null)
}

fn cancel_info(info: Option<CancelInfo>) -> Value {
    match info {
        Some(info) => json!({
            "cancelCode": info.cancel_code().to_string(),
            "cancelledbyUs": info.cancelled_by_us(),
            "reason": info.reason(),
        }),
        None => Value::Null,
    }
}

fn emoji_list(sas: &Sas) -> Value {
    match sas.emoji() {
        Some(emojis) => Value::Array(
            emojis
                .iter()
                .map(|emoji| json!({ "symbol": emoji.symbol, "description": emoji.description }))
                .collect(),
        ),
        None => Value::Null,
    }
}

fn decimals(sas: &Sas) -> Value {
    match sas.decimals() {
        Some((a, b, c)) => json!([a, b, c]),
        None => Value::Null,
    }
}

/// `className` is required: js-sdk dispatches on `instanceof RustSdkCryptoJs.Sas` / `.Qr`.
fn sas_state(sas: &Sas) -> Value {
    json!({
        "className": "Sas",
        "userId": sas.user_id().to_string(),
        "deviceId": sas.device_id().to_string(),
        "otherUserId": sas.other_user_id().to_string(),
        "otherDeviceId": sas.other_device_id().to_string(),
        "flowId": sas.flow_id().as_str(),
        "roomId": sas.room_id().map(ToString::to_string),
        "weStarted": sas.we_started(),
        "isSelfVerification": sas.is_self_verification(),
        "startedFromRequest": sas.started_from_request(),
        "supportsEmoji": sas.supports_emoji(),
        "haveWeConfirmed": sas.have_we_confirmed(),
        "hasBeenAccepted": sas.has_been_accepted(),
        "canBePresented": sas.can_be_presented(),
        "timedOut": sas.timed_out(),
        "isDone": sas.is_done(),
        "isCancelled": sas.is_cancelled(),
        "cancelInfo": cancel_info(sas.cancel_info()),
        "emoji": emoji_list(sas),
        "emojiIndex": sas.emoji_index().map(|indices| indices.to_vec()),
        "decimals": decimals(sas),
    })
}

fn qr_state_code(state: &QrVerificationState) -> u8 {
    match state {
        QrVerificationState::Started => 0,
        QrVerificationState::Scanned => 1,
        QrVerificationState::Confirmed => 2,
        QrVerificationState::Reciprocated => 3,
        QrVerificationState::Done { .. } => 4,
        QrVerificationState::Cancelled(_) => 5,
    }
}

fn qr_state(qr: &QrVerification) -> Value {
    json!({
        "className": "Qr",
        "userId": qr.user_id().to_string(),
        "otherUserId": qr.other_user_id().to_string(),
        "otherDeviceId": qr.other_device_id().to_string(),
        "flowId": qr.flow_id().as_str(),
        "roomId": qr.room_id().map(ToString::to_string),
        "weStarted": qr.we_started(),
        "isSelfVerification": qr.is_self_verification(),
        "hasBeenScanned": qr.has_been_scanned(),
        "hasBeenConfirmed": qr.has_been_confirmed(),
        "reciprocated": qr.reciprocated(),
        "isDone": qr.is_done(),
        "isCancelled": qr.is_cancelled(),
        "cancelInfo": cancel_info(qr.cancel_info()),
        "state": qr_state_code(&qr.state()),
        "qrCodeBytes": qr.to_bytes().ok().map(|bytes| BASE64.encode(bytes)),
    })
}

fn request_state(request: &VerificationRequest) -> Value {
    let state = request.state();
    let phase = match &state {
        VerificationRequestState::Created { .. } => 0,
        VerificationRequestState::Requested { .. } => 1,
        VerificationRequestState::Ready { .. } => 2,
        VerificationRequestState::Transitioned { .. } => 3,
        VerificationRequestState::Done => 4,
        VerificationRequestState::Cancelled(_) => 5,
    };

    let verification = match &state {
        VerificationRequestState::Transitioned { verification, .. } => match verification {
            Verification::SasV1(sas) => sas_state(sas),
            Verification::QrV1(qr) => qr_state(qr),
            _ => Value::Null,
        },
        _ => Value::Null,
    };

    json!({
        "className": "VerificationRequest",
        "ownUserId": request.own_user_id().to_string(),
        "otherUserId": request.other_user().to_string(),
        "otherDeviceId": request.other_device_id().map(|id| id.to_string()),
        "flowId": request.flow_id().as_str(),
        "roomId": request.room_id().map(ToString::to_string),
        "phase": phase,
        "weStarted": request.we_started(),
        "isSelfVerification": request.is_self_verification(),
        "isPassive": request.is_passive(),
        "isReady": request.is_ready(),
        "isDone": request.is_done(),
        "isCancelled": request.is_cancelled(),
        "timedOut": request.timed_out(),
        "timeRemainingMillis": request.time_remaining().as_millis() as f64,
        "theirSupportedMethods": method_codes(request.their_supported_methods()),
        "ourSupportedMethods": method_codes(request.our_supported_methods()),
        "cancelInfo": cancel_info(request.cancel_info()),
        "verification": verification,
    })
}

pub async fn invoke(
    machine: &OlmMachine,
    method: &str,
    args: &Value,
) -> Option<Result<Value, String>> {
    Some(match method {
        "getVerificationRequest" => {
            let (user, flow_id) = match flow(args, method) {
                Ok(flow) => flow,
                Err(e) => return Some(Err(e)),
            };
            Ok(machine
                .get_verification_request(&user, &flow_id)
                .map(|request| request_state(&request))
                .unwrap_or(Value::Null))
        }
        "getVerificationRequests" => {
            let raw = match str_arg(args, method, "userId") {
                Ok(raw) => raw,
                Err(e) => return Some(Err(e)),
            };
            match UserId::parse(&raw) {
                Ok(user) => Ok(Value::Array(
                    machine
                        .get_verification_requests(&user)
                        .iter()
                        .map(request_state)
                        .collect(),
                )),
                Err(e) => Err(format!("{method}: bad user id in `userId`: {e}")),
            }
        }

        "device.requestVerification" => match device(machine, args, method).await {
            Ok(device) => match methods_arg(args, method) {
                Ok(Some(methods)) => {
                    let (request, out) = device.request_verification_with_methods(methods);
                    Ok(started(&request, outgoing(out)))
                }
                Ok(None) => {
                    let (request, out) = device.request_verification();
                    Ok(started(&request, outgoing(out)))
                }
                Err(e) => Err(e),
            },
            Err(e) => Err(e),
        },
        "userIdentity.requestVerification" => match own_identity(machine, args, method).await {
            Ok(identity) => match methods_arg(args, method) {
                Ok(methods) => {
                    let result = match methods {
                        Some(methods) => identity.request_verification_with_methods(methods).await,
                        None => identity.request_verification().await,
                    };
                    match result {
                        Ok((request, out)) => Ok(started(&request, outgoing(out))),
                        Err(e) => Err(format!("{method} failed: {e}")),
                    }
                }
                Err(e) => Err(e),
            },
            Err(e) => Err(e),
        },
        // The crate has no one-shot in-room start: the content is sent first, then the request is
        // built from the event id it landed on.
        "userIdentity.verificationRequestContent" => {
            match other_identity(machine, args, method).await {
                Ok(identity) => {
                    let room = str_arg(args, method, "roomId").and_then(|raw| {
                        RoomId::parse(&raw)
                            .map_err(|e| format!("{method}: bad room id in `roomId`: {e}"))
                    });
                    match (room, methods_arg(args, method)) {
                        (Ok(room_id), Ok(methods)) => {
                            let content = identity.verification_request_content(methods);
                            let mut out = outgoing(
                                RoomMessageRequest {
                                    room_id,
                                    txn_id: TransactionId::new(),
                                    content: Box::new(AnyMessageLikeEventContent::RoomMessage(
                                        RoomMessageEventContent::new(content),
                                    )),
                                }
                                .into(),
                            );
                            // No `id`: the machine never issued this txn, so it cannot be acked.
                            if let Some(entry) = out.as_object_mut() {
                                entry.remove("id");
                            }
                            Ok(json!({ "request": Value::Null, "outgoingRequest": out }))
                        }
                        (Err(e), _) | (_, Err(e)) => Err(e),
                    }
                }
                Err(e) => Err(e),
            }
        }
        "userIdentity.requestVerificationDm" => match other_identity(machine, args, method).await {
            Ok(identity) => {
                let room = str_arg(args, method, "roomId").and_then(|raw| {
                    RoomId::parse(&raw).map_err(|e| format!("{method}: bad room id in `roomId`: {e}"))
                });
                let event = str_arg(args, method, "requestEventId").and_then(|raw| {
                    EventId::parse(&raw)
                        .map_err(|e| format!("{method}: bad event id in `requestEventId`: {e}"))
                });
                match (room, event, methods_arg(args, method)) {
                    (Ok(room_id), Ok(event_id), Ok(methods)) => {
                        let request = identity.request_verification(&room_id, &event_id, methods);
                        Ok(started(&request, Value::Null))
                    }
                    (Err(e), _, _) | (_, Err(e), _) | (_, _, Err(e)) => Err(e),
                }
            }
            Err(e) => Err(e),
        },

        "verificationRequest.state" => request(machine, args, method).map(|r| request_state(&r)),
        "verificationRequest.accept" => request(machine, args, method).and_then(|request| {
            match args.get("methods").and_then(Value::as_array) {
                Some(codes) => {
                    let methods = codes
                        .iter()
                        .filter_map(Value::as_u64)
                        .map(|code| {
                            method_from_code(code)
                                .ok_or_else(|| format!("{method}: unknown verification method {code}"))
                        })
                        .collect::<Result<Vec<_>, _>>()?;
                    Ok(optional_outgoing(request.accept_with_methods(methods)))
                }
                None => Ok(optional_outgoing(request.accept())),
            }
        }),
        "verificationRequest.cancel" => {
            request(machine, args, method).map(|request| optional_outgoing(request.cancel()))
        }
        "verificationRequest.startSas" => match request(machine, args, method) {
            Ok(request) => match request.start_sas().await {
                Ok(Some((sas, outgoing_request))) => {
                    Ok(json!([sas_state(&sas), outgoing(outgoing_request)]))
                }
                Ok(None) => Ok(Value::Null),
                Err(e) => Err(format!("verificationRequest.startSas failed: {e}")),
            },
            Err(e) => Err(e),
        },
        "verificationRequest.generateQrCode" => match request(machine, args, method) {
            Ok(request) => match request.generate_qr_code().await {
                Ok(Some(qr)) => match qr.to_bytes() {
                    Ok(_) => Ok(qr_state(&qr)),
                    Err(e) => Err(format!("{method}: cannot encode the QR code payload: {e}")),
                },
                Ok(None) => Ok(Value::Null),
                Err(e) => Err(format!("{method} failed: {e}")),
            },
            Err(e) => Err(e),
        },
        "verificationRequest.scanQrCode" => match request(machine, args, method) {
            Ok(request) => {
                let decoded = str_arg(args, method, "qrCodeData")
                    .and_then(|data| {
                        BASE64
                            .decode(data)
                            .map_err(|e| format!("{method}: `qrCodeData` is not valid base64: {e}"))
                    })
                    .and_then(|bytes| {
                        QrVerificationData::from_bytes(bytes)
                            .map_err(|e| format!("{method}: undecodable QR code: {e}"))
                    });
                match decoded {
                    Ok(data) => match request.scan_qr_code(data).await {
                        Ok(Some(qr)) => Ok(qr_state(&qr)),
                        Ok(None) => Err(format!(
                            "{method}: the request cannot take a scanned QR code in its current state"
                        )),
                        Err(e) => Err(format!("{method} failed: {e}")),
                    },
                    Err(e) => Err(e),
                }
            }
            Err(e) => Err(e),
        },

        "sas.state" => sas(machine, args, method).map(|sas| sas_state(&sas)),
        "sas.accept" => sas(machine, args, method).map(|sas| optional_outgoing(sas.accept())),
        "sas.confirm" => match sas(machine, args, method) {
            Ok(sas) => match sas.confirm().await {
                Ok((requests, signature_upload)) => {
                    let mut out: Vec<Value> = requests.into_iter().map(outgoing).collect();
                    // No `id`: that is how js-sdk knows to skip `markRequestAsSent`.
                    if let Some(upload) = signature_upload {
                        out.push(json!({
                            "type": REQUEST_TYPE_SIGNATURE_UPLOAD,
                            "className": "SignatureUploadRequest",
                            "body": json!(upload.signed_keys).to_string(),
                        }));
                    }
                    Ok(Value::Array(out))
                }
                Err(e) => Err(format!("sas.confirm failed: {e}")),
            },
            Err(e) => Err(e),
        },
        "sas.cancel" => sas(machine, args, method).map(|sas| {
            match args.get("code").and_then(Value::as_str) {
                Some(code) => optional_outgoing(sas.cancel_with_code(code.into())),
                None => optional_outgoing(sas.cancel()),
            }
        }),
        "sas.emoji" => sas(machine, args, method).map(|sas| emoji_list(&sas)),
        "sas.decimals" => sas(machine, args, method).map(|sas| decimals(&sas)),

        "qr.state" => qr(machine, args, method).map(|qr| qr_state(&qr)),
        "qr.confirm" => {
            qr(machine, args, method).map(|qr| optional_outgoing(qr.confirm_scanning()))
        }
        "qr.reciprocate" => qr(machine, args, method).map(|qr| optional_outgoing(qr.reciprocate())),
        "qr.cancel" => {
            qr(machine, args, method).map(|qr| match args.get("code").and_then(Value::as_str) {
                Some(code) => optional_outgoing(qr.cancel_with_code(code.into())),
                None => optional_outgoing(qr.cancel()),
            })
        }

        _ => return None,
    })
}
