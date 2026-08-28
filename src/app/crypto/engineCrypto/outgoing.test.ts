import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { RequestType, sendOutgoingRequest } from './outgoing';

const clientReturning = (body: string) => {
  const authedRequest = vi.fn<(...args: never[]) => Promise<string>>(async () => body);
  return { mx: { http: { authedRequest } } as unknown as MatrixClient, authedRequest };
};

describe('sendOutgoingRequest', () => {
  /**
   * `json: false` makes js-sdk return res.text(), so the response is already JSON text.
   * Stringifying it again produced a double-encoded body that the engine could not parse,
   * so it never cleared its queue and re-sent every request on every sync.
   */
  it('returns the response body unchanged rather than re-encoding it', async () => {
    const { mx } = clientReturning('{"one_time_key_counts":{"signed_curve25519":50}}');

    const response = await sendOutgoingRequest(mx, {
      id: 'req-1',
      type: RequestType.KeysUpload,
      body: '{"device_keys":{}}',
    });

    expect(response).toBe('{"one_time_key_counts":{"signed_curve25519":50}}');
    expect(JSON.parse(response)).toHaveProperty('one_time_key_counts');
  });

  it('forwards the pre-signed body verbatim and does not let js-sdk re-serialise it', async () => {
    const { mx, authedRequest } = clientReturning('{}');
    const body = '{"b":1,"a":2}';

    await sendOutgoingRequest(mx, { id: 'r', type: RequestType.KeysQuery, body });

    const [, , , sentBody, opts] = authedRequest.mock.calls[0] as unknown as [
      unknown,
      unknown,
      unknown,
      string,
      { json: boolean },
    ];
    expect(sentBody).toBe(body);
    expect(opts.json).toBe(false);
  });

  it('routes each request type to its own endpoint', async () => {
    const cases = [
      [RequestType.KeysUpload, '/_matrix/client/v3/keys/upload'],
      [RequestType.KeysQuery, '/_matrix/client/v3/keys/query'],
      [RequestType.KeysClaim, '/_matrix/client/v3/keys/claim'],
      [RequestType.SignatureUpload, '/_matrix/client/v3/keys/signatures/upload'],
    ] as const;

    await Promise.all(
      cases.map(async ([type, expected]) => {
        const { mx, authedRequest } = clientReturning('{}');
        await sendOutgoingRequest(mx, { id: 'r', type, body: '{}' });
        expect(authedRequest.mock.calls[0]?.[1]).toBe(expected);
      })
    );
  });

  it('puts to-device and room-message requests on their transaction-scoped paths', async () => {
    const { mx, authedRequest } = clientReturning('{}');
    await sendOutgoingRequest(mx, {
      id: 'r',
      type: RequestType.ToDevice,
      body: '{}',
      event_type: 'm.key.verification.start',
      txn_id: 'txn1',
    });
    expect(authedRequest.mock.calls[0]?.[1]).toBe(
      '/_matrix/client/v3/sendToDevice/m.key.verification.start/txn1'
    );

    const room = clientReturning('{}');
    await sendOutgoingRequest(room.mx, {
      id: 'r',
      type: RequestType.RoomMessage,
      body: '{}',
      room_id: '!r:e.org',
      event_type: 'm.room.message',
      txn_id: 'txn2',
    });
    expect(room.authedRequest.mock.calls[0]?.[1]).toBe(
      '/_matrix/client/v3/rooms/!r%3Ae.org/send/m.room.message/txn2'
    );
  });

  it('rejects a request type it cannot route instead of silently dropping it', async () => {
    const { mx } = clientReturning('{}');
    await expect(sendOutgoingRequest(mx, { id: 'r', type: 99, body: '{}' })).rejects.toThrow(
      'Unknown outgoing request type 99'
    );
  });
});
