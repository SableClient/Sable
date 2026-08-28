import { Method } from 'matrix-js-sdk/lib/http-api';
import type { MatrixClient } from '$types/matrix-sdk';

/** Numeric codes the engine tags outgoing requests with; see wasm_enums.rs. */
export const RequestType = {
  KeysUpload: 0,
  KeysQuery: 1,
  KeysClaim: 2,
  ToDevice: 3,
  SignatureUpload: 4,
  RoomMessage: 5,
  KeysBackup: 6,
} as const;

export type OutgoingRequest = {
  id: string;
  type: number;
  body: string;
  event_type?: string;
  txn_id?: string;
  room_id?: string;
  version?: string;
};

const path = {
  keysUpload: '/_matrix/client/v3/keys/upload',
  keysQuery: '/_matrix/client/v3/keys/query',
  keysClaim: '/_matrix/client/v3/keys/claim',
  signatures: '/_matrix/client/v3/keys/signatures/upload',
  keysBackup: '/_matrix/client/v3/room_keys/keys',
} as const;

/**
 * `body` goes verbatim: these bodies are signed and re-serialising reorders keys.
 * `json: false` also makes js-sdk return `res.text()`, so the response is already the
 * JSON string `markRequestAsSent` wants — encoding it again wedges the engine's queue.
 */
export const sendOutgoingRequest = async (
  mx: MatrixClient,
  request: OutgoingRequest
): Promise<string> => {
  const send = (method: Method, url: string, params: Record<string, string> = {}) =>
    mx.http.authedRequest<string>(method, url, params, request.body, {
      prefix: '',
      json: false,
      headers: { 'Content-Type': 'application/json' },
    });

  switch (request.type) {
    case RequestType.KeysUpload:
      return send(Method.Post, path.keysUpload);
    case RequestType.KeysQuery:
      return send(Method.Post, path.keysQuery);
    case RequestType.KeysClaim:
      return send(Method.Post, path.keysClaim);
    case RequestType.SignatureUpload:
      return send(Method.Post, path.signatures);
    case RequestType.KeysBackup:
      return send(Method.Put, path.keysBackup, { version: request.version ?? '' });
    case RequestType.ToDevice: {
      const url =
        `/_matrix/client/v3/sendToDevice/${encodeURIComponent(request.event_type ?? '')}` +
        `/${encodeURIComponent(request.txn_id ?? '')}`;
      return send(Method.Put, url);
    }
    case RequestType.RoomMessage: {
      const url =
        `/_matrix/client/v3/rooms/${encodeURIComponent(request.room_id ?? '')}/send` +
        `/${encodeURIComponent(request.event_type ?? '')}/${encodeURIComponent(request.txn_id ?? '')}`;
      return send(Method.Put, url);
    }
    default:
      throw new Error(`Unknown outgoing request type ${request.type}`);
  }
};
