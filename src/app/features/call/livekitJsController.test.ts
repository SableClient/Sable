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
import type { LocalCallIdentity } from './livekitCallIdentity';
import { resetCallOwnerForTests } from '$state/callOwner';

const transport = {
  type: 'livekit' as const,
  livekit_service_url: 'https://sfu.example',
};
const room = {
  roomId: '!room:example.org',
  loadMembersIfNeeded: () => Promise.resolve(),
} as unknown as MatrixRoom;
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
      handlers.set(event as MatrixRTCSessionEvent, handler as SessionHandler);
    }),
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
  attach: Mock<(session: MatrixRTCSession, localIdentity: LocalCallIdentity) => void>;
  detach: Mock<() => void>;
  getKeyState: Mock<() => LivekitMatrixKeyProviderState>;
  subscribe: Mock<
    (listener: (state: Readonly<LivekitMatrixKeyProviderState>) => void) => () => void
  >;
};

const makeProvider = (state: Partial<LivekitMatrixKeyProviderState> = {}): FakeProvider => {
  const provider = {
    state: {
      ready: false,
      localOutboundIdentity: null,
      keyIndex: null,
      lastImportFailure: null,
      ...state,
    },
    attach: vi.fn<(session: MatrixRTCSession, localIdentity: LocalCallIdentity) => void>(),
    detach: vi.fn<() => void>(),
    getKeyState: vi.fn<() => LivekitMatrixKeyProviderState>(),
    subscribe:
      vi.fn<(listener: (state: Readonly<LivekitMatrixKeyProviderState>) => void) => () => void>(),
  } as FakeProvider;
  provider.getKeyState.mockImplementation(() => provider.state);
  provider.subscribe.mockImplementation((listener) => {
    listener(provider.state);
    return () => undefined;
  });
  return provider;
};

const makeClient = (session: MatrixRTCSession): MatrixClient =>
  ({
    getDeviceId: () => 'DEVICE',
    getSafeUserId: () => '@alice:example.org',
    matrixRTC: { getRoomSession: () => session },
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
  };
} => {
  const worker = { terminate: vi.fn<() => void>() } as unknown as Worker;
  provider.attach.mockImplementation(() => order.push('attach'));
  provider.detach.mockImplementation(() => order.push('detach'));
  const livekitRoom = {
    connect: vi
      .fn<(url: string, token: string, options?: unknown) => Promise<void>>()
      .mockImplementation(async () => {
        order.push('connect');
      }),
    disconnect: vi.fn<() => Promise<void>>().mockImplementation(async () => {
      order.push('disconnect');
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
  session: TestSession
): Promise<void> => {
  const connectPromise = controller.connect({ mx: makeClient(session), room });
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
    ]);
    expect(provider.attach).toHaveBeenCalledBefore(session.joinRTCSession as Mock);
    expect(provider.attach).toHaveBeenCalledWith(session, {
      userId: '@alice:example.org',
      deviceId: 'DEVICE',
    });
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
    expect(controller.getState().room).toBe(livekitRoom);
    expect(controller.getState().lifecycle).toBe('active');
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
    expect(provider.detach).toHaveBeenCalledOnce();
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

    expect(provider.detach).toHaveBeenCalledOnce();
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
    expect(provider.detach).toHaveBeenCalledOnce();
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
    expect(provider.detach).toHaveBeenCalledOnce();
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
    expect(provider.detach).toHaveBeenCalledOnce();
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
