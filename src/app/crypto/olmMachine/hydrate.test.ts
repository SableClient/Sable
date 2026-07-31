import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graftWasmPrototypes, RustSdkCryptoJs } from './wasmClasses';
import type { HydrationContext } from './hydrate';
import { OlmMachineProxy } from './proxy';
import { patchQrCodeScan } from './qrCodeScan';

const bridge = vi.hoisted(() => ({
  engineInvoke: vi.fn<(identity: unknown, method: string, args: never) => Promise<unknown>>(),
}));

vi.mock('./engineInvoke', () => bridge);

const context = (): HydrationContext & { calls: [string, unknown][] } => {
  const calls: [string, unknown][] = [];
  return {
    calls,
    call: async (method, args) => {
      calls.push([method, args]);
      return undefined;
    },
    queueOutgoing: () => {},
    watchChanges: () => {},
  };
};

const info = {
  userId: '@alice:example.org',
  deviceId: 'ALICE',
  ed25519Key: 'ed',
  curve25519Key: 'curve',
  deviceCreationTimeMs: 0,
};

const deviceSnapshot = () => ({
  className: 'Device',
  userId: '@bob:example.org',
  deviceId: 'BOBDEVICE',
  displayName: 'Bob phone',
  localTrustState: RustSdkCryptoJs.LocalTrust.Unset,
  algorithms: [],
  isDehydrated: false,
  isVerified: false,
  isBlacklisted: false,
  isCrossSignedByOwner: true,
  isCrossSigningTrusted: false,
  isDeleted: false,
  isLocallyTrusted: false,
  firstTimeSeen: 1700000000,
  keys: { 'ed25519:BOBDEVICE': 'edkey', 'curve25519:BOBDEVICE': 'curvekey' },
});

describe('Device hydration', () => {
  it('turns wasm methods into functions and leaves wasm getters as fields', () => {
    const ctx = context();
    const device = graftWasmPrototypes(deviceSnapshot(), ctx) as unknown as RustSdkCryptoJs.Device;

    expect(device).toBeInstanceOf(RustSdkCryptoJs.Device);
    expect(device.isVerified()).toBe(false);
    expect(device.isCrossSignedByOwner()).toBe(true);
    expect(device.isDeleted()).toBe(false);
    expect(device.firstTimeSeen()).toBe(1700000000);
    expect(device.isDehydrated).toBe(false);
    expect(device.displayName).toBe('Bob phone');
    expect(String(device.deviceId)).toBe('BOBDEVICE');
  });

  it('never lets an absent boolean read as verified', () => {
    const partial = deviceSnapshot() as Record<string, unknown>;
    delete partial.isVerified;
    const device = graftWasmPrototypes(partial, context()) as unknown as RustSdkCryptoJs.Device;

    expect(() => device.isVerified()).toThrow(/null pointer/);
  });

  it('exposes keys as a Map of base64 values', () => {
    const device = graftWasmPrototypes(
      deviceSnapshot(),
      context()
    ) as unknown as RustSdkCryptoJs.Device;
    const entries = Array.from(device.keys.entries()).map(([keyId, key]) => [
      keyId.toString(),
      key.toBase64(),
    ]);

    expect(entries).toEqual([
      ['ed25519:BOBDEVICE', 'edkey'],
      ['curve25519:BOBDEVICE', 'curvekey'],
    ]);
    expect(device.getKey(RustSdkCryptoJs.DeviceKeyAlgorithmName.Curve25519)?.toBase64()).toBe(
      'curvekey'
    );
  });

  it('forwards async members over IPC and makes free a no-op', async () => {
    const ctx = context();
    const device = graftWasmPrototypes(deviceSnapshot(), ctx) as unknown as RustSdkCryptoJs.Device;

    await device.setLocalTrust(RustSdkCryptoJs.LocalTrust.Verified);
    expect(ctx.calls).toEqual([
      [
        'device.setLocalTrust',
        {
          userId: '@bob:example.org',
          deviceId: 'BOBDEVICE',
          trustState: RustSdkCryptoJs.LocalTrust.Verified,
        },
      ],
    ]);
    expect(() => device.free()).not.toThrow();
  });
});

