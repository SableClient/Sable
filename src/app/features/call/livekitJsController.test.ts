import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  MatrixRTCSessionEvent,
  type CallMembership,
  type MatrixRTCSession,
} from '$types/matrix-sdk';
import type { MatrixClient, Room as MatrixRoom } from '$types/matrix-sdk';
import type { RoomOptions } from 'livekit-client';
import {
  createLivekitJsController,
  type LivekitJsControllerDependencies,
} from './livekitJsController';
import type {
  LivekitMatrixKeyProvider,
  LivekitMatrixKeyProviderState,
} from './livekitMatrixKeyProvider';
import type { CallEncryptionKey } from './callTransport';
import { resetCallOwnerForTests } from '$state/callOwner';

const transport = {
  type: 'livekit' as const,
  livekit_service_url: 'https://sfu.example',
};
const makeMatrixRoom = (encrypted: boolean): MatrixRoom =>
  ({
    roomId: '!room:example.org',
    loadMembersIfNeeded: () => Promise.resolve(true),
    membersLoaded: () => true,
    getMembersWithMembership: () => [{}, {}],
    getJoinedMemberCount: () => 2,
    // MSC4143 ties media encryption to the room.
    hasEncryptionStateEvent: () => encrypted,
  }) as unknown as MatrixRoom;

const room = makeMatrixRoom(true);
const unencryptedRoom = makeMatrixRoom(false);
const membership = {
  userId: '@alice:example.org',
  deviceId: 'DEVICE',
  rtcBackendIdentity: 'local-backend-identity',
} as CallMembership;

const deferred = <T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
};

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
    on: vi.fn<(...args: unknown[]) => void>().mockImplementation((event, handler) => {
      if (event === MatrixRTCSessionEvent.EncryptionKeyChanged) order.push('attach');
      handlers.set(event as MatrixRTCSessionEvent, handler as SessionHandler);
    }),
    off: vi.fn<(...args: unknown[]) => void>().mockImplementation((event, handler) => {
      if (event === MatrixRTCSessionEvent.EncryptionKeyChanged) order.push('detach');
      if (handlers.get(event as MatrixRTCSessionEvent) === handler) {
        handlers.delete(event as MatrixRTCSessionEvent);
      }
    }),
    reemitEncryptionKeys: vi.fn<() => void>(),
    removeListener: vi.fn<(...args: unknown[]) => void>().mockImplementation((event, handler) => {
      if (handlers.get(event as MatrixRTCSessionEvent) === handler) {
        handlers.delete(event as MatrixRTCSessionEvent);
      }
    }),
    joinRTCSession: vi
      .fn<(...args: unknown[]) => void>()
      .mockImplementation(() => order.push('join')),
    getOldestMembership: vi.fn<() => CallMembership | undefined>().mockReturnValue(undefined),
    leaveRoomSession: vi.fn<MatrixRTCSession['leaveRoomSession']>().mockImplementation(async () => {
      order.push('leave');
      return true;
    }),
  } as unknown as TestSession;
  return session;
};

const emitOwnMembership = (session: TestSession): void => {
  session.memberships = [membership];
  session.handlers.get(MatrixRTCSessionEvent.MembershipsChanged)?.([], [membership]);
};

type FakeProvider = {
  state: LivekitMatrixKeyProviderState;
  emit: (state: LivekitMatrixKeyProviderState) => void;
  setKey: Mock<(key: CallEncryptionKey, own: boolean) => void>;
  reset: Mock<() => void>;
  getKeyState: Mock<() => LivekitMatrixKeyProviderState>;
  subscribe: Mock<
    (listener: (state: Readonly<LivekitMatrixKeyProviderState>) => void) => () => void
  >;
};

const makeProvider = (state: Partial<LivekitMatrixKeyProviderState> = {}): FakeProvider => {
  const listeners = new Set<(state: Readonly<LivekitMatrixKeyProviderState>) => void>();
  const provider = {
    emit: (next: LivekitMatrixKeyProviderState) =>
      listeners.forEach((listener) => listener(next)),
    state: {
      ready: false,
      localOutboundIdentity: null,
      keyIndex: null,
      lastImportFailure: null,
      ...state,
    },
    setKey: vi.fn<(key: CallEncryptionKey, own: boolean) => void>(),
    reset: vi.fn<() => void>(),
    getKeyState: vi.fn<() => LivekitMatrixKeyProviderState>(),
    subscribe:
      vi.fn<(listener: (state: Readonly<LivekitMatrixKeyProviderState>) => void) => () => void>(),
  } as FakeProvider;
  provider.getKeyState.mockImplementation(() => provider.state);
  provider.subscribe.mockImplementation((listener) => {
    listeners.add(listener);
    listener(provider.state);
    return () => listeners.delete(listener);
  });
  return provider;
};

