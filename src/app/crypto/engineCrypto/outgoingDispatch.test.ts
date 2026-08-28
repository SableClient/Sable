import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerificationPhase, EventType, type MatrixClient } from '$types/matrix-sdk';
import { engineInvoke } from '../olmMachine/engineInvoke';
import { EngineCrypto } from './EngineCrypto';

vi.mock('../olmMachine/engineInvoke', () => ({
  engineInvoke: vi.fn<(...args: never[]) => Promise<unknown>>(),
}));

const mockInvoke = vi.mocked(engineInvoke);

const clientSpy = () => {
  const authedRequest = vi.fn<(...args: never[]) => Promise<string>>(async () => '{}');
  return { mx: { http: { authedRequest } } as unknown as MatrixClient, authedRequest };
};

/** Unsent, the peer never receives the ready/accept and nothing reports an error. */
describe('verification outgoing requests', () => {
  beforeEach(() => mockInvoke.mockReset());

  it('sends the request that starting a device verification returns', async () => {
    const { mx, authedRequest } = clientSpy();
    mockInvoke.mockImplementation(async (_identity, method) => {
      if (method === 'device.requestVerification') {
        return {
          request: { flowId: '$f', otherUserId: '@them:e.org', phase: 1 },
          outgoingRequest: {
            id: 'txn',
            type: 3,
            body: '{"messages":{}}',
            event_type: 'm.key.verification.request',
            txn_id: 'txn',
          },
        };
      }
      return [];
    });

    await new EngineCrypto(mx, { userId: '@me:e.org', deviceId: 'D' }).requestDeviceVerification(
      '@them:e.org',
      'THEIRS'
    );

    const sent = authedRequest.mock.calls.map((call) => call[1] as unknown as string);
    expect(sent).toContain('/_matrix/client/v3/sendToDevice/m.key.verification.request/txn');
  });

  /**
   * sas.confirm answers with the MAC plus a signature upload. Sending only one leaves the
   * peer waiting after both sides pressed "they match", with no error either side.
   */
  it('sends every request when the engine answers with several', async () => {
    const { mx, authedRequest } = clientSpy();
    mockInvoke.mockImplementation(async (_identity, method) => {
      if (method === 'device.requestVerification') {
        return {
          request: {
            flowId: '$f',
            otherUserId: '@them:e.org',
            phase: 3,
            verification: { className: 'Sas', decimals: [1, 2, 3] },
          },
        };
      }
      if (method === 'sas.confirm') {
        return [
          { id: 'a', type: 3, body: '{}', event_type: 'm.key.verification.mac', txn_id: 'a' },
          { id: null, type: 4, body: '{}' },
        ];
      }
      return [];
    });

    const crypto = new EngineCrypto(mx, { userId: '@me:e.org', deviceId: 'D' });
    const request = await crypto.requestDeviceVerification('@them:e.org', 'THEIRS');
    await request.verifier?.getShowSasCallbacks()?.confirm();

    const sent = authedRequest.mock.calls.map((call) => call[1] as unknown as string);
    expect(sent).toContain('/_matrix/client/v3/sendToDevice/m.key.verification.mac/a');
    expect(sent).toContain('/_matrix/client/v3/keys/signatures/upload');
  });

  it('does not mistake a state snapshot for an outgoing request', async () => {
    const { mx, authedRequest } = clientSpy();
    mockInvoke.mockImplementation(async (_identity, method) => {
      if (method === 'device.requestVerification') {
        return { request: { flowId: '$f', otherUserId: '@them:e.org', phase: 1 } };
      }
      return [];
    });

    await new EngineCrypto(mx, { userId: '@me:e.org', deviceId: 'D' }).requestDeviceVerification(
      '@them:e.org',
      'THEIRS'
    );

    // The constructor probes the key backup; only verification traffic matters here.
    const verificationCalls = authedRequest.mock.calls.filter(
      ([, url]) => !String(url).startsWith('/room_keys/')
    );
    expect(verificationCalls).toEqual([]);
  });

  it('completes a request when the engine consumes the final done event', async () => {
    const { mx } = clientSpy();
    mockInvoke.mockImplementation(async (_identity, method) => {
      if (method === 'device.requestVerification') {
        return {
          request: {
            flowId: '$f',
            otherUserId: '@them:e.org',
            phase: 3,
            verification: { className: 'Sas' },
          },
        };
      }
      if (method === 'receiveSyncChanges') {
        return [
          {
            type: 3,
            rawEvent: JSON.stringify({
              type: EventType.KeyVerificationDone,
              sender: '@them:e.org',
              content: { transaction_id: '$f' },
            }),
          },
        ];
      }
      if (method === 'verificationRequest.state') {
        throw new Error('verificationRequest.state: no verification request');
      }
      return [];
    });

    const crypto = new EngineCrypto(mx, { userId: '@me:e.org', deviceId: 'D' });
    const request = await crypto.requestDeviceVerification('@them:e.org', 'THEIRS');

    await expect(
      crypto.preprocessToDeviceMessages([
        {
          type: EventType.KeyVerificationDone,
          sender: '@them:e.org',
          content: { transaction_id: '$f' },
        } as never,
      ])
    ).resolves.toEqual([]);
    expect(request.phase).toBe(VerificationPhase.Done);
  });

  it('drains the outgoing queue before re-reading the SAS snapshot', async () => {
    const authedRequest = vi.fn<(...args: never[]) => Promise<string>>(
      async () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('{}'), 5);
        })
    );
    const mx = { http: { authedRequest } } as unknown as MatrixClient;
    let peerKeyReceived = false;
    let ourKeyAcked = false;

    mockInvoke.mockImplementation(async (_identity, method) => {
      if (method === 'device.requestVerification') {
        return {
          request: {
            flowId: '$f',
            otherUserId: '@them:e.org',
            phase: 3,
            verification: { className: 'Sas' },
          },
        };
      }
      if (method === 'receiveSyncChanges') {
        peerKeyReceived = true;
        return [
          {
            type: 3,
            rawEvent: JSON.stringify({
              type: 'm.key.verification.key',
              sender: '@them:e.org',
              content: { transaction_id: '$f' },
            }),
          },
        ];
      }
      if (method === 'outgoingRequests') {
        return peerKeyReceived
          ? [{ id: 'k', type: 3, body: '{}', event_type: 'm.key.verification.key', txn_id: 'k' }]
          : [];
      }
      if (method === 'markRequestAsSent') {
        ourKeyAcked = true;
        return null;
      }
      if (method === 'verificationRequest.state') {
        return {
          flowId: '$f',
          otherUserId: '@them:e.org',
          phase: 3,
          verification: {
            className: 'Sas',
            emoji: ourKeyAcked ? [{ symbol: '🌏', description: 'Globe' }] : null,
          },
        };
      }
      return [];
    });

    const crypto = new EngineCrypto(mx, { userId: '@me:e.org', deviceId: 'D' });
    const request = await crypto.requestDeviceVerification('@them:e.org', 'THEIRS');

    await crypto.preprocessToDeviceMessages([
      {
        type: 'm.key.verification.key',
        sender: '@them:e.org',
        content: { transaction_id: '$f' },
      } as never,
    ]);

    expect(request.verifier?.getShowSasCallbacks()?.sas.emoji).toEqual([['🌏', 'Globe']]);
  });
});