describe('UserDevices hydration', () => {
  const snapshot = () => ({
    className: 'UserDevices',
    userId: '@bob:example.org',
    devices: [deviceSnapshot()],
    keys: ['BOBDEVICE'],
    isAnyVerified: false,
  });

  it('turns every wasm member into a method', () => {
    const devices = graftWasmPrototypes(
      snapshot(),
      context()
    ) as unknown as RustSdkCryptoJs.UserDevices;

    expect(devices).toBeInstanceOf(RustSdkCryptoJs.UserDevices);
    expect(devices.isAnyVerified()).toBe(false);
    expect(devices.keys().map(String)).toEqual(['BOBDEVICE']);
    expect(devices.devices()).toHaveLength(1);
    expect(devices.devices()[0]).toBeInstanceOf(RustSdkCryptoJs.Device);
    expect(String(devices.get('BOBDEVICE' as never)?.deviceId)).toBe('BOBDEVICE');
    expect(devices.get('OTHER' as never)).toBeUndefined();
    expect(() => devices.free()).not.toThrow();
  });

  it('never lets a missing device list read as no devices', () => {
    const partial = snapshot() as Record<string, unknown>;
    delete partial.devices;
    const devices = graftWasmPrototypes(
      partial,
      context()
    ) as unknown as RustSdkCryptoJs.UserDevices;

    expect(() => devices.devices()).toThrow(/null pointer/);
    expect(() => devices.get('BOBDEVICE' as never)).toThrow(/DeviceId/);
  });
});

const own = () => ({
  className: 'OwnUserIdentity',
  userId: '@alice:example.org',
  isVerified: false,
  wasPreviouslyVerified: true,
  hasVerificationViolation: true,
  masterKey: '{"keys":{}}',
  selfSigningKey: '{"keys":{}}',
  userSigningKey: '{"keys":{}}',
});

const other = () => ({
  className: 'OtherUserIdentity',
  userId: '@bob:example.org',
  isVerified: true,
  wasPreviouslyVerified: true,
  hasVerificationViolation: false,
  identityNeedsUserApproval: true,
  masterKey: '{"keys":{}}',
  selfSigningKey: '{"keys":{}}',
});

describe('user identity hydration', () => {
  it('splits own-identity booleans from the cross-signing key getters', async () => {
    const ctx = context();
    const identity = graftWasmPrototypes(own(), ctx) as unknown as RustSdkCryptoJs.OwnUserIdentity;

    expect(identity).toBeInstanceOf(RustSdkCryptoJs.OwnUserIdentity);
    expect(identity.isVerified()).toBe(false);
    expect(identity.wasPreviouslyVerified()).toBe(true);
    expect(identity.hasVerificationViolation()).toBe(true);
    expect(identity.masterKey).toBe('{"keys":{}}');
    expect(identity.userSigningKey).toBe('{"keys":{}}');
    expect(() => identity.free()).not.toThrow();

    await identity.verify();
    await identity.withdrawVerification();
    expect(ctx.calls).toEqual([
      ['userIdentity.verify', { userId: '@alice:example.org' }],
      ['userIdentity.withdrawVerification', { userId: '@alice:example.org' }],
    ]);
  });

  it('hydrates the other-identity members and reports no userSigningKey', async () => {
    const ctx = context();
    const identity = graftWasmPrototypes(
      other(),
      ctx
    ) as unknown as RustSdkCryptoJs.OtherUserIdentity;

    expect(identity).toBeInstanceOf(RustSdkCryptoJs.OtherUserIdentity);
    expect(identity.identityNeedsUserApproval()).toBe(true);
    expect(identity.isVerified()).toBe(true);
    expect('userSigningKey' in identity).toBe(false);

    await identity.pinCurrentMasterKey();
    expect(ctx.calls).toEqual([['userIdentity.pin', { userId: '@bob:example.org' }]]);
  });

  it('never lets an absent verification flag read as verified', () => {
    const partial = other() as Record<string, unknown>;
    delete partial.isVerified;
    const identity = graftWasmPrototypes(
      partial,
      context()
    ) as unknown as RustSdkCryptoJs.OtherUserIdentity;

    expect(() => identity.isVerified()).toThrow(/null pointer/);
  });
});