const makeClient = (session: MatrixRTCSession): MatrixClient =>
  ({
    getDeviceId: () => 'DEVICE',
    getSafeUserId: () => '@alice:example.org',
    matrixRTC: { getRoomSession: () => session },
    on: vi.fn<(event: string, cb: unknown) => void>(),
    removeListener: vi.fn<(event: string, cb: unknown) => void>(),
  }) as unknown as MatrixClient;

const makeDependencies = (
  session: TestSession,
  order: string[],
  provider = makeProvider()
): {
  dependencies: LivekitJsControllerDependencies;
  provider: FakeProvider;
  roomOptions: { value?: RoomOptions };
  livekitRoom: {
    connect: Mock<(url: string, token: string, options?: unknown) => Promise<void>>;
    disconnect: Mock<() => Promise<void>>;
    setE2EEEnabled: Mock<(enabled: boolean) => Promise<void>>;
  };
} => {
  const worker = { terminate: vi.fn<() => void>() } as unknown as Worker;
  const livekitRoom = {
    connect: vi
      .fn<(url: string, token: string, options?: unknown) => Promise<void>>()
      .mockImplementation(async () => {
        order.push('connect');
      }),
    disconnect: vi.fn<() => Promise<void>>().mockImplementation(async () => {
      order.push('disconnect');
    }),
    setE2EEEnabled: vi.fn<(enabled: boolean) => Promise<void>>().mockImplementation(async () => {
      order.push('e2ee-enabled');
    }),
  };
  const roomOptions: { value?: RoomOptions } = {};
  return {
    provider,
    roomOptions,
    livekitRoom,
    dependencies: {
      createKeyProvider: () => provider as unknown as LivekitMatrixKeyProvider,
      isE2EESupported: () => true,
      createWorker: () => {
        order.push('worker');
        return worker;
      },
      createRoom: (options) => {
        order.push('room');
        roomOptions.value = options;
        return livekitRoom;
      },
      getPreferredTransport: async () => {
        order.push('transport');
        return transport;
      },
      provisionToken: async () => {
        order.push('provision');
        return { url: 'wss://livekit.example', jwt: 'jwt' };
      },
    },
  };
};

const connectToActive = async (
  controller: ReturnType<typeof createLivekitJsController>,
  session: TestSession,
  matrixRoom: MatrixRoom = room
): Promise<void> => {
  const connectPromise = controller.connect({ mx: makeClient(session), room: matrixRoom });
  await vi.waitFor(() =>
    expect(session.on).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.MembershipsChanged,
      expect.any(Function)
    )
  );
  emitOwnMembership(session);
  await connectPromise;
};

