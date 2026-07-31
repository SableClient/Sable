import type { MatrixClient } from '$types/matrix-sdk';
import { Method } from '$types/matrix-sdk';
import {
  engineClose,
  engineDecryptEvent,
  engineEncryptEvent,
  engineMarkRequestSent,
  engineOpen,
  engineOutgoingRequests,
  engineReceiveSyncChanges,
} from '$generated/tauri/commands';
import type {
  CryptoRequestKind,
  EngineInfo,
  OutgoingCryptoRequest,
  SyncChangesRequest,
  SyncChangesResult,
} from '$generated/tauri/types';

export type { EngineInfo, OutgoingCryptoRequest, SyncChangesResult };

export type EngineIdentity = {
  userId: string;
  deviceId: string;
};

/** Shape matrix-js-sdk expects back from `CryptoBackend.decryptEvent`. */
export type DecryptionResult = {
  clearEvent: Record<string, unknown>;
  senderCurve25519Key?: string;
  claimedEd25519Key?: string;
  forwardingCurve25519KeyChain?: string[];
};

export async function open(params: {
  dir: string;
  passphrase?: string;
  userId: string;
  deviceId: string;
}): Promise<EngineInfo> {
  return engineOpen({
    dir: params.dir,
    passphrase: params.passphrase ?? null,
    userId: params.userId,
    deviceId: params.deviceId,
  });
}

export async function close(identity: EngineIdentity): Promise<boolean> {
  return engineClose({ ...identity });
}

export async function receiveSyncChanges(params: {
  userId: string;
  deviceId: string;
  request: SyncChangesRequest;
}): Promise<SyncChangesResult> {
  return engineReceiveSyncChanges(params);
}

export async function outgoingRequests(identity: EngineIdentity): Promise<OutgoingCryptoRequest[]> {
  return engineOutgoingRequests({ ...identity });
}

export async function markRequestSent(params: {
  userId: string;
  deviceId: string;
  requestId: string;
  kind: CryptoRequestKind;
  responseBody: string;
}): Promise<void> {
  return engineMarkRequestSent(params);
}

export async function decryptEvent(params: {
  userId: string;
  deviceId: string;
  roomId: string;
  eventJson: string;
}): Promise<DecryptionResult> {
  const result = await engineDecryptEvent(params);
  return {
    clearEvent: JSON.parse(result.clear_event) as Record<string, unknown>,
    senderCurve25519Key: result.sender_curve25519_key ?? undefined,
    claimedEd25519Key: result.claimed_ed25519_key ?? undefined,
    forwardingCurve25519KeyChain: result.forwarding_curve25519_chain,
  };
}

export async function encryptEvent(params: {
  userId: string;
  deviceId: string;
  roomId: string;
  eventType: string;
  contentJson: string;
}): Promise<Record<string, unknown>> {
  const contentJson = await engineEncryptEvent(params);
  return JSON.parse(contentJson) as Record<string, unknown>;
}

/**
 * Sends one queued crypto request to the homeserver and returns the raw
 * response body, which the engine needs verbatim to update its own state.
 *
 * The endpoint mapping mirrors js-sdk's `OutgoingRequestProcessor`; the engine
 * only says which kind of request it is and supplies the body.
 */
export async function sendOutgoingRequest(
  mx: MatrixClient,
  request: OutgoingCryptoRequest
): Promise<string> {
  const body = JSON.parse(request.body) as Record<string, unknown>;

  switch (request.kind) {
    case 'KeysUpload':
      return json(await mx.http.authedRequest(Method.Post, '/keys/upload', undefined, body));
    case 'KeysQuery':
      return json(await mx.http.authedRequest(Method.Post, '/keys/query', undefined, body));
    case 'KeysClaim':
      return json(await mx.http.authedRequest(Method.Post, '/keys/claim', undefined, body));
    case 'SignatureUpload':
      return json(
        await mx.http.authedRequest(
          Method.Post,
          '/keys/signatures/upload',
          undefined,
          body.signed_keys ?? body
        )
      );
    case 'ToDevice': {
      if (!request.event_type) throw new Error('to-device request without an event type');
      const path = `/sendToDevice/${encodeURIComponent(request.event_type)}/${encodeURIComponent(
        request.request_id
      )}`;
      return json(await mx.http.authedRequest(Method.Put, path, undefined, body));
    }
    case 'RoomMessage': {
      const roomId = body.room_id as string;
      const eventType = body.event_type as string;
      const txnId = body.txn_id as string;
      const path = `/rooms/${encodeURIComponent(roomId)}/send/${encodeURIComponent(
        eventType
      )}/${encodeURIComponent(txnId)}`;
      return json(await mx.http.authedRequest(Method.Put, path, undefined, body.content as object));
    }
    default:
      throw new Error(`Unhandled outgoing crypto request kind: ${String(request.kind)}`);
  }
}

function json(response: unknown): string {
  return JSON.stringify(response ?? {});
}