describe('Signatures hydration', () => {
  const valid = btoa(String.fromCharCode(...new Uint8Array(64).fill(7))).replace(/=+$/, '');

  const signatures = () =>
    graftWasmPrototypes(
      {
        className: 'Signatures',
        json: JSON.stringify({
          '@bob:example.org': {
            'ed25519:BOBDEVICE': valid,
            'ed25519:OTHER': 'short',
          },
        }),
      },
      context()
    ) as unknown as RustSdkCryptoJs.Signatures;

  it('rebuilds per-key entries and rejects malformed signatures', () => {
    const perKey = signatures().get(new RustSdkCryptoJs.UserId('@bob:example.org'));
    const good = perKey?.get('ed25519:BOBDEVICE');
    const bad = perKey?.get('ed25519:OTHER');

    expect(good?.isValid()).toBe(true);
    expect(good?.signature?.toBase64()).toBe(valid);
    expect(bad?.isValid()).toBe(false);
    expect(signatures().get(new RustSdkCryptoJs.UserId('@carol:example.org'))).toBeUndefined();
  });

  it('returns the serde string from asJSON', () => {
    expect(JSON.parse(signatures().asJSON())).toHaveProperty('@bob:example.org');
  });
});

describe('Qr hydration', () => {
  const qr = (qrCodeBytes: string | null) =>
    graftWasmPrototypes(
      {
        className: 'Qr',
        flowId: 'flow',
        otherUserId: '@bob:example.org',
        otherDeviceId: 'BOBDEVICE',
        userId: '@alice:example.org',
        qrCodeBytes,
      },
      context()
    ) as unknown as RustSdkCryptoJs.Qr;

  it('round-trips base64 qr bytes synchronously', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    const encoded = btoa(String.fromCharCode(...bytes)).replace(/=+$/, '');

    expect(Array.from(qr(encoded).toBytes())).toEqual(Array.from(bytes));
  });

  it('reports no qr code rather than an empty one', () => {
    expect(qr(null).toBytes()).toBeUndefined();
  });
});

const bareRequest = (ctx: HydrationContext) =>
  graftWasmPrototypes(
    {
      className: 'VerificationRequest',
      flowId: 'flow',
      otherUserId: '@bob:example.org',
      ownUserId: '@alice:example.org',
    },
    ctx
  ) as unknown as RustSdkCryptoJs.VerificationRequest;

describe('QrCodeScan interception', () => {
  it('carries the scanned bytes through fromBytes to base64 over IPC', async () => {
    patchQrCodeScan();
    const bytes = new Uint8Array([1, 2, 3, 253, 254, 255]);
    const scan = RustSdkCryptoJs.QrCodeScan.fromBytes(new Uint8ClampedArray(bytes));

    expect(scan).toBeInstanceOf(RustSdkCryptoJs.QrCodeScan);
    expect(() => scan.free()).not.toThrow();

    const ctx = context();
    await bareRequest(ctx).scanQrCode(scan);
    expect(ctx.calls).toEqual([
      [
        'verificationRequest.scanQrCode',
        {
          userId: '@bob:example.org',
          flowId: 'flow',
          qrCodeData: btoa(String.fromCharCode(...bytes)).replace(/=+$/, ''),
        },
      ],
    ]);
  });

  it('patches once', () => {
    patchQrCodeScan();
    const first = RustSdkCryptoJs.QrCodeScan.fromBytes;
    patchQrCodeScan();

    expect(RustSdkCryptoJs.QrCodeScan.fromBytes).toBe(first);
  });

  it('refuses a handle it cannot read back', () => {
    expect(() => bareRequest(context()).scanQrCode({} as never)).toThrow(/scanned bytes/);
  });
});

