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
import type { NativeCallSnapshot } from '@sableclient/tauri-plugin-livekit-mobile';
import type { NativeCallSession } from '$state/nativeCall';
import {
  acquireCallOwner,
  getActiveCallOwner,
  resetCallOwnerForTests,
  type CallOwnerLease,
} from '$state/callOwner';

const systemCalls = vi.hoisted(() => ({
  drainPendingSystemCallActions: vi.fn<() => Promise<unknown[]>>(async () => []),
  endSystemCall: vi.fn<() => Promise<void>>(async () => {}),
  fulfillAnswerCall: vi.fn<() => Promise<void>>(async () => {}),
  fulfillEndCall: vi.fn<() => Promise<void>>(async () => {}),
  onSystemCallAction: vi.fn<(handler: (action: unknown) => void) => Promise<void>>(
    async (handler) => {
      systemCalls.handler = handler;
    }
  ),
  reportSystemCallConnected: vi.fn<() => Promise<void>>(async () => {}),
  setSystemCallMuted: vi.fn<() => Promise<void>>(async () => {}),
  startSystemCall: vi.fn<() => Promise<void>>(async () => {}),
  updateCallDisplay: vi.fn<() => Promise<void>>(async () => {}),
  connectNativeCall: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  disconnectNativeCall: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getAudioRoutes: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getNativeCallState: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  listenNativeCallSnapshot: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  setAudioRoute: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  setNativeCallCameraEnabled: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  setNativeCallEncryptionKey: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  setNativeCallMicrophoneEnabled: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  setNativeCallPiPEnabled: vi.fn<() => Promise<void>>(async () => {}),
  setNativeCallScreenShareEnabled: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  switchNativeCallCamera: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  handler: undefined as ((action: unknown) => void) | undefined,
}));

vi.mock('@sableclient/tauri-plugin-livekit-mobile', () => systemCalls);

const OWN_IDENTITY = '@alice:example.org:DEVICE';
const OWN_PARTS = {
  userId: '@alice:example.org',
  deviceId: 'DEVICE',
} as CallMembershipIdentityParts;
const REMOTE_PARTS = {
  userId: '@bob:example.org',
  deviceId: 'BOBDEVICE',
} as CallMembershipIdentityParts;
const room = {
  roomId: '!room:example.org',
  loadMembersIfNeeded: () => Promise.resolve(true),
  membersLoaded: () => true,
  getMembersWithMembership: () => [{}, {}],
  getJoinedMemberCount: () => 2,
  // MSC4143 ties media encryption to the room; these tests cover the
  // encrypted case, where the key pipeline runs.
  hasEncryptionStateEvent: () => true,
} as unknown as Room;
const unencryptedRoom = Object.create(room, {
  hasEncryptionStateEvent: { value: () => false },
}) as Room;
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
  screenShareEnabled: false,
  participantCount: 0,
});

