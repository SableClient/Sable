import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MatrixRTCSessionEvent,
  type CallMembership,
  type CallMembershipIdentityParts,
  type MatrixClient,
  type MatrixRTCSession,
  type Room,
} from '$types/matrix-sdk';
import {
  createNativeCallController,
  type NativeCallControllerDependencies,
} from './nativeCallController';
import type { NativeCallSnapshot } from './livekitMobileBridge';
import type { NativeCallSession } from '$state/nativeCall';
import {
  acquireCallOwner,
  getActiveCallOwner,
  resetCallOwnerForTests,
  type CallOwnerLease,
} from '$state/callOwner';

const OWN_IDENTITY = '@alice:example.org:DEVICE';
const room = { roomId: '!room:example.org' } as Room;
const transport = { type: 'livekit' as const, livekit_service_url: 'https://sfu.example' };
const ownMembership = {
  userId: '@alice:example.org',
  deviceId: 'DEVICE',
  rtcBackendIdentity: OWN_IDENTITY,
} as CallMembership;

const idleSnapshot = (callId: string | null = null): NativeCallSnapshot => ({
  revision: 1,
  callId,
  connectionState: 'idle',
  microphoneEnabled: false,
  cameraEnabled: false,
  participantCount: 0,
});

const connectedSnapshot = (callId: string): NativeCallSnapshot => ({
  revision: 1,
  callId,
  connectionState: 'connected',
  microphoneEnabled: true,
  cameraEnabled: false,
  participantCount: 1,
});

type SessionHandler = (...args: unknown[]) => void;

type TestSession = MatrixRTCSession & {
  handlers: Map<MatrixRTCSessionEvent, SessionHandler>;
};

const makeSession = (order: string[] = []): TestSession => {
  const handlers = new Map<MatrixRTCSessionEvent, SessionHandler>();
  const session = {
    handlers,
    memberships: [] as CallMembership[],
    slotId: 'm.call#real-slot',
    on: vi.fn<(event: MatrixRTCSessionEvent, handler: SessionHandler) => void>((event, handler) => {
      if (event === MatrixRTCSessionEvent.EncryptionKeyChanged) order.push('attach-keys');
      handlers.set(event, handler);
    }),
    off: vi.fn<(event: MatrixRTCSessionEvent, handler: SessionHandler) => void>(
      (event, handler) => {
        if (handlers.get(event) === handler) handlers.delete(event);
      }
    ),
    removeListener: vi.fn<(event: MatrixRTCSessionEvent, handler: SessionHandler) => void>(
      (event, handler) => {
        if (handlers.get(event) === handler) handlers.delete(event);
      }
    ),
    reemitEncryptionKeys: vi.fn<() => void>(),
    joinRTCSession: vi.fn<() => void>(() => order.push('join')),
    leaveRoomSession: vi.fn<() => Promise<boolean>>(async () => {
      order.push('leave');
      return true;
    }),
  } as unknown as TestSession;
  return session;
};

const emitOwnMembership = (session: TestSession): void => {
  session.memberships = [ownMembership];
  session.handlers.get(MatrixRTCSessionEvent.MembershipsChanged)?.([], [ownMembership]);
};

const emitKey = (session: TestSession, key: number[], keyIndex: number, identity: string): void => {
  session.handlers.get(MatrixRTCSessionEvent.EncryptionKeyChanged)?.(
    new Uint8Array(key),
    keyIndex,
    {} as CallMembershipIdentityParts,
    identity
  );
};

const waitForMembershipListener = async (session: TestSession): Promise<void> => {
  await vi.waitFor(() =>
    expect(session.on).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.MembershipsChanged,
      expect.any(Function)
    )
  );
};

const flushMicrotasks = async (ticks = 20): Promise<void> => {
  for (let index = 0; index < ticks; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- flushing chained microtasks one tick at a time
    await Promise.resolve();
  }
};

const makeClient = (session: MatrixRTCSession): MatrixClient =>
  ({
    getDeviceId: () => 'DEVICE',
    getSafeUserId: () => '@alice:example.org',
    matrixRTC: { getRoomSession: () => session },
  }) as unknown as MatrixClient;

