import * as RustSdkCryptoJs from '@matrix-org/matrix-sdk-crypto-wasm';
import { scannedQrCodeBytes } from './qrCodeScan';

export type HydrationContext = {
  call: (method: string, args?: Record<string, unknown>) => Promise<unknown>;
  queueOutgoing: (label: string, pending: Promise<unknown>) => void;
  watchChanges: (flowId: string, callback: () => void) => void;
};

type Snapshot = Record<string, unknown>;

// Shadowing a wasm member must use defineProperty: assigning to a setter-less accessor throws.
const define = (record: Snapshot, name: string, value: unknown): void => {
  Object.defineProperty(record, name, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
};

// Only OWN properties: an absent field must fall through and throw, not fabricate a verification.
const asMethod = (record: Snapshot, ...names: string[]): void => {
  for (const name of names) {
    if (!Object.hasOwn(record, name)) continue;
    const value = record[name];
    define(record, name, () => value);
  }
};

// Return undefined synchronously and queue the request; wasm returns it synchronously.
const queueAction =
  (
    ctx: HydrationContext,
    method: string,
    target: Snapshot,
    argsOf?: (args: unknown[]) => Snapshot
  ) =>
  (...args: unknown[]): undefined => {
    ctx.queueOutgoing(method, ctx.call(method, { ...target, ...argsOf?.(args) }));
    return undefined;
  };

const base64Value = (value: string) => ({
  toBase64: () => value,
  toString: () => value,
});

const decodeBase64 = (value: string): Uint8Array => {
  const unpadded = value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const binary = atob(unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const encodeBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/=+$/, '');

const keyAlgorithmNames: Record<number, string> = {
  [RustSdkCryptoJs.DeviceKeyAlgorithmName.Ed25519]: 'ed25519',
  [RustSdkCryptoJs.DeviceKeyAlgorithmName.Curve25519]: 'curve25519',
};

const deviceKeys = (value: unknown): Map<string, { toBase64: () => string }> =>
  new Map(
    Object.entries((value ?? {}) as Record<string, unknown>).map(([keyId, key]) => [
      keyId,
      base64Value(String(key)),
    ])
  );

const signatureIsValid = (keyId: string, signature: string): boolean => {
  if (!keyId.startsWith('ed25519:')) return true;
  try {
    return decodeBase64(signature).length === 64;
  } catch {
    return false;
  }
};

const flowTarget = (record: Snapshot): Snapshot => ({
  userId: String(record.otherUserId),
  flowId: String(record.flowId),
});

const watchChanges = (record: Snapshot, ctx: HydrationContext): void => {
  define(record, 'registerChangesCallback', (callback: () => void) =>
    ctx.watchChanges(String(record.flowId), callback)
  );
};

const qrCodeBytes = (data: unknown): Uint8Array => {
  const scanned = scannedQrCodeBytes(data);
  if (scanned) return scanned;
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return Uint8Array.from(data as number[]);
  throw new Error('scanQrCode() needs the scanned bytes; a wasm QrCodeScan cannot be read back');
};

export const hydrate = (className: string, record: Snapshot, ctx: HydrationContext): void => {
  define(record, 'free', () => {});

  switch (className) {
    case 'Device': {
      const target = {
        userId: String(record.userId),
        deviceId: String(record.deviceId),
      };
      asMethod(
        record,
        'isVerified',
        'isBlacklisted',
        'isCrossSignedByOwner',
        'isCrossSigningTrusted',
        'isDeleted',
        'isLocallyTrusted',
        'firstTimeSeen'
      );
      const keys = deviceKeys(record.keys);
      define(record, 'keys', keys);
      define(record, 'getKey', (algorithm: unknown) => {
        const name = keyAlgorithmNames[algorithm as number];
        return name ? keys.get(`${name}:${target.deviceId}`) : undefined;
      });
      define(record, 'setLocalTrust', (trustState: unknown) =>
        ctx.call('device.setLocalTrust', { ...target, trustState })
      );
      define(record, 'verify', () => ctx.call('device.verify', target));
      define(
        record,
        'encryptToDeviceEvent',
        (eventType: string, content: unknown, shareStrategy?: unknown) =>
          ctx.call('device.encryptToDeviceEvent', {
            ...target,
            eventType,
            content,
            shareStrategy: shareStrategy ?? null,
          })
      );
      break;
    }

    case 'UserDevices': {
      const devices = Object.hasOwn(record, 'devices')
        ? (record.devices as Snapshot[] | undefined)
        : undefined;
      asMethod(record, 'devices', 'keys', 'isAnyVerified');
      if (devices) {
        define(record, 'get', (deviceId: unknown) =>
          devices.find((device) => String(device.deviceId) === String(deviceId))
        );
      }
      break;
    }

    case 'OwnUserIdentity':
    case 'OtherUserIdentity': {
      const target = { userId: String(record.userId) };
      asMethod(
        record,
        'isVerified',
        'wasPreviouslyVerified',
        'hasVerificationViolation',
        'identityNeedsUserApproval'
      );
      define(record, 'verify', () => ctx.call('userIdentity.verify', target));
      define(record, 'withdrawVerification', () =>
        ctx.call('userIdentity.withdrawVerification', target)
      );
      if (className === 'OtherUserIdentity') {
        define(record, 'pinCurrentMasterKey', () => ctx.call('userIdentity.pin', target));
      }
      break;
    }

    case 'Signatures': {
      const json = typeof record.json === 'string' ? record.json : '{}';
      const parsed = JSON.parse(json) as Record<string, Record<string, string>>;
      define(record, 'asJSON', () => json);
      define(record, 'get', (signer: unknown) => {
        const perKey = parsed[String(signer)];
        if (!perKey) return undefined;
        return new Map(
          Object.entries(perKey).map(([keyId, signature]) => [
            keyId,
            {
              isValid: () => signatureIsValid(keyId, signature),
              isInvalid: () => !signatureIsValid(keyId, signature),
              signature: base64Value(signature),
            },
          ])
        );
      });
      break;
    }

    case 'VerificationRequest': {
      const target = flowTarget(record);
      asMethod(
        record,
        'isCancelled',
        'isDone',
        'isPassive',
        'isReady',
        'isSelfVerification',
        'phase',
        'timeRemainingMillis',
        'timedOut',
        'weStarted',
        'getVerification'
      );
      watchChanges(record, ctx);
      define(record, 'accept', queueAction(ctx, 'verificationRequest.accept', target));
      define(
        record,
        'acceptWithMethods',
        queueAction(ctx, 'verificationRequest.accept', target, ([methods]) => ({
          methods,
        }))
      );
      define(record, 'cancel', queueAction(ctx, 'verificationRequest.cancel', target));
      define(record, 'generateQrCode', () =>
        ctx.call('verificationRequest.generateQrCode', target)
      );
      define(record, 'scanQrCode', (data: unknown) =>
        ctx.call('verificationRequest.scanQrCode', {
          ...target,
          qrCodeData: encodeBase64(qrCodeBytes(data)),
        })
      );
      define(record, 'startSas', () => ctx.call('verificationRequest.startSas', target));
      break;
    }

    case 'Sas': {
      const target = flowTarget(record);
      asMethod(
        record,
        'canBePresented',
        'cancelInfo',
        'decimals',
        'emoji',
        'emojiIndex',
        'hasBeenAccepted',
        'haveWeConfirmed',
        'isCancelled',
        'isDone',
        'isSelfVerification',
        'startedFromRequest',
        'supportsEmoji',
        'timedOut',
        'weStarted'
      );
      watchChanges(record, ctx);
      define(record, 'accept', queueAction(ctx, 'sas.accept', target));
      define(record, 'cancel', queueAction(ctx, 'sas.cancel', target));
      define(
        record,
        'cancelWithCode',
        queueAction(ctx, 'sas.cancel', target, ([code]) => ({ code }))
      );
      define(record, 'confirm', () => ctx.call('sas.confirm', target));
      break;
    }

    case 'Qr': {
      const target = flowTarget(record);
      asMethod(
        record,
        'cancelInfo',
        'hasBeenConfirmed',
        'hasBeenScanned',
        'isCancelled',
        'isDone',
        'isSelfVerification',
        'reciprocated',
        'state',
        'weStarted'
      );
      watchChanges(record, ctx);
      const bytes = record.qrCodeBytes;
      define(record, 'toBytes', () =>
        typeof bytes === 'string' ? decodeBase64(bytes) : undefined
      );
      define(record, 'cancel', queueAction(ctx, 'qr.cancel', target));
      define(
        record,
        'cancelWithCode',
        queueAction(ctx, 'qr.cancel', target, ([code]) => ({ code }))
      );
      define(record, 'confirmScanning', queueAction(ctx, 'qr.confirm', target));
      define(record, 'reciprocate', queueAction(ctx, 'qr.reciprocate', target));
      break;
    }

    case 'CancelInfo':
      asMethod(record, 'cancelCode', 'cancelledbyUs', 'reason');
      break;

    case 'EncryptionInfo': {
      const lax = record.shieldStateLax;
      const strict = record.shieldStateStrict;
      define(record, 'shieldState', (isStrict: boolean) => (isStrict ? strict : lax));
      break;
    }

    case 'BackupKeys': {
      const base64 = record.decryptionKeyBase64;
      define(
        record,
        'decryptionKey',
        typeof base64 === 'string'
          ? RustSdkCryptoJs.BackupDecryptionKey.fromBase64(base64)
          : undefined
      );
      break;
    }

    case 'SignatureVerification':
      asMethod(record, 'trusted');
      break;

    default:
      break;
  }
};
