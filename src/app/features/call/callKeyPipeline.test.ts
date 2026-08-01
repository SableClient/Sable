import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MatrixRTCSessionEvent,
  type CallMembershipIdentityParts,
  type MatrixRTCSession,
} from '$types/matrix-sdk';
import {
  createCallKeyPipeline,
  OWN_KEY_UNAVAILABLE_ERROR,
  OWN_KEY_WAIT_CANCELLED_ERROR,
  ownKeyWaitTimeoutMs,
  type CallKeyListener,
} from './callKeyPipeline';

type EncryptionKeyHandler = (
  key: Uint8Array<ArrayBuffer>,
  encryptionKeyIndex: number,
  membership: CallMembershipIdentityParts,
  rtcBackendIdentity: string
) => void;

const localIdentity = { userId: '@alice:example.org', deviceId: 'ALICEDEVICE' };
const localParts = localIdentity as CallMembershipIdentityParts;
const remoteParts = {
  userId: '@bob:example.org',
  deviceId: 'BOBDEVICE',
} as CallMembershipIdentityParts;

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
    emitKey: (
      key: number[],
      keyIndex: number,
      identity: string,
      parts: CallMembershipIdentityParts = remoteParts
    ) =>
      handlers.get(MatrixRTCSessionEvent.EncryptionKeyChanged)?.(
        new Uint8Array(key) as Uint8Array<ArrayBuffer>,
        keyIndex,
        parts,
        identity
      ),
  };
};

describe('call key pipeline', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to key changes and re-emits on attach, unsubscribes on detach', () => {
    const { session, handlers } = makeSession();
    const pipeline = createCallKeyPipeline();

    pipeline.attach(session, localIdentity);

    expect(session.on).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      expect.any(Function)
    );
    expect(session.reemitEncryptionKeys).toHaveBeenCalled();

    pipeline.detach();
    expect(session.off).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      expect.any(Function)
    );
    expect(handlers.has(MatrixRTCSessionEvent.EncryptionKeyChanged)).toBe(false);
  });

  it('caches the latest raw key per identity', () => {
    const { session, emitKey } = makeSession();
    const pipeline = createCallKeyPipeline();
    pipeline.attach(session, localIdentity);

    emitKey([1, 2, 3, 4], 0, 'backend-a');
    emitKey([0, 1, 2], 2, 'backend-b');

    expect(pipeline.getKeys()).toEqual([
      { identity: 'backend-a', keyIndex: 0, key: new Uint8Array([1, 2, 3, 4]) },
      { identity: 'backend-b', keyIndex: 2, key: new Uint8Array([0, 1, 2]) },
    ]);
  });

  it('keeps the latest key per identity, including after a peer restarts its indices', () => {
    const { session, emitKey } = makeSession();
    const pipeline = createCallKeyPipeline();
    pipeline.attach(session, localIdentity);

    emitKey([1, 2, 3, 4], 2, 'backend-a');
    // A peer that rejoins starts a fresh outbound session back at a low index,
    // so a lower index carries a genuinely new key rather than a stale one.
    emitKey([9, 9], 1, 'backend-a');
    // The same index can also carry new material after a rotation.
    emitKey([5, 6], 2, 'backend-a');

    expect(pipeline.getKeys()).toEqual([
      { identity: 'backend-a', keyIndex: 2, key: new Uint8Array([5, 6]) },
    ]);
  });

  it('forwards every key it is given, since an index is a key-ring slot', () => {
    const { session, emitKey } = makeSession();
    const pipeline = createCallKeyPipeline();
    pipeline.attach(session, localIdentity);
    const onKey = vi.fn<CallKeyListener>();
    pipeline.setOnKey(onKey);

    // LiveKit stores keys per participant at `cryptoKeyRing[index % keyringSize]`
    // and reads the index out of the frame, so the receiver has to hold whatever
    // the sender last wrote there. Filtering here would strand frames.
    emitKey([1, 2, 3, 4], 0, 'backend-a');
    emitKey([1, 2, 3, 4], 0, 'backend-a');
    emitKey([7, 7, 7], 1, 'backend-a');

    expect(onKey).toHaveBeenCalledTimes(3);
    expect(onKey).toHaveBeenLastCalledWith(
      { identity: 'backend-a', keyIndex: 1, key: new Uint8Array([7, 7, 7]) },
      false
    );
  });

  it('keeps a listener registered before attach, which is when keys are re-emitted', () => {
    const { session, emitKey } = makeSession();
    const pipeline = createCallKeyPipeline();
    const onKey = vi.fn<CallKeyListener>();

    pipeline.setOnKey(onKey);
    pipeline.attach(session, localIdentity);
    emitKey([1], 0, 'own-backend', localParts);

    expect(onKey).toHaveBeenCalledWith(
      { identity: 'own-backend', keyIndex: 0, key: new Uint8Array([1]) },
      true
    );
  });

  it('resolves the own-key wait on the key whose membership is ours', async () => {
    const { session, emitKey } = makeSession();
    const pipeline = createCallKeyPipeline();
    pipeline.attach(session, localIdentity);

    const wait = pipeline.waitForOwnKey();
    emitKey([1], 0, 'other-backend');

    emitKey([2], 0, 'own-backend', localParts);
    await expect(wait).resolves.toBeUndefined();
  });

  it('resolves the own-key wait for a key that arrived before the wait started', async () => {
    const { session, emitKey } = makeSession();
    const pipeline = createCallKeyPipeline();
    pipeline.attach(session, localIdentity);
    emitKey([2], 0, 'own-backend', localParts);

    await expect(pipeline.waitForOwnKey()).resolves.toBeUndefined();
  });

  it('rejects the own-key wait after the timeout', async () => {
    vi.useFakeTimers();
    const { session } = makeSession();
    const pipeline = createCallKeyPipeline();
    pipeline.attach(session, localIdentity);

    const waitError = pipeline.waitForOwnKey().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(ownKeyWaitTimeoutMs);
    const timeoutError = await waitError;
    expect(timeoutError).toBeInstanceOf(Error);
    expect((timeoutError as Error).message).toBe(OWN_KEY_UNAVAILABLE_ERROR);
  });

  it('rejects a pending own-key wait on detach', async () => {
    const { session } = makeSession();
    const pipeline = createCallKeyPipeline();
    pipeline.attach(session, localIdentity);

    const waitError = pipeline.waitForOwnKey().catch((error: unknown) => error);
    pipeline.detach();
    const detachError = await waitError;
    expect(detachError).toBeInstanceOf(Error);
    expect((detachError as Error).message).toBe(OWN_KEY_WAIT_CANCELLED_ERROR);
    expect(pipeline.getKeys()).toEqual([]);
  });
});