type Harness = {
  dependencies: NativeCallControllerDependencies;
  setSession: ReturnType<typeof vi.fn<(session: NativeCallSession | undefined) => void>>;
  connectCall: ReturnType<typeof vi.fn>;
  disconnectCall: ReturnType<typeof vi.fn>;
  setCamera: ReturnType<typeof vi.fn>;
  setEncryptionKey: ReturnType<typeof vi.fn>;
  emitSnapshot: (snapshot: NativeCallSnapshot) => void;
  unlisten: ReturnType<typeof vi.fn<() => void>>;
};

const makeDependencies = (order: string[]): Harness => {
  const setSession = vi.fn<(session: NativeCallSession | undefined) => void>();
  const connectCall = vi.fn<() => Promise<NativeCallSnapshot>>(async () => {
    order.push('connect');
    return connectedSnapshot('call-id');
  });
  const disconnectCall = vi.fn<() => Promise<NativeCallSnapshot>>(async () => {
    order.push('native-disconnect');
    return idleSnapshot();
  });
  const setCamera = vi.fn<() => Promise<NativeCallSnapshot>>(async () =>
    connectedSnapshot('call-id')
  );
  const setMicrophone = vi.fn<() => Promise<NativeCallSnapshot>>(async () =>
    connectedSnapshot('call-id')
  );
  const setEncryptionKey = vi.fn<() => Promise<NativeCallSnapshot>>(async () =>
    connectedSnapshot('call-id')
  );
  const unlisten = vi.fn<() => void>();
  let snapshotHandler: ((snapshot: NativeCallSnapshot) => void) | undefined;

  return {
    setSession,
    connectCall,
    disconnectCall,
    setCamera,
    setEncryptionKey,
    unlisten,
    emitSnapshot: (snapshot) => snapshotHandler?.(snapshot),
    dependencies: {
      setSession,
      connectCall,
      disconnectCall,
      setCamera,
      setMicrophone,
      setEncryptionKey,
      listenSnapshot: async (handler) => {
        snapshotHandler = handler;
        return unlisten;
      },
      getPreferredTransport: async () => transport,
      provisionToken: async () => ({ url: 'wss://livekit.example', jwt: 'jwt' }),
      createCallId: () => 'call-id',
    },
  };
};

const startOptions = (session: MatrixRTCSession, video = false, microphone = true) => ({
  mx: makeClient(session),
  room,
  dm: false,
  video,
  microphone,
  ongoing: false,
});

const lastSession = (
  setSession: ReturnType<typeof vi.fn<(session: NativeCallSession | undefined) => void>>
): NativeCallSession | undefined => setSession.mock.calls.at(-1)?.[0];

beforeEach(() => {
  resetCallOwnerForTests();
});

