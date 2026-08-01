import {
  MatrixRTCSessionEvent,
  type CallMembershipIdentityParts,
  type MatrixRTCSession,
} from '$types/matrix-sdk';
import type { NativeCallEncryptionKeyPayload } from './livekitMobileBridge';
import type { LocalCallIdentity } from './livekitCallIdentity';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('nativeCallKeyForwarder');

export const ownKeyWaitTimeoutMs = 10_000;

export const OWN_KEY_UNAVAILABLE_ERROR = 'Native call own encryption key unavailable';
export const OWN_KEY_WAIT_CANCELLED_ERROR = 'Native call own key wait cancelled';

export type NativeCallKeyForwarder = {
  attach: (session: MatrixRTCSession, localIdentity: LocalCallIdentity) => void;
  detach: () => void;
  waitForOwnKey: () => Promise<void>;
  getKeys: () => NativeCallEncryptionKeyPayload[];
  setOnKey: (listener: ((key: NativeCallEncryptionKeyPayload) => void) | undefined) => void;
};

const toBase64 = (key: Uint8Array): string => {
  let binary = '';
  key.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

export const createNativeCallKeyForwarder = (): NativeCallKeyForwarder => {
  let rtcSession: MatrixRTCSession | undefined;
  const keys = new Map<string, NativeCallEncryptionKeyPayload>();
  let localIdentity: LocalCallIdentity | null = null;
  let localOutboundIdentity: string | null = null;
  let onKey: ((key: NativeCallEncryptionKeyPayload) => void) | undefined;

  let waitResolve: (() => void) | undefined;
  let waitReject: ((error: Error) => void) | undefined;
  let waitTimeout: ReturnType<typeof setTimeout> | undefined;

  const settleWait = (settle: () => void): void => {
    waitResolve = undefined;
    waitReject = undefined;
    if (waitTimeout !== undefined) clearTimeout(waitTimeout);
    waitTimeout = undefined;
    settle();
  };

  const hasOwnKey = (): boolean =>
    localOutboundIdentity !== null && keys.has(localOutboundIdentity);

  const maybeResolveOwnKey = (): void => {
    const resolve = waitResolve;
    if (resolve && hasOwnKey()) settleWait(resolve);
  };

  const onEncryptionKeyChanged = (
    encryptionKey: Uint8Array<ArrayBuffer>,
    encryptionKeyIndex: number,
    membershipParts: CallMembershipIdentityParts,
    rtcBackendIdentity: string
  ): void => {
    debugLog.debug(
      'call',
      `key changed identity=${rtcBackendIdentity} index=${encryptionKeyIndex} ownIdentity=${localOutboundIdentity ?? 'unset'}`
    );
    if (
      membershipParts.userId === localIdentity?.userId &&
      membershipParts.deviceId === localIdentity?.deviceId
    ) {
      localOutboundIdentity = rtcBackendIdentity;
    }
    const accepted = keys.get(rtcBackendIdentity);
    if (accepted && encryptionKeyIndex <= accepted.keyIndex) return;

    const entry: NativeCallEncryptionKeyPayload = {
      identity: rtcBackendIdentity,
      keyIndex: encryptionKeyIndex,
      key: toBase64(encryptionKey),
    };
    keys.set(rtcBackendIdentity, entry);
    onKey?.(entry);
    maybeResolveOwnKey();
  };

  const detach = (): void => {
    if (rtcSession) {
      rtcSession.off(MatrixRTCSessionEvent.EncryptionKeyChanged, onEncryptionKeyChanged);
      rtcSession = undefined;
    }
    keys.clear();
    localIdentity = null;
    localOutboundIdentity = null;
    onKey = undefined;
    const reject = waitReject;
    if (reject) settleWait(() => reject(new Error(OWN_KEY_WAIT_CANCELLED_ERROR)));
  };

  const attach = (session: MatrixRTCSession, identity: LocalCallIdentity): void => {
    detach();
    rtcSession = session;
    localIdentity = identity;
    session.on(MatrixRTCSessionEvent.EncryptionKeyChanged, onEncryptionKeyChanged);
    session.reemitEncryptionKeys();
  };

  const waitForOwnKey = (): Promise<void> => {
    if (hasOwnKey()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      waitResolve = resolve;
      waitReject = reject;
      waitTimeout = setTimeout(
        () => settleWait(() => reject(new Error(OWN_KEY_UNAVAILABLE_ERROR))),
        ownKeyWaitTimeoutMs
      );
      maybeResolveOwnKey();
    });
  };

  return {
    attach,
    detach,
    waitForOwnKey,
    getKeys: () => [...keys.values()],
    setOnKey: (listener) => {
      onKey = listener;
    },
  };
};