describe('EncryptionInfo hydration', () => {
  it('serves shieldState synchronously from the precomputed states', () => {
    const encryptionInfo = graftWasmPrototypes(
      {
        className: 'EncryptionInfo',
        sender: '@bob:example.org',
        senderCurve25519Key: 'curve',
        shieldStateLax: {
          className: 'ShieldState',
          color: RustSdkCryptoJs.ShieldColor.None,
        },
        shieldStateStrict: {
          className: 'ShieldState',
          color: RustSdkCryptoJs.ShieldColor.Red,
        },
      },
      context()
    ) as unknown as RustSdkCryptoJs.EncryptionInfo;

    expect(encryptionInfo.shieldState(false).color).toBe(RustSdkCryptoJs.ShieldColor.None);
    expect(encryptionInfo.shieldState(true).color).toBe(RustSdkCryptoJs.ShieldColor.Red);
  });
});

describe('synchronous verification actions', () => {
  const request = {
    className: 'VerificationRequest',
    flowId: 'flow',
    otherUserId: '@bob:example.org',
    ownUserId: '@alice:example.org',
    otherDeviceId: 'BOBDEVICE',
    phase: RustSdkCryptoJs.VerificationRequestPhase.Requested,
    isCancelled: false,
    isDone: false,
    isPassive: false,
    isReady: false,
    isSelfVerification: false,
    timeRemainingMillis: 600000,
    timedOut: false,
    weStarted: false,
    getVerification: null,
  };

  const readyRequest = {
    className: 'ToDeviceRequest',
    id: 'txn-1',
    type: RustSdkCryptoJs.RequestType.ToDevice,
    event_type: 'm.key.verification.ready',
    txn_id: 'txn-1',
    body: '{}',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined, queues the request, and acks it locally', async () => {
    bridge.engineInvoke.mockImplementation(async (_identity, method) => {
      if (method === 'getVerificationRequest') return request;
      if (method === 'verificationRequest.accept') return readyRequest;
      if (method === 'outgoingRequests') return [];
      throw new Error(`unexpected engine call ${method}`);
    });

    const proxy = new OlmMachineProxy(info);
    const inner = (await proxy.getVerificationRequest(
      '@bob:example.org',
      'flow'
    )) as unknown as RustSdkCryptoJs.VerificationRequest;

    expect(inner.acceptWithMethods([])).toBeUndefined();
    await vi.waitFor(async () => expect(await proxy.outgoingRequests()).toHaveLength(1));

    const queued = (await proxy.outgoingRequests())[0] as RustSdkCryptoJs.ToDeviceRequest;
    expect(queued).toBeInstanceOf(RustSdkCryptoJs.ToDeviceRequest);
    expect(queued.id).toBe('txn-1');

    await proxy.markRequestAsSent('txn-1', queued.type, '{}');
    expect(await proxy.outgoingRequests()).toHaveLength(0);
    expect(bridge.engineInvoke).not.toHaveBeenCalledWith(
      expect.anything(),
      'markRequestAsSent',
      expect.anything()
    );
  });

  it('forwards an ack the engine owns', async () => {
    bridge.engineInvoke.mockResolvedValue(undefined);

    await new OlmMachineProxy(info).markRequestAsSent('engine-txn', 0, '{}');
    expect(bridge.engineInvoke).toHaveBeenCalledWith(
      expect.anything(),
      'markRequestAsSent',
      expect.objectContaining({ requestId: 'engine-txn' })
    );
  });

  it('invokes the stored changes callback through the event bridge', async () => {
    bridge.engineInvoke.mockResolvedValue(request);
    const proxy = new OlmMachineProxy(info);
    const inner = (await proxy.getVerificationRequest(
      '@bob:example.org',
      'flow'
    )) as unknown as RustSdkCryptoJs.VerificationRequest;
    const onChange = vi.fn<() => Promise<void>>();

    inner.registerChangesCallback(onChange);
    proxy.emit.verificationChanged('flow');

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
