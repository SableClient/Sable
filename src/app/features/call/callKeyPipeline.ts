import {
  MatrixRTCSessionEvent,
  type CallMembershipIdentityParts,
  type MatrixRTCSession,
} from '$types/matrix-sdk';
import type { CallEncryptionKey } from './callTransport';
import type { LocalCallIdentity } from './livekitCallIdentity';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('callKeyPipeline');

export const ownKeyWaitTimeoutMs = 10_000;

export const OWN_KEY_UNAVAILABLE_ERROR = 'Call own encryption key unavailable';
export const OWN_KEY_WAIT_CANCELLED_ERROR = 'Call own key wait cancelled';

/** `own` marks the key our own membership published, the one we encrypt with. */
export type CallKeyListener = (key: CallEncryptionKey, own: boolean) => void;

export type CallKeyPipeline = {
  attach: (session: MatrixRTCSession, localIdentity: LocalCallIdentity) => void;
  detach: () => void;
  waitForOwnKey: () => Promise<void>;
  getKeys: () => CallEncryptionKey[];
  setOnKey: (listener: CallKeyListener | undefined) => void;
};

/**
 * The one consumer of `EncryptionKeyChanged`, whatever transport carries the
 * media. It only ever runs for an encrypted room: MSC4143 makes MatrixRTC
 * encryption REQUIRED there and forbids it everywhere else.
 */
export const createCallKeyPipeline = (): CallKeyPipeline => {
  let rtcSession: MatrixRTCSession | undefined;
  const keys = new Map<string, CallEncryptionKey>();
  let localIdentity: LocalCallIdentity | null = null;
  let localOutboundIdentity: string | null = null;
  let onKey: CallKeyListener | undefined;

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
    const own =
      membershipParts.userId === localIdentity?.userId &&
      membershipParts.deviceId === localIdentity?.deviceId;
    if (own) localOutboundIdentity = rtcBackendIdentity;
    // Every key is forwarded as it arrives. A key index is a slot in LiveKit's
    // per-participant key ring (`cryptoKeyRing[keyIndex % keyringSize]`) and the
    // sender writes it into the frame, so the receiver must simply hold whatever
    // the sender last put there. Filtering on the index would strand frames: the
    // SDK reuses indices modulo 256 and restarts at 0 whenever a peer rejoins.
    const entry: CallEncryptionKey = {
      identity: rtcBackendIdentity,
      keyIndex: encryptionKeyIndex,
      key: encryptionKey,
    };
    keys.set(rtcBackendIdentity, entry);
    onKey?.(entry, own);
    maybeResolveOwnKey();
  };

  const reset = (): void => {
    if (rtcSession) {
      rtcSession.off(MatrixRTCSessionEvent.EncryptionKeyChanged, onEncryptionKeyChanged);
      rtcSession = undefined;
    }
    keys.clear();
    localIdentity = null;
    localOutboundIdentity = null;
    const reject = waitReject;
    if (reject) settleWait(() => reject(new Error(OWN_KEY_WAIT_CANCELLED_ERROR)));
  };

  const detach = (): void => {
    reset();
    onKey = undefined;
  };

  // The listener survives a re-attach: `reemitEncryptionKeys` fires during the
  // attach, so a caller that set it first must still receive those keys.
  const attach = (session: MatrixRTCSession, identity: LocalCallIdentity): void => {
    reset();
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