const connectedSnapshot = (callId: string): NativeCallSnapshot => ({
  revision: 1,
  callId,
  connectionState: 'connected',
  microphoneEnabled: true,
  cameraEnabled: false,
  screenShareEnabled: false,
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
    getOldestMembership: vi.fn<() => CallMembership | undefined>(() => undefined),
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

const emitKey = (
  session: TestSession,
  key: number[],
  keyIndex: number,
  identity: string,
  parts: CallMembershipIdentityParts = OWN_PARTS
): void => {
  session.handlers.get(MatrixRTCSessionEvent.EncryptionKeyChanged)?.(
    new Uint8Array(key),
    keyIndex,
    parts,
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
    on: vi.fn<(event: string, cb: unknown) => void>(),
    removeListener: vi.fn<(event: string, cb: unknown) => void>(),
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

const startOptions = (
  session: MatrixRTCSession,
  video = false,
  microphone = true,
  callRoom: Room = room
) => ({
  mx: makeClient(session),
  room: callRoom,
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
  vi.clearAllMocks();
  systemCalls.handler = undefined;
});

describe('native call controller', () => {
  it('routes a system answer into the matching room call and fulfills its UUID', async () => {
    const session = makeSession();
    const { dependencies } = makeDependencies([]);
    const controller = createNativeCallController(dependencies);
    const onAnswer = vi.fn<(event: Event) => void>();
    window.addEventListener('nativeCallAnswer', onAnswer);

    try {
      await vi.waitFor(() => expect(systemCalls.handler).toBeDefined());
      systemCalls.handler?.({ action: 'answer', roomId: room.roomId, uuid: 'answer-uuid' });
      expect(onAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ detail: { roomId: room.roomId } })
      );

      const startPromise = controller.start(startOptions(session, false, true, unencryptedRoom));
      await waitForMembershipListener(session);
      emitOwnMembership(session);
      await startPromise;

      expect(systemCalls.startSystemCall).toHaveBeenCalledWith(
        expect.objectContaining({ callId: 'call-id', uuid: 'answer-uuid' })
      );
      expect(systemCalls.fulfillAnswerCall).toHaveBeenCalledWith('answer-uuid');
    } finally {
      window.removeEventListener('nativeCallAnswer', onAnswer);
    }
  });

  it('drains a queued system answer after the webview resumes', async () => {
    const session = makeSession();
    const { dependencies } = makeDependencies([]);
    systemCalls.drainPendingSystemCallActions.mockResolvedValueOnce([
      { action: 'answer', roomId: room.roomId, uuid: 'queued-answer-uuid' },
    ]);
    const onAnswer = vi.fn<(event: Event) => void>();
    window.addEventListener('nativeCallAnswer', onAnswer);

    try {
      const controller = createNativeCallController(dependencies);
      await vi.waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1));

      const startPromise = controller.start(startOptions(session, false, true, unencryptedRoom));
      await waitForMembershipListener(session);
      emitOwnMembership(session);
      await startPromise;

      expect(systemCalls.fulfillAnswerCall).toHaveBeenCalledWith('queued-answer-uuid');
    } finally {
      window.removeEventListener('nativeCallAnswer', onAnswer);
    }
  });

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
      [{ ...transport, livekit_alias: room.roomId }],
      undefined,
      {
        callIntent: 'audio',
        membershipEventExpiryMs: 30 * 60 * 1000,
        notificationType: 'notification',
        manageMediaKeys: true,
      }
    );
    expect(connectCall).toHaveBeenCalled();
  });

  it('runs an unencrypted call with no key pipeline and no managed media keys', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const { dependencies, connectCall, setEncryptionKey } = makeDependencies(order);
    const controller = createNativeCallController(dependencies);

    const startPromise = controller.start(startOptions(session, false, true, unencryptedRoom));
    await waitForMembershipListener(session);
    emitOwnMembership(session);
    // No own key is ever emitted: an unencrypted call must not wait for one.
    await startPromise;

    // MSC4143 forbids MatrixRTC encryption in an unencrypted room, so nothing
    // of the key pipeline may run for one.
    expect(order).toEqual(['join', 'connect']);
    expect(session.reemitEncryptionKeys).not.toHaveBeenCalled();
    expect(session.joinRTCSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      expect.not.objectContaining({ manageMediaKeys: expect.anything() })
    );
    expect(connectCall).toHaveBeenCalledWith(expect.objectContaining({ encryptionKeys: [] }));
    expect(setEncryptionKey).not.toHaveBeenCalled();
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
    emitKey(session, [9, 9], 0, 'remote-backend', REMOTE_PARTS);
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
    // The known keys are replayed once the connection resolves so that anything
    // arriving during the connect window still reaches the plugin. Re-sending a
    // key into the same ring slot is a no-op for LiveKit.
    expect(setEncryptionKey).toHaveBeenCalledTimes(2);
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
    emitKey(session, [9, 9], 0, 'remote-backend', REMOTE_PARTS);
    emitKey(session, [1], 0, OWN_IDENTITY);
    expect(setEncryptionKey).not.toHaveBeenCalled();
    await startPromise;
    // Known keys are replayed once connected, so nothing that arrived during
    // the connect window is stranded.
    expect(setEncryptionKey).toHaveBeenCalledTimes(2);

    setEncryptionKey.mockClear();
    emitKey(session, [5, 6, 7, 8], 4, 'remote-backend', REMOTE_PARTS);
    expect(connectCall).toHaveBeenCalledTimes(1);
    expect(setEncryptionKey).toHaveBeenCalledWith({
      callId: 'call-id',
      identity: 'remote-backend',
      keyIndex: 4,
      key: 'BQYHCA==',
    });

    // An index is a slot in LiveKit's per-participant key ring, not a sequence,
    // and a peer that rejoins restarts at 0. Every key is passed through: any
    // filtering here strands the frames encrypted with the key we dropped.
    setEncryptionKey.mockClear();
    emitKey(session, [8, 8], 2, 'remote-backend', REMOTE_PARTS);
    expect(setEncryptionKey).toHaveBeenCalledWith({
      callId: 'call-id',
      identity: 'remote-backend',
      keyIndex: 2,
      key: 'CAg=',
    });
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
    // A normal end clears the session; it is not an error the user must dismiss.
    expect(lastSession(harness.setSession)).toBeUndefined();
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
    // The failure code is mapped to user-facing copy, not passed through raw.
    expect(lastSession(harness.setSession)).toMatchObject({
      lifecycle: 'error',
      error: 'The connection to the call was lost.',
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
      expect(failed?.error).toContain('Could not connect to the call.');
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