describe('native call controller', () => {
  it('attaches the key forwarder before the Matrix join with managed media keys', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const { dependencies, connectCall } = makeDependencies(order);
    const controller = createNativeCallController(dependencies);

    const startPromise = controller.start(startOptions(session));
    await waitForMembershipListener(session);
    expect(order).toEqual(['attach-keys', 'join']);
    emitOwnMembership(session);
    emitKey(session, [1], 0, OWN_IDENTITY);
    await startPromise;

    expect(session.joinRTCSession).toHaveBeenCalledWith(
      { userId: '@alice:example.org', deviceId: 'DEVICE', memberId: '@alice:example.org:DEVICE' },
      [transport],
      undefined,
      { callIntent: 'audio', notificationType: 'notification', manageMediaKeys: true }
    );
    expect(connectCall).toHaveBeenCalled();
  });

  it('gates the native connect on the own-identity key and caches other keys', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const { dependencies, connectCall, setEncryptionKey } = makeDependencies(order);
    const controller = createNativeCallController(dependencies);

    const startPromise = controller.start(startOptions(session));
    await waitForMembershipListener(session);
    emitOwnMembership(session);
    await vi.waitFor(() => expect(session.joinRTCSession).toHaveBeenCalled());
    emitKey(session, [9, 9], 0, 'remote-backend');
    await Promise.resolve();
    expect(connectCall).not.toHaveBeenCalled();

    emitKey(session, [1, 2, 3, 4], 1, OWN_IDENTITY);
    await startPromise;

    expect(connectCall).toHaveBeenCalledWith({
      callId: 'call-id',
      url: 'wss://livekit.example',
      token: 'jwt',
      microphoneEnabled: true,
      encryptionKeys: [
        { identity: 'remote-backend', keyIndex: 0, key: 'CQk=' },
        { identity: OWN_IDENTITY, keyIndex: 1, key: 'AQIDBA==' },
      ],
    });
    expect(lastSession(dependencies.setSession as Harness['setSession'])).toMatchObject({
      backend: 'livekit-mobile',
      roomId: room.roomId,
      callId: 'call-id',
      lifecycle: 'connected',
    });
    expect(setEncryptionKey).not.toHaveBeenCalled();
  });

  it('joins muted when the prescreen microphone was off', async () => {
    const session = makeSession();
    const { dependencies, connectCall } = makeDependencies([]);
    const controller = createNativeCallController(dependencies);

    const startPromise = controller.start(startOptions(session, false, false));
    await waitForMembershipListener(session);
    emitOwnMembership(session);
    await vi.waitFor(() => expect(session.joinRTCSession).toHaveBeenCalled());
    emitKey(session, [1, 2, 3, 4], 1, OWN_IDENTITY);
    await startPromise;

    expect(connectCall).toHaveBeenCalledWith(expect.objectContaining({ microphoneEnabled: false }));
  });

  it('rotates keys through the set command only after connect resolves', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const { dependencies, connectCall, setEncryptionKey } = makeDependencies(order);
    const controller = createNativeCallController(dependencies);

    const startPromise = controller.start(startOptions(session));
    await waitForMembershipListener(session);
    emitOwnMembership(session);
    emitKey(session, [9, 9], 0, 'remote-backend');
    emitKey(session, [1], 0, OWN_IDENTITY);
    expect(setEncryptionKey).not.toHaveBeenCalled();
    await startPromise;
    expect(setEncryptionKey).not.toHaveBeenCalled();

    emitKey(session, [5, 6, 7, 8], 4, 'remote-backend');
    expect(connectCall).toHaveBeenCalledTimes(1);
    expect(setEncryptionKey).toHaveBeenCalledWith({
      callId: 'call-id',
      identity: 'remote-backend',
      keyIndex: 4,
      key: 'BQYHCA==',
    });

    setEncryptionKey.mockClear();
    emitKey(session, [5, 6, 7, 8], 4, 'remote-backend');
    emitKey(session, [8, 8], 2, 'remote-backend');
    expect(setEncryptionKey).not.toHaveBeenCalled();
  });

  it('disconnects natively before leaving Matrix, detaches, and releases the owner once', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const harness = makeDependencies(order);
    const release = vi.fn<() => void>();
    harness.dependencies.acquireOwner = (): CallOwnerLease => ({
      kind: 'livekit-mobile',
      roomId: room.roomId,
      release,
    });
    const controller = createNativeCallController(harness.dependencies);

    const startPromise = controller.start(startOptions(session));
    await waitForMembershipListener(session);
    emitOwnMembership(session);
    emitKey(session, [1], 0, OWN_IDENTITY);
    await startPromise;
    order.length = 0;

    const connected = lastSession(harness.setSession);
    expect(connected?.lifecycle).toBe('connected');
    await connected?.hangup();
    await connected?.hangup();

    expect(order).toEqual(['native-disconnect', 'leave']);
    expect(session.off).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      expect.any(Function)
    );
    expect(harness.unlisten).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(lastSession(harness.setSession)).toBeUndefined();
  });

  it('enables the camera after connect only when video was requested', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const { dependencies, setCamera } = makeDependencies(order);
    const controller = createNativeCallController(dependencies);

    const startPromise = controller.start(startOptions(session, true));
    await waitForMembershipListener(session);
    emitOwnMembership(session);
    emitKey(session, [1], 0, OWN_IDENTITY);
    await startPromise;

    expect(order).toEqual(['attach-keys', 'join', 'connect']);
    expect(setCamera).toHaveBeenCalledWith({ callId: 'call-id', enabled: true });

    // Release the owner lease so the audio-path controller can start.
    await lastSession(dependencies.setSession as Harness['setSession'])?.hangup();

    const audioOrder: string[] = [];
    const audioSession = makeSession(audioOrder);
    const audioHarness = makeDependencies(audioOrder);
    const audioController = createNativeCallController(audioHarness.dependencies);
    const audioStart = audioController.start(startOptions(audioSession));
    await waitForMembershipListener(audioSession);
    emitOwnMembership(audioSession);
    emitKey(audioSession, [1], 0, OWN_IDENTITY);
    await audioStart;
    expect(audioHarness.setCamera).not.toHaveBeenCalled();
  });

  it('tracks lifecycle and media flags from snapshots and ends on a terminal snapshot', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const harness = makeDependencies(order);
    const controller = createNativeCallController(harness.dependencies);

    const startPromise = controller.start(startOptions(session));
    await waitForMembershipListener(session);
    emitOwnMembership(session);
    emitKey(session, [1], 0, OWN_IDENTITY);
    await startPromise;

    harness.emitSnapshot({
      ...connectedSnapshot('call-id'),
      connectionState: 'reconnecting',
      microphoneEnabled: false,
      cameraEnabled: true,
    });
    expect(lastSession(harness.setSession)).toMatchObject({
      lifecycle: 'reconnecting',
      microphoneEnabled: false,
      cameraEnabled: true,
    });

    order.length = 0;
    harness.emitSnapshot(idleSnapshot(null));
    await vi.waitFor(() => expect(session.leaveRoomSession).toHaveBeenCalled());
    expect(order).toEqual(['native-disconnect', 'leave']);
    expect(lastSession(harness.setSession)).toMatchObject({
      lifecycle: 'error',
      error: 'Native call ended.',
    });
    expect(getActiveCallOwner()).toBeUndefined();
  });

  it('treats a failed snapshot for the current call as a call failure', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const harness = makeDependencies(order);
    const controller = createNativeCallController(harness.dependencies);

    const startPromise = controller.start(startOptions(session));
    await waitForMembershipListener(session);
    emitOwnMembership(session);
    emitKey(session, [1], 0, OWN_IDENTITY);
    await startPromise;

    harness.emitSnapshot({
      ...idleSnapshot('call-id'),
      connectionState: 'failed',
      lastError: { code: 'disconnected', message: 'disconnected' },
    });
    await vi.waitFor(() => expect(harness.disconnectCall).toHaveBeenCalled());
    expect(lastSession(harness.setSession)).toMatchObject({
      lifecycle: 'error',
      error: 'Native call connection failed.',
    });
  });

  it('cleans up and hides secrets when the own-key wait times out', async () => {
    vi.useFakeTimers();
    try {
      const order: string[] = [];
      const session = makeSession(order);
      const harness = makeDependencies(order);
      const controller = createNativeCallController(harness.dependencies);

      const startPromise = controller.start(startOptions(session));
      await flushMicrotasks();
      expect(session.on).toHaveBeenCalledWith(
        MatrixRTCSessionEvent.MembershipsChanged,
        expect.any(Function)
      );
      emitOwnMembership(session);
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(10_000);
      await startPromise;

      expect(harness.connectCall).not.toHaveBeenCalled();
      expect(order).toEqual(['attach-keys', 'join', 'native-disconnect', 'leave']);
      const failed = lastSession(harness.setSession);
      expect(failed).toMatchObject({ lifecycle: 'error' });
      expect(failed?.error).toContain('Native call setup failed during connecting.');
      // The surfaced message must never carry the provisioned token.
      expect(failed?.error).not.toContain('jwt');
      expect(getActiveCallOwner()).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start while another call owns the owner lease', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const harness = makeDependencies(order);
    const onCleanup = vi.fn<() => void>();
    harness.dependencies.onCleanup = onCleanup;
    const elementLease = acquireCallOwner('element', '!other:example.org');

    const controller = createNativeCallController(harness.dependencies);
    await controller.start(startOptions(session));

    expect(session.joinRTCSession).not.toHaveBeenCalled();
    expect(harness.setSession).not.toHaveBeenCalled();
    expect(onCleanup).toHaveBeenCalled();
    elementLease?.release();
  });

  it('ignores a second start while a native call is active', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const harness = makeDependencies(order);
    const controller = createNativeCallController(harness.dependencies);

    const startPromise = controller.start(startOptions(session));
    await waitForMembershipListener(session);
    emitOwnMembership(session);
    emitKey(session, [1], 0, OWN_IDENTITY);
    await startPromise;

    const secondSession = makeSession();
    await controller.start(startOptions(secondSession));
    expect(secondSession.joinRTCSession).not.toHaveBeenCalled();
    expect(harness.connectCall).toHaveBeenCalledTimes(1);
  });
});
