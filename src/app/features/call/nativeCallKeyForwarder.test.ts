import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MatrixRTCSessionEvent,
  type CallMembershipIdentityParts,
  type MatrixRTCSession,
} from '$types/matrix-sdk';
import {
  createNativeCallKeyForwarder,
  OWN_KEY_UNAVAILABLE_ERROR,
  OWN_KEY_WAIT_CANCELLED_ERROR,
  ownKeyWaitTimeoutMs,
} from './nativeCallKeyForwarder';

type EncryptionKeyHandler = (
  key: Uint8Array<ArrayBuffer>,
  encryptionKeyIndex: number,
  membership: CallMembershipIdentityParts,
  rtcBackendIdentity: string
) => void;

const makeSession = () => {
  const handlers = new Map<MatrixRTCSessionEvent, EncryptionKeyHandler>();
  const session = {
    on: vi.fn<(event: MatrixRTCSessionEvent, handler: EncryptionKeyHandler) => void>(
      (event, handler) => {
        handlers.set(event, handler);
      }
    ),
    off: vi.fn<(event: MatrixRTCSessionEvent, handler: EncryptionKeyHandler) => void>(
      (event, handler) => {
        if (handlers.get(event) === handler) handlers.delete(event);
      }
    ),
    reemitEncryptionKeys: vi.fn<() => void>(),
  } as unknown as MatrixRTCSession;
  return {
    session,
    handlers,
    emitKey: (key: number[], keyIndex: number, identity: string) =>
      handlers.get(MatrixRTCSessionEvent.EncryptionKeyChanged)?.(
        new Uint8Array(key) as Uint8Array<ArrayBuffer>,
        keyIndex,
        {} as CallMembershipIdentityParts,
        identity
      ),
  };
};

describe('native call key forwarder', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to key changes and re-emits on attach, unsubscribes on detach', () => {
    const { session, handlers } = makeSession();
    const forwarder = createNativeCallKeyForwarder();

    forwarder.attach(session);

    expect(session.on).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      expect.any(Function)
    );
    expect(session.reemitEncryptionKeys).toHaveBeenCalled();

    forwarder.detach();
    expect(session.off).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      expect.any(Function)
    );
    expect(handlers.has(MatrixRTCSessionEvent.EncryptionKeyChanged)).toBe(false);
  });

  it('caches raw keys as standard padded base64 per identity', () => {
    const { session, emitKey } = makeSession();
    const forwarder = createNativeCallKeyForwarder();
    forwarder.attach(session);

    emitKey([1, 2, 3, 4], 0, 'backend-a');
    emitKey([0, 1, 2], 2, 'backend-b');

    expect(forwarder.getKeys()).toEqual([
      { identity: 'backend-a', keyIndex: 0, key: 'AQIDBA==' },
      { identity: 'backend-b', keyIndex: 2, key: 'AAEC' },
    ]);
  });

  it('keeps the latest key index per identity and ignores stale events', () => {
    const { session, emitKey } = makeSession();
    const forwarder = createNativeCallKeyForwarder();
    forwarder.attach(session);

    emitKey([1, 2, 3, 4], 2, 'backend-a');
    emitKey([9, 9], 1, 'backend-a');
    emitKey([5, 6], 2, 'backend-a');

    expect(forwarder.getKeys()).toEqual([{ identity: 'backend-a', keyIndex: 2, key: 'AQIDBA==' }]);
  });

  it('notifies the key listener only for accepted rotations', () => {
    const { session, emitKey } = makeSession();
    const forwarder = createNativeCallKeyForwarder();
    forwarder.attach(session);
    const onKey = vi.fn<(entry: { identity: string; keyIndex: number; key: string }) => void>();
    forwarder.setOnKey(onKey);

    emitKey([1, 2, 3, 4], 0, 'backend-a');
    emitKey([1, 2, 3, 4], 0, 'backend-a');
    emitKey([7, 7, 7], 1, 'backend-a');

    expect(onKey).toHaveBeenCalledTimes(2);
    expect(onKey).toHaveBeenLastCalledWith({ identity: 'backend-a', keyIndex: 1, key: 'BwcH' });
  });

  it('resolves the own-key wait once a key arrives for the outbound identity', async () => {
    const { session, emitKey } = makeSession();
    const forwarder = createNativeCallKeyForwarder();
    forwarder.attach(session);
    forwarder.setLocalOutboundIdentity('own-backend');

    const wait = forwarder.waitForOwnKey();
    emitKey([1], 0, 'other-backend');

    emitKey([2], 0, 'own-backend');
    await expect(wait).resolves.toBeUndefined();
  });

  it('resolves the own-key wait for a key cached before the identity was known', async () => {
    const { session, emitKey } = makeSession();
    const forwarder = createNativeCallKeyForwarder();
    forwarder.attach(session);
    emitKey([2], 0, 'own-backend');

    forwarder.setLocalOutboundIdentity('own-backend');
    await expect(forwarder.waitForOwnKey()).resolves.toBeUndefined();
  });

  it('rejects the own-key wait after the timeout', async () => {
    vi.useFakeTimers();
    const { session } = makeSession();
    const forwarder = createNativeCallKeyForwarder();
    forwarder.attach(session);
    forwarder.setLocalOutboundIdentity('own-backend');

    const waitError = forwarder.waitForOwnKey().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(ownKeyWaitTimeoutMs);
    const timeoutError = await waitError;
    expect(timeoutError).toBeInstanceOf(Error);
    expect((timeoutError as Error).message).toBe(OWN_KEY_UNAVAILABLE_ERROR);
  });

  it('rejects a pending own-key wait on detach', async () => {
    const { session } = makeSession();
    const forwarder = createNativeCallKeyForwarder();
    forwarder.attach(session);
    forwarder.setLocalOutboundIdentity('own-backend');

    const waitError = forwarder.waitForOwnKey().catch((error: unknown) => error);
    forwarder.detach();
    const detachError = await waitError;
    expect(detachError).toBeInstanceOf(Error);
    expect((detachError as Error).message).toBe(OWN_KEY_WAIT_CANCELLED_ERROR);
    expect(forwarder.getKeys()).toEqual([]);
  });
});
