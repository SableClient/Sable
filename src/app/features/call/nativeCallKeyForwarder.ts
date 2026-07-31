import {
  MatrixRTCSessionEvent,
  type CallMembershipIdentityParts,
  type MatrixRTCSession,
} from '$types/matrix-sdk';
import type { NativeCallEncryptionKeyPayload } from './livekitMobileBridge';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('nativeCallKeyForwarder');

export const ownKeyWaitTimeoutMs = 10_000;

export const OWN_KEY_UNAVAILABLE_ERROR = 'Native call own encryption key unavailable';
export const OWN_KEY_WAIT_CANCELLED_ERROR = 'Native call own key wait cancelled';

export type NativeCallKeyForwarder = {
  attach: (session: MatrixRTCSession) => void;
  detach: () => void;
  setLocalOutboundIdentity: (identity: string | undefined) => void;
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
    _membershipParts: CallMembershipIdentityParts,
    rtcBackendIdentity: string
  ): void => {
    debugLog.debug(
      'call',
      `key changed identity=${rtcBackendIdentity} index=${encryptionKeyIndex} ownIdentity=${localOutboundIdentity ?? 'unset'}`
    );
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
    localOutboundIdentity = null;
    onKey = undefined;
    const reject = waitReject;
    if (reject) settleWait(() => reject(new Error(OWN_KEY_WAIT_CANCELLED_ERROR)));
  };

  const attach = (session: MatrixRTCSession): void => {
    detach();
    rtcSession = session;
    session.on(MatrixRTCSessionEvent.EncryptionKeyChanged, onEncryptionKeyChanged);
    session.reemitEncryptionKeys();
  };

  const setLocalOutboundIdentity = (identity: string | undefined): void => {
    localOutboundIdentity = identity ?? null;
    maybeResolveOwnKey();
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
    setLocalOutboundIdentity,
    waitForOwnKey,
    getKeys: () => [...keys.values()],
    setOnKey: (listener) => {
      onKey = listener;
    },
  };
};