describe('livekit JS controller', () => {
  beforeEach(() => {
    resetCallOwnerForTests();
  });

  it('attaches E2EE before joining and provisions before connecting one Room', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const { dependencies, provider, roomOptions, livekitRoom } = makeDependencies(session, order);
    const controller = createLivekitJsController(dependencies);

    await connectToActive(controller, session);

    expect(order).toEqual([
      'attach',
      'transport',
      'join',
      'provision',
      'worker',
      'room',
      'connect',
      'e2ee-enabled',
    ]);
    expect(session.reemitEncryptionKeys).toHaveBeenCalledBefore(session.joinRTCSession as Mock);
    expect(session.joinRTCSession).toHaveBeenCalledWith(
      {
        userId: '@alice:example.org',
        deviceId: 'DEVICE',
        memberId: '@alice:example.org:DEVICE',
      },
      [{ ...transport, livekit_alias: room.roomId }],
      undefined,
      {
        callIntent: 'audio',
        membershipEventExpiryMs: 30 * 60 * 1000,
        notificationType: 'notification',
        manageMediaKeys: true,
      }
    );
    expect(roomOptions.value?.encryption).toEqual({
      keyProvider: provider,
      worker: expect.anything(),
    });
    expect(roomOptions.value?.adaptiveStream).toBe(true);
    expect(roomOptions.value?.dynacast).toBe(false);
    // Without this the local participant stays on Encryption_Type.NONE and
    // livekit-client passes outbound frames through unencrypted.
    expect(livekitRoom.setE2EEEnabled).toHaveBeenCalledWith(true);
    expect(controller.getState().room).toBe(livekitRoom);
    expect(controller.getState().lifecycle).toBe('active');
  });

  it('runs an unencrypted call with no worker, key provider or encryption option', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const { dependencies, provider, roomOptions, livekitRoom } = makeDependencies(session, order);
    const createKeyProvider = vi
      .fn<() => LivekitMatrixKeyProvider>()
      .mockReturnValue(provider as unknown as LivekitMatrixKeyProvider);
    dependencies.createKeyProvider = createKeyProvider;
    const controller = createLivekitJsController(dependencies);

    await connectToActive(controller, session, unencryptedRoom);

    // MSC4143 forbids MatrixRTC encryption in an unencrypted room, so nothing
    // of the key pipeline may be built for one.
    expect(createKeyProvider).not.toHaveBeenCalled();
    expect(order).toEqual(['transport', 'join', 'provision', 'room', 'connect']);
    expect(roomOptions.value?.encryption).toBeUndefined();
    expect(roomOptions.value?.adaptiveStream).toBe(true);
    expect(roomOptions.value?.dynacast).toBe(false);
    expect(livekitRoom.setE2EEEnabled).not.toHaveBeenCalled();
    expect(session.joinRTCSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      expect.not.objectContaining({ manageMediaKeys: expect.anything() })
    );
    expect(controller.getState().lifecycle).toBe('active');
  });

  it('reports media ready at once when the room is unencrypted', async () => {
    const session = makeSession();
    const { dependencies } = makeDependencies(session, []);
    const controller = createLivekitJsController(dependencies);

    await connectToActive(controller, session, unencryptedRoom);

    expect(controller.getState().mediaReady).toBe(true);
  });

  it('holds media until the matrix key is imported when the room is encrypted', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const { dependencies } = makeDependencies(session, [], provider);
    const controller = createLivekitJsController(dependencies);

    await connectToActive(controller, session);
    expect(controller.getState().mediaReady).toBe(false);

    provider.state = { ...provider.state, ready: true };
    provider.emit(provider.state);

    expect(controller.getState().mediaReady).toBe(true);
  });

  it('does not run an unencrypted call through the e2ee-unsupported check', async () => {
    const session = makeSession();
    const { dependencies } = makeDependencies(session, []);
    dependencies.isE2EESupported = () => false;
    const controller = createLivekitJsController(dependencies);

    await connectToActive(controller, session, unencryptedRoom);

    expect(controller.getState().lifecycle).toBe('active');
    expect(controller.getState().failure).toBeNull();
  });

  it('refuses unsupported E2EE without joining or creating a Room', async () => {
    const session = makeSession();
    const { dependencies } = makeDependencies(session, []);
    dependencies.isE2EESupported = () => false;
    const controller = createLivekitJsController(dependencies);

    await controller.connect({ mx: makeClient(session), room });

    expect(session.joinRTCSession).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({
      lifecycle: 'failed',
      failure: 'e2ee-unsupported',
    });
  });

  it('refuses a provider import failure without connecting LiveKit', async () => {
    const session = makeSession();
    const provider = makeProvider({ lastImportFailure: 'import-failed' });
    const { dependencies } = makeDependencies(session, [], provider);
    const controller = createLivekitJsController(dependencies);

    await controller.connect({ mx: makeClient(session), room });

    expect(session.joinRTCSession).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({
      lifecycle: 'failed',
      failure: 'e2ee-import-failed',
    });
  });

  it('disconnects LiveKit before leaving MatrixRTC and cleans up idempotently', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const { dependencies, provider } = makeDependencies(session, order);
    const controller = createLivekitJsController(dependencies);
    await connectToActive(controller, session);

    await Promise.all([controller.disconnect(), controller.disconnect()]);

    expect(order.indexOf('disconnect')).toBeGreaterThan(-1);
    expect(order.indexOf('detach')).toBeGreaterThan(order.indexOf('disconnect'));
    expect(order.indexOf('disconnect')).toBeLessThan(order.indexOf('leave'));
    expect(order.indexOf('detach')).toBeLessThan(order.indexOf('leave'));
    expect(provider.reset).toHaveBeenCalledOnce();
    expect(controller.getState().room).toBeUndefined();
    expect(controller.getState().lifecycle).toBe('idle');
  });

  it('detaches once when setup fails after MatrixRTC join', async () => {
    const session = makeSession();
    const { dependencies, provider } = makeDependencies(session, []);
    dependencies.provisionToken = vi
      .fn<NonNullable<LivekitJsControllerDependencies['provisionToken']>>()
      .mockRejectedValue(new Error('provision failed'));
    const controller = createLivekitJsController(dependencies);
    const connectPromise = controller.connect({
      mx: makeClient(session),
      room,
    });

    await vi.waitFor(() =>
      expect(session.on).toHaveBeenCalledWith(
        MatrixRTCSessionEvent.MembershipsChanged,
        expect.any(Function)
      )
    );
    emitOwnMembership(session);
    await connectPromise;

    expect(provider.reset).toHaveBeenCalledOnce();
    expect(session.leaveRoomSession).toHaveBeenCalledOnce();
    expect(controller.getState().room).toBeUndefined();
    expect(controller.getState().lifecycle).toBe('failed');
  });

  it('cancels during provisioning without creating a Room or becoming active', async () => {
    const session = makeSession();
    const pendingProvision = deferred<{ url: string; jwt: string }>();
    const { dependencies, provider, roomOptions } = makeDependencies(session, []);
    dependencies.provisionToken = vi
      .fn<NonNullable<LivekitJsControllerDependencies['provisionToken']>>()
      .mockImplementation(() => pendingProvision.promise);
    const controller = createLivekitJsController(dependencies);
    const connectPromise = controller.connect({
      mx: makeClient(session),
      room,
    });

    await vi.waitFor(() =>
      expect(session.on).toHaveBeenCalledWith(
        MatrixRTCSessionEvent.MembershipsChanged,
        expect.any(Function)
      )
    );
    emitOwnMembership(session);
    await vi.waitFor(() => expect(dependencies.provisionToken).toHaveBeenCalledOnce());
    const disconnectPromise = controller.disconnect();
    pendingProvision.resolve({ url: 'wss://livekit.example', jwt: 'jwt' });
    await Promise.all([connectPromise, disconnectPromise]);

    expect(roomOptions.value).toBeUndefined();
    expect(provider.reset).toHaveBeenCalledOnce();
    expect(session.leaveRoomSession).toHaveBeenCalledOnce();
    expect(controller.getState().room).toBeUndefined();
    expect(controller.getState().lifecycle).toBe('idle');
  });

  it('cancels during Room.connect and cleans up its stale room before leaving', async () => {
    const session = makeSession();
    const pendingConnect = deferred<void>();
    const { dependencies, provider } = makeDependencies(session, []);
    const livekitRoom = {
      connect: vi
        .fn<(url: string, token: string, options?: unknown) => Promise<void>>()
        .mockImplementation(() => pendingConnect.promise),
      disconnect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      setE2EEEnabled: vi.fn<(enabled: boolean) => Promise<void>>().mockResolvedValue(undefined),
    };
    dependencies.createRoom = () => livekitRoom;
    const controller = createLivekitJsController(dependencies);
    const connectPromise = controller.connect({
      mx: makeClient(session),
      room,
    });

    await vi.waitFor(() =>
      expect(session.on).toHaveBeenCalledWith(
        MatrixRTCSessionEvent.MembershipsChanged,
        expect.any(Function)
      )
    );
    emitOwnMembership(session);
    await vi.waitFor(() => expect(livekitRoom.connect).toHaveBeenCalledOnce());
    const disconnectPromise = controller.disconnect();
    pendingConnect.resolve();
    await Promise.all([connectPromise, disconnectPromise]);

    expect(livekitRoom.disconnect).toHaveBeenCalledOnce();
    expect(provider.reset).toHaveBeenCalledOnce();
    expect(session.leaveRoomSession).toHaveBeenCalledOnce();
    expect(controller.getState().lifecycle).toBe('idle');
    expect(controller.getState().lifecycle).not.toBe('active');
  });

  it('rejects duplicate setup and cancellation leaves started MatrixRTC membership', async () => {
    const session = makeSession();
    const { dependencies, provider } = makeDependencies(session, []);
    const controller = createLivekitJsController(dependencies);
    const firstConnect = controller.connect({ mx: makeClient(session), room });
    await vi.waitFor(() =>
      expect(session.on).toHaveBeenCalledWith(
        MatrixRTCSessionEvent.MembershipsChanged,
        expect.any(Function)
      )
    );

    await expect(controller.connect({ mx: makeClient(session), room })).rejects.toThrow(
      'already in use'
    );
    await controller.disconnect();
    await firstConnect;

    expect(session.leaveRoomSession).toHaveBeenCalledWith(5000);
    expect(provider.reset).toHaveBeenCalledOnce();
    expect(controller.getState().lifecycle).toBe('idle');
  });

  it('exposes only lifecycle and state methods', () => {
    const session = makeSession();
    const { dependencies } = makeDependencies(session, []);
    const controller = createLivekitJsController(dependencies);

    expect(Object.keys(controller).toSorted()).toEqual([
      'connect',
      'disconnect',
      'getState',
      'subscribe',
    ]);
  });

  it('disconnects the previous controller before a replacement connects', async () => {
    const firstSession = makeSession();
    const first = makeDependencies(firstSession, []);
    const firstController = createLivekitJsController(first.dependencies);
    await connectToActive(firstController, firstSession);

    const replacementSession = makeSession();
    const replacement = makeDependencies(replacementSession, [], makeProvider({ ready: true }));
    const replacementController = createLivekitJsController(replacement.dependencies);

    await firstController.disconnect();
    expect(firstController.getState().room).toBeUndefined();
    await connectToActive(replacementController, replacementSession);

    expect(replacementController.getState().lifecycle).toBe('active');
  });
});
