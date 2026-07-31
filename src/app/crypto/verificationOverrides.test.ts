import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RustCrypto } from 'matrix-js-sdk/lib/rust-crypto/rust-crypto';
import { RustSdkCryptoJs } from './olmMachine/wasmClasses';
import { OlmMachineProxy } from './olmMachine/proxy';
import { installVerificationOverrides } from './verificationOverrides';

const bridge = vi.hoisted(() => ({
  engineInvoke: vi.fn<(identity: unknown, method: string, args: never) => Promise<unknown>>(),
}));

vi.mock('./olmMachine/engineInvoke', () => bridge);

const info = {
  userId: '@alice:example.org',
  deviceId: 'ALICE',
  ed25519Key: 'ed',
  curve25519Key: 'curve',
  deviceCreationTimeMs: 0,
};

const requestSnapshot = {
  className: 'VerificationRequest',
  flowId: 'flow',
  otherUserId: '@bob:example.org',
  ownUserId: '@alice:example.org',
  phase: RustSdkCryptoJs.VerificationRequestPhase.Requested,
};

const outgoingSnapshot = {
  className: 'ToDeviceRequest',
  id: 'txn-1',
  type: RustSdkCryptoJs.RequestType.ToDevice,
  event_type: 'm.key.verification.request',
  txn_id: 'txn-1',
  body: '{}',
};

const harness = () => {
  const sent: unknown[] = [];
  const wrapped: unknown[] = [];
  const sendVerificationRequestContent = vi.fn<(roomId: string, content: string) => Promise<string>>(
    async () => '$event:example.org'
  );
  const rustCrypto = {
    _supportedVerificationMethods: ['m.sas.v1', 'm.qr_code.show.v1'],
    makeVerificationRequest: (request: unknown) => {
      wrapped.push(request);
      return { wraps: request };
    },
    outgoingRequestProcessor: {
      makeOutgoingRequest: async (request: unknown) => {
        sent.push(request);
      },
    },
    sendVerificationRequestContent,
  } as unknown as RustCrypto;

  installVerificationOverrides(rustCrypto, new OlmMachineProxy(info));
  return { rustCrypto, sent, wrapped, sendVerificationRequestContent };
};

describe('installVerificationOverrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.engineInvoke.mockResolvedValue({
      request: requestSnapshot,
      outgoingRequest: outgoingSnapshot,
    });
  });

  it.each([
    [
      'requestDeviceVerification',
      'device.requestVerification',
      { userId: '@bob:example.org', deviceId: 'BOBDEVICE', methods: [0, 2] },
      (crypto: RustCrypto) => crypto.requestDeviceVerification('@bob:example.org', 'BOBDEVICE'),
    ],
    [
      'requestOwnUserVerification',
      'userIdentity.requestVerification',
      { userId: '@alice:example.org', methods: [0, 2] },
      (crypto: RustCrypto) => crypto.requestOwnUserVerification(),
    ],
  ] as const)('sends the outgoing request and wraps the request for %s', async (
    _name,
    method,
    args,
    call
  ) => {
    const { rustCrypto, sent, wrapped } = harness();
    const result = await call(rustCrypto);

    expect(bridge.engineInvoke).toHaveBeenCalledWith(expect.anything(), method, args);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(RustSdkCryptoJs.ToDeviceRequest);
    expect(wrapped[0]).toBeInstanceOf(RustSdkCryptoJs.VerificationRequest);
    expect(result).toEqual({ wraps: wrapped[0] });
  });

  it('sends the DM content itself and builds the request from the event id it landed on', async () => {
    const content = JSON.stringify({
      msgtype: 'm.key.verification.request',
      methods: ['m.sas.v1'],
    });
    bridge.engineInvoke.mockImplementation(async (_identity, method) => {
      if (method === 'userIdentity.verificationRequestContent') {
        return {
          request: null,
          outgoingRequest: {
            className: 'RoomMessageRequest',
            type: RustSdkCryptoJs.RequestType.RoomMessage,
            room_id: '!room:example.org',
            txn_id: 'txn-2',
            event_type: 'm.room.message',
            body: content,
          },
        };
      }
      if (method === 'userIdentity.requestVerificationDm') {
        return { request: requestSnapshot, outgoingRequest: null };
      }
      throw new Error(`unexpected engine call ${method}`);
    });

    const { rustCrypto, sent, wrapped, sendVerificationRequestContent } = harness();
    const result = await rustCrypto.requestVerificationDM(
      '@bob:example.org',
      '!room:example.org'
    );

    expect(sendVerificationRequestContent).toHaveBeenCalledWith('!room:example.org', content);
    expect(bridge.engineInvoke).toHaveBeenLastCalledWith(
      expect.anything(),
      'userIdentity.requestVerificationDm',
      {
        userId: '@bob:example.org',
        roomId: '!room:example.org',
        requestEventId: '$event:example.org',
        methods: [0, 2],
      }
    );
    expect(sent).toHaveLength(0);
    expect(wrapped[0]).toBeInstanceOf(RustSdkCryptoJs.VerificationRequest);
    expect(result).toEqual({ wraps: wrapped[0] });
  });

  it('refuses to send a DM request without content from the engine', async () => {
    bridge.engineInvoke.mockResolvedValue({ request: null, outgoingRequest: null });
    const { rustCrypto, sendVerificationRequestContent } = harness();

    await expect(
      rustCrypto.requestVerificationDM('@bob:example.org', '!room:example.org')
    ).rejects.toThrow(/no verification request content/);
    expect(sendVerificationRequestContent).not.toHaveBeenCalled();
  });

  it('skips the outgoing request when the engine has nothing to send', async () => {
    bridge.engineInvoke.mockResolvedValue({ request: requestSnapshot, outgoingRequest: null });
    const { rustCrypto, sent } = harness();

    await rustCrypto.requestOwnUserVerification();
    expect(sent).toHaveLength(0);
  });

  it('refuses to invent a request when the engine returns none', async () => {
    bridge.engineInvoke.mockResolvedValue(null);
    const { rustCrypto } = harness();

    await expect(rustCrypto.requestOwnUserVerification()).rejects.toThrow(
      /no verification request/
    );
  });
});
