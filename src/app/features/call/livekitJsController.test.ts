import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const tauriRuntime = vi.hoisted(() => vi.fn<() => boolean>());
const pluginPlatform = vi.hoisted(() => ({
  getPlatformCapabilities: vi.fn<() => Promise<unknown>>(),
  getPlatformState: vi.fn<() => Promise<unknown>>(),
  onPlatformCallEvent: vi.fn<() => Promise<unknown>>(),
  startPlatformLifecycle: vi.fn<() => Promise<unknown>>(),
  stopPlatformLifecycle: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: tauriRuntime }));
vi.mock('$plugins/call/platformCallLifecycle', () => pluginPlatform);

import {
  MatrixRTCSessionEvent,
  type CallMembership,
  type MatrixRTCSession,
} from '$types/matrix-sdk';
import type { MatrixClient, Room as MatrixRoom } from '$types/matrix-sdk';
import type { Room as LivekitRoom, RoomOptions } from 'livekit-client';
import {
  createLivekitJsController,
  type LivekitJsControllerDependencies,
  type LivekitJsPlatformBridge,
  type LivekitJsPlatformStartRequest,
} from './livekitJsController';
import type { PlatformCallEvent } from '$plugins/call/platformCallLifecycle';
import type {
  LivekitMatrixKeyProvider,
  LivekitMatrixKeyProviderState,
} from './livekitMatrixKeyProvider';
import { resetCallOwnerForTests } from '$state/callOwner';

const transport = { type: 'livekit' as const, livekit_service_url: 'https://sfu.example' };
const room = { roomId: '!room:example.org' } as MatrixRoom;
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
  attach: Mock<(session: MatrixRTCSession) => void>;
  detach: Mock<() => void>;
  setLocalOutboundIdentity: Mock<(identity: string | undefined) => void>;
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
    attach: vi.fn<(session: MatrixRTCSession) => void>(),
    detach: vi.fn<() => void>(),
    setLocalOutboundIdentity: vi.fn<(identity: string | undefined) => void>(),
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
    localParticipant: {
      setMicrophoneEnabled: Mock<LivekitRoom['localParticipant']['setMicrophoneEnabled']>;
      setCameraEnabled: Mock<LivekitRoom['localParticipant']['setCameraEnabled']>;
      setScreenShareEnabled: Mock<LivekitRoom['localParticipant']['setScreenShareEnabled']>;
    };
  };
  mediaParticipant: {
    setMicrophoneEnabled: Mock<LivekitRoom['localParticipant']['setMicrophoneEnabled']>;
    setCameraEnabled: Mock<LivekitRoom['localParticipant']['setCameraEnabled']>;
    setScreenShareEnabled: Mock<LivekitRoom['localParticipant']['setScreenShareEnabled']>;
  };
} => {
  const worker = { terminate: vi.fn<() => void>() } as unknown as Worker;
  provider.attach.mockImplementation(() => order.push('attach'));
  provider.detach.mockImplementation(() => order.push('detach'));
  const mediaParticipant = {
    setMicrophoneEnabled: vi
      .fn<LivekitRoom['localParticipant']['setMicrophoneEnabled']>()
      .mockResolvedValue(undefined),
    setCameraEnabled: vi
      .fn<LivekitRoom['localParticipant']['setCameraEnabled']>()
      .mockResolvedValue(undefined),
    setScreenShareEnabled: vi
      .fn<LivekitRoom['localParticipant']['setScreenShareEnabled']>()
      .mockResolvedValue(undefined),
  };
  const livekitRoom = {
    localParticipant: mediaParticipant,
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
    mediaParticipant,
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

type FakePlatform = {
  bridge: LivekitJsPlatformBridge;
  getCapabilities: Mock<() => Promise<unknown>>;
  start: Mock<(request: LivekitJsPlatformStartRequest) => Promise<unknown>>;
  stop: Mock<(request: { sessionId: string }) => Promise<unknown>>;
  emit: (event: PlatformCallEvent) => void;
};

const makePlatform = (supported: boolean, order: string[]): FakePlatform => {
  let handler: ((event: PlatformCallEvent) => void) | undefined;
  const getCapabilities = vi.fn<() => Promise<unknown>>().mockImplementation(async () => {
    order.push('platform-caps');
    return { supported, microphone: supported, playback: supported };
  });
  const start = vi
    .fn<(request: LivekitJsPlatformStartRequest) => Promise<unknown>>()
    .mockImplementation(async (request) => {
      order.push(`platform-start:${request.microphone}:${request.playback}`);
      return { sessionId: request.sessionId };
    });
  const stop = vi
    .fn<(request: { sessionId: string }) => Promise<unknown>>()
    .mockImplementation(async () => {
      order.push('platform-stop');
      return {};
    });
  const bridge: LivekitJsPlatformBridge = {
    getCapabilities: getCapabilities as LivekitJsPlatformBridge['getCapabilities'],
    start: start as LivekitJsPlatformBridge['start'],
    stop: stop as LivekitJsPlatformBridge['stop'],
    onEvent: async (nextHandler) => {
      handler = nextHandler;
      return () => {
        order.push('platform-unlisten');
      };
    },
  };
  return { bridge, getCapabilities, start, stop, emit: (event) => handler?.(event) };
};

describe('livekit JS controller', () => {
  beforeEach(() => {
    resetCallOwnerForTests();
    tauriRuntime.mockReset();
    tauriRuntime.mockReturnValue(false);
    Object.values(pluginPlatform).forEach((mock) => mock.mockReset());
  });

  it('attaches E2EE before joining and provisions before connecting one no-media Room', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const { dependencies, provider, roomOptions, mediaParticipant, livekitRoom } = makeDependencies(
      session,
      order
    );
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
    expect(session.joinRTCSession).toHaveBeenCalledWith(
      { userId: '@alice:example.org', deviceId: 'DEVICE', memberId: '@alice:example.org:DEVICE' },
      [transport],
      undefined,
      { callIntent: 'audio', notificationType: 'notification', manageMediaKeys: true }
    );
    expect(roomOptions.value?.encryption).toEqual({
      keyProvider: provider,
      worker: expect.anything(),
    });
    expect(mediaParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(mediaParticipant.setCameraEnabled).not.toHaveBeenCalled();
    expect(mediaParticipant.setScreenShareEnabled).not.toHaveBeenCalled();
    expect(controller.getState().room).toBe(livekitRoom);
    expect(controller.getState().media).toBeUndefined();
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
    expect(controller.getState().media).toBeUndefined();
    expect(controller.getState().lifecycle).toBe('idle');
  });

  it('detaches once when setup fails after MatrixRTC join', async () => {
    const session = makeSession();
    const { dependencies, provider } = makeDependencies(session, []);
    dependencies.provisionToken = vi
      .fn<NonNullable<LivekitJsControllerDependencies['provisionToken']>>()
      .mockRejectedValue(new Error('provision failed'));
    const controller = createLivekitJsController(dependencies);
    const connectPromise = controller.connect({ mx: makeClient(session), room });

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
    expect(controller.getState().media).toBeUndefined();
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
    const connectPromise = controller.connect({ mx: makeClient(session), room });

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
    expect(controller.getState().media).toBeUndefined();
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
    const connectPromise = controller.connect({ mx: makeClient(session), room });

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

  it('does not expose media publication methods', () => {
    const session = makeSession();
    const { dependencies } = makeDependencies(session, []);
    const controller = createLivekitJsController(dependencies);

    expect(Object.keys(controller).toSorted()).toEqual([
      'connect',
      'disconnect',
      'getState',
      'subscribe',
    ]);
    expect('publishTrack' in controller).toBe(false);
    expect('setMicrophoneEnabled' in controller).toBe(false);
    expect('setCameraEnabled' in controller).toBe(false);
    expect('setScreenShareEnabled' in controller).toBe(false);
  });

  it('disconnects the old mode before replacing it with a manual-media controller', async () => {
    const firstSession = makeSession();
    const first = makeDependencies(firstSession, []);
    const firstController = createLivekitJsController(first.dependencies);
    await connectToActive(firstController, firstSession);

    const replacementSession = makeSession();
    const replacement = makeDependencies(replacementSession, [], makeProvider({ ready: true }));
    const replacementController = createLivekitJsController(replacement.dependencies, {
      manualMediaTest: true,
    });

    await firstController.disconnect();
    expect(firstController.getState().room).toBeUndefined();
    await connectToActive(replacementController, replacementSession);

    expect(replacementController.getState().media).toBeDefined();
  });

  it('publishes media only through the explicit manual-media-test controller', async () => {
    const session = makeSession();
    const provider = makeProvider({
      ready: true,
      localOutboundIdentity: 'local-backend-identity',
      keyIndex: 1,
    });
    const { dependencies, mediaParticipant, livekitRoom } = makeDependencies(session, [], provider);
    const controller = createLivekitJsController(dependencies, { manualMediaTest: true });

    await connectToActive(controller, session);
    await controller.setMicrophoneEnabled(true);
    await controller.setCameraEnabled(true);
    await controller.setScreenShareEnabled(true);

    expect(mediaParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(mediaParticipant.setCameraEnabled).toHaveBeenCalledWith(true);
    expect(mediaParticipant.setScreenShareEnabled).toHaveBeenCalledWith(true);
    expect(controller.getState().room).toBe(livekitRoom);
    expect(controller.getState().media?.setMicrophoneEnabled).toBeDefined();
  });

  it('refuses manual media when the local key is not ready or has failed', async () => {
    const session = makeSession();
    const provider = makeProvider();
    const { dependencies } = makeDependencies(session, [], provider);
    const controller = createLivekitJsController(dependencies, { manualMediaTest: true });

    await connectToActive(controller, session);
    await expect(controller.setMicrophoneEnabled(true)).rejects.toMatchObject({
      code: 'e2ee-key-not-ready',
    });

    provider.state.lastImportFailure = 'import-failed';
    await expect(controller.setCameraEnabled(true)).rejects.toMatchObject({
      code: 'e2ee-key-failed',
    });
  });

  it('refuses manual media when runtime E2EE support is unavailable', async () => {
    const session = makeSession();
    const { dependencies } = makeDependencies(session, []);
    dependencies.isE2EESupported = () => false;
    const controller = createLivekitJsController(dependencies, { manualMediaTest: true });

    await expect(controller.setScreenShareEnabled(true)).rejects.toMatchObject({
      code: 'e2ee-unsupported',
    });
    expect(controller.getState().mediaFailure).toBe('e2ee-unsupported');
  });

  it('treats unsupported desktop platform capabilities as a no-op', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const platform = makePlatform(false, order);
    const provider = makeProvider({
      ready: true,
      localOutboundIdentity: 'local-backend-identity',
      keyIndex: 1,
    });
    const { dependencies, mediaParticipant } = makeDependencies(session, order, provider);
    dependencies.platformBridge = platform.bridge;
    const controller = createLivekitJsController(dependencies, { manualMediaTest: true });

    await connectToActive(controller, session);
    await controller.setMicrophoneEnabled(true);

    expect(platform.getCapabilities).toHaveBeenCalledOnce();
    expect(platform.start).not.toHaveBeenCalled();
    expect(platform.stop).not.toHaveBeenCalled();
    expect(mediaParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(controller.getState().platform).toBeUndefined();
  });

  it('starts the platform lifecycle before enabling the local microphone', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const platform = makePlatform(true, order);
    const provider = makeProvider({
      ready: true,
      localOutboundIdentity: 'local-backend-identity',
      keyIndex: 1,
    });
    const { dependencies, mediaParticipant } = makeDependencies(session, order, provider);
    dependencies.platformBridge = platform.bridge;
    dependencies.createPlatformSessionId = () => 'opaque-session-1';
    mediaParticipant.setMicrophoneEnabled.mockImplementation(async () => {
      order.push('mic');
      return undefined;
    });
    const controller = createLivekitJsController(dependencies, { manualMediaTest: true });

    await connectToActive(controller, session);
    expect(platform.start).not.toHaveBeenCalled();
    await controller.setMicrophoneEnabled(true);

    expect(order.indexOf('platform-caps')).toBeGreaterThan(order.indexOf('connect'));
    expect(order.indexOf('platform-start:true:true')).toBeGreaterThan(order.indexOf('connect'));
    expect(order.indexOf('platform-start:true:true')).toBeLessThan(order.indexOf('mic'));
    expect(platform.start).toHaveBeenCalledWith({
      sessionId: 'opaque-session-1',
      microphone: true,
      playback: true,
    });
    expect(controller.getState().platform?.active).toBe(true);
  });

  it('stops the platform lifecycle after Room disconnect and before MatrixRTC leave', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const platform = makePlatform(true, order);
    const provider = makeProvider({
      ready: true,
      localOutboundIdentity: 'local-backend-identity',
      keyIndex: 1,
    });
    const { dependencies, mediaParticipant } = makeDependencies(session, order, provider);
    dependencies.platformBridge = platform.bridge;
    mediaParticipant.setMicrophoneEnabled.mockImplementation(async () => {
      order.push('mic');
      return undefined;
    });
    const controller = createLivekitJsController(dependencies, { manualMediaTest: true });
    await connectToActive(controller, session);
    await controller.setMicrophoneEnabled(true);

    await controller.disconnect();

    expect(order.lastIndexOf('mic')).toBeLessThan(order.indexOf('disconnect'));
    expect(order.indexOf('disconnect')).toBeLessThan(order.indexOf('platform-stop'));
    expect(order.indexOf('platform-stop')).toBeLessThan(order.indexOf('detach'));
    expect(order.indexOf('platform-stop')).toBeLessThan(order.indexOf('leave'));
    expect(platform.stop).toHaveBeenCalledOnce();
    expect(controller.getState().platform).toBeUndefined();
    expect(controller.getState().lifecycle).toBe('idle');
  });

  it('refuses the media operation and skips platform stop when platform start fails', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const platform = makePlatform(true, order);
    platform.start.mockRejectedValue(new Error('native start failed'));
    const provider = makeProvider({
      ready: true,
      localOutboundIdentity: 'local-backend-identity',
      keyIndex: 1,
    });
    const { dependencies, mediaParticipant } = makeDependencies(session, order, provider);
    dependencies.platformBridge = platform.bridge;
    const controller = createLivekitJsController(dependencies, { manualMediaTest: true });
    await connectToActive(controller, session);

    await expect(controller.setMicrophoneEnabled(true)).rejects.toMatchObject({
      code: 'platform-lifecycle-failed',
    });

    expect(mediaParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(controller.getState().mediaFailure).toBe('platform-lifecycle-failed');
    expect(controller.getState().platform?.active).toBe(false);

    await controller.disconnect();
    expect(platform.stop).not.toHaveBeenCalled();
    expect(provider.detach).toHaveBeenCalledOnce();
  });

  it('restarts platform lifecycle with the same session when flags change', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const platform = makePlatform(true, order);
    const provider = makeProvider({
      ready: true,
      localOutboundIdentity: 'local-backend-identity',
      keyIndex: 1,
    });
    const { dependencies } = makeDependencies(session, order, provider);
    dependencies.platformBridge = platform.bridge;
    dependencies.createPlatformSessionId = () => 'opaque-session-1';
    const controller = createLivekitJsController(dependencies, { manualMediaTest: true });
    await connectToActive(controller, session);

    await controller.setCameraEnabled(true);
    expect(platform.start).toHaveBeenLastCalledWith({
      sessionId: 'opaque-session-1',
      microphone: false,
      playback: true,
    });
    expect(platform.stop).not.toHaveBeenCalled();

    await controller.setMicrophoneEnabled(true);
    expect(platform.stop).toHaveBeenCalledWith({ sessionId: 'opaque-session-1' });
    expect(platform.start).toHaveBeenLastCalledWith({
      sessionId: 'opaque-session-1',
      microphone: true,
      playback: true,
    });
    expect(platform.start).toHaveBeenCalledTimes(2);

    const stopsBefore = platform.stop.mock.calls.length;
    await controller.setMicrophoneEnabled(true);
    expect(platform.stop.mock.calls.length).toBe(stopsBefore);
    expect(platform.start).toHaveBeenCalledTimes(2);
  });

  it('filters stale session and revision platform events', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const platform = makePlatform(true, order);
    const provider = makeProvider({
      ready: true,
      localOutboundIdentity: 'local-backend-identity',
      keyIndex: 1,
    });
    const { dependencies } = makeDependencies(session, order, provider);
    dependencies.platformBridge = platform.bridge;
    dependencies.createPlatformSessionId = () => 'opaque-session-1';
    const controller = createLivekitJsController(dependencies, { manualMediaTest: true });
    await connectToActive(controller, session);
    await controller.setCameraEnabled(true);

    platform.emit({ revision: 2, sessionId: 'other-session', type: 'media_reset' });
    platform.emit({ revision: 3, sessionId: 'opaque-session-1', type: 'media_reset' });
    platform.emit({
      revision: 3,
      sessionId: 'opaque-session-1',
      type: 'focus_changed',
      focused: false,
    });
    platform.emit({
      revision: 4,
      sessionId: 'opaque-session-1',
      type: 'focus_changed',
      focused: false,
    });
    await vi.waitFor(() => expect(controller.getState().platform?.focused).toBe(false));

    const snapshot = controller.getState().platform;
    expect(snapshot?.mediaReset).toBe(true);
    expect(snapshot?.focused).toBe(false);
    expect(snapshot?.active).toBe(true);
    expect(controller.getState().mediaFailure).toBeNull();
  });

  it('refuses manual media when the platform capability lookup fails', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const platform = makePlatform(false, order);
    platform.getCapabilities.mockReset();
    platform.getCapabilities.mockRejectedValue(new Error('capability bridge unavailable'));
    const provider = makeProvider({
      ready: true,
      localOutboundIdentity: 'local-backend-identity',
      keyIndex: 1,
    });
    const { dependencies, mediaParticipant } = makeDependencies(session, order, provider);
    dependencies.platformBridge = platform.bridge;
    const controller = createLivekitJsController(dependencies, { manualMediaTest: true });
    await connectToActive(controller, session);

    await expect(controller.setMicrophoneEnabled(true)).rejects.toMatchObject({
      code: 'platform-lifecycle-failed',
    });

    expect(mediaParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(platform.start).not.toHaveBeenCalled();
    expect(controller.getState().mediaFailure).toBe('platform-lifecycle-failed');
    expect(controller.getState().platform).toBeUndefined();
  });

  it.each([
    ['malformed supported', { supported: 'yes', microphone: true, playback: true }],
    ['missing microphone', { supported: true, playback: true }],
    ['malformed microphone', { supported: true, microphone: 1, playback: true }],
    ['missing playback', { supported: true, microphone: true }],
    ['malformed playback', { supported: true, microphone: true, playback: null }],
    ['missing everything', {}],
    ['a null result', null],
    ['an undefined result', undefined],
  ])(
    'refuses manual media without calling media methods on %s capability result',
    async (_label, capabilities) => {
      const order: string[] = [];
      const session = makeSession(order);
      const platform = makePlatform(false, order);
      platform.getCapabilities.mockReset();
      platform.getCapabilities.mockResolvedValue(capabilities);
      const provider = makeProvider({
        ready: true,
        localOutboundIdentity: 'local-backend-identity',
        keyIndex: 1,
      });
      const { dependencies, mediaParticipant } = makeDependencies(session, order, provider);
      dependencies.platformBridge = platform.bridge;
      const controller = createLivekitJsController(dependencies, { manualMediaTest: true });
      await connectToActive(controller, session);

      await expect(controller.setMicrophoneEnabled(true)).rejects.toMatchObject({
        code: 'platform-lifecycle-failed',
      });
      await expect(controller.setCameraEnabled(true)).rejects.toMatchObject({
        code: 'platform-lifecycle-failed',
      });

      expect(mediaParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
      expect(mediaParticipant.setCameraEnabled).not.toHaveBeenCalled();
      expect(mediaParticipant.setScreenShareEnabled).not.toHaveBeenCalled();
      expect(platform.start).not.toHaveBeenCalled();
      expect(controller.getState().mediaFailure).toBe('platform-lifecycle-failed');
      expect(controller.getState().platform).toBeUndefined();
    }
  );

  it('disables the LiveKit microphone track before downgrading the platform lifecycle', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const platform = makePlatform(true, order);
    const provider = makeProvider({
      ready: true,
      localOutboundIdentity: 'local-backend-identity',
      keyIndex: 1,
    });
    const { dependencies, mediaParticipant } = makeDependencies(session, order, provider);
    dependencies.platformBridge = platform.bridge;
    dependencies.createPlatformSessionId = () => 'opaque-session-1';
    mediaParticipant.setMicrophoneEnabled.mockImplementation(async (enabled) => {
      order.push(enabled ? 'mic-on' : 'mic-off');
      return undefined;
    });
    const controller = createLivekitJsController(dependencies, { manualMediaTest: true });
    await connectToActive(controller, session);
    await controller.setMicrophoneEnabled(true);
    expect(platform.start).toHaveBeenLastCalledWith({
      sessionId: 'opaque-session-1',
      microphone: true,
      playback: true,
    });

    await controller.setMicrophoneEnabled(false);

    expect(order.indexOf('mic-on')).toBeLessThan(order.indexOf('mic-off'));
    expect(order.indexOf('mic-off')).toBeLessThan(order.indexOf('platform-stop'));
    expect(order.indexOf('platform-stop')).toBeLessThan(order.indexOf('platform-start:false:true'));
    expect(platform.start).toHaveBeenLastCalledWith({
      sessionId: 'opaque-session-1',
      microphone: false,
      playback: true,
    });
    expect(controller.getState().platform?.active).toBe(true);
    expect(controller.getState().mediaFailure).toBeNull();
  });

  it('retains the microphone lifecycle when the JS microphone disable fails', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const platform = makePlatform(true, order);
    const provider = makeProvider({
      ready: true,
      localOutboundIdentity: 'local-backend-identity',
      keyIndex: 1,
    });
    const { dependencies, mediaParticipant } = makeDependencies(session, order, provider);
    dependencies.platformBridge = platform.bridge;
    dependencies.createPlatformSessionId = () => 'opaque-session-1';
    mediaParticipant.setMicrophoneEnabled.mockImplementation(async (enabled) => {
      order.push(enabled ? 'mic-on' : 'mic-off');
      return undefined;
    });
    const controller = createLivekitJsController(dependencies, { manualMediaTest: true });
    await connectToActive(controller, session);
    await controller.setMicrophoneEnabled(true);

    mediaParticipant.setMicrophoneEnabled.mockRejectedValueOnce(new Error('track stuck'));
    await expect(controller.setMicrophoneEnabled(false)).rejects.toMatchObject({
      code: 'media-operation-failed',
    });

    expect(platform.stop).not.toHaveBeenCalled();
    expect(platform.start).toHaveBeenCalledTimes(1);
    expect(controller.getState().mediaFailure).toBe('media-operation-failed');
    expect(controller.getState().platform?.active).toBe(true);

    // A later media operation must not downgrade the microphone lifecycle.
    await controller.setCameraEnabled(true);
    expect(platform.stop).not.toHaveBeenCalled();
    expect(platform.start).toHaveBeenCalledTimes(1);

    // Teardown still stops the retained microphone lifecycle.
    await controller.disconnect();
    expect(platform.stop).toHaveBeenCalledWith({ sessionId: 'opaque-session-1' });
    expect(order.lastIndexOf('platform-stop')).toBeLessThan(order.indexOf('leave'));
    expect(controller.getState().lifecycle).toBe('idle');
  });

  it('uses an explicit unsupported browser bridge without calling Tauri invoke', async () => {
    // tauriRuntime is false: no platform bridge dependency is injected.
    const order: string[] = [];
    const session = makeSession(order);
    const provider = makeProvider({
      ready: true,
      localOutboundIdentity: 'local-backend-identity',
      keyIndex: 1,
    });
    const { dependencies, mediaParticipant } = makeDependencies(session, order, provider);
    const controller = createLivekitJsController(dependencies, { manualMediaTest: true });

    await connectToActive(controller, session);
    await controller.setMicrophoneEnabled(true);
    await controller.setCameraEnabled(true);

    expect(mediaParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(mediaParticipant.setCameraEnabled).toHaveBeenCalledWith(true);
    expect(controller.getState().mediaFailure).toBeNull();
    expect(pluginPlatform.getPlatformCapabilities).not.toHaveBeenCalled();
    expect(pluginPlatform.startPlatformLifecycle).not.toHaveBeenCalled();
    expect(pluginPlatform.stopPlatformLifecycle).not.toHaveBeenCalled();
    expect(pluginPlatform.onPlatformCallEvent).not.toHaveBeenCalled();
  });

  it('keeps the Tauri default bridge: desktop capability response stays a no-op', async () => {
    tauriRuntime.mockReturnValue(true);
    pluginPlatform.getPlatformCapabilities.mockResolvedValue({
      supported: false,
      microphone: false,
      playback: false,
    });
    const order: string[] = [];
    const session = makeSession(order);
    const provider = makeProvider({
      ready: true,
      localOutboundIdentity: 'local-backend-identity',
      keyIndex: 1,
    });
    const { dependencies, mediaParticipant } = makeDependencies(session, order, provider);
    const controller = createLivekitJsController(dependencies, { manualMediaTest: true });

    await connectToActive(controller, session);
    await controller.setMicrophoneEnabled(true);

    expect(pluginPlatform.getPlatformCapabilities).toHaveBeenCalledOnce();
    expect(pluginPlatform.startPlatformLifecycle).not.toHaveBeenCalled();
    expect(mediaParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
  });

  it('still fails closed on Tauri when the capability lookup rejects', async () => {
    tauriRuntime.mockReturnValue(true);
    pluginPlatform.getPlatformCapabilities.mockRejectedValue(new Error('invoke failed'));
    const order: string[] = [];
    const session = makeSession(order);
    const provider = makeProvider({
      ready: true,
      localOutboundIdentity: 'local-backend-identity',
      keyIndex: 1,
    });
    const { dependencies, mediaParticipant } = makeDependencies(session, order, provider);
    const controller = createLivekitJsController(dependencies, { manualMediaTest: true });

    await connectToActive(controller, session);
    await expect(controller.setMicrophoneEnabled(true)).rejects.toMatchObject({
      code: 'platform-lifecycle-failed',
    });

    expect(mediaParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(pluginPlatform.startPlatformLifecycle).not.toHaveBeenCalled();
    expect(controller.getState().mediaFailure).toBe('platform-lifecycle-failed');
  });

  it('stops manual media safely on a platform failure event', async () => {
    const order: string[] = [];
    const session = makeSession(order);
    const platform = makePlatform(true, order);
    const provider = makeProvider({
      ready: true,
      localOutboundIdentity: 'local-backend-identity',
      keyIndex: 1,
    });
    const { dependencies, mediaParticipant } = makeDependencies(session, order, provider);
    dependencies.platformBridge = platform.bridge;
    dependencies.createPlatformSessionId = () => 'opaque-session-1';
    const controller = createLivekitJsController(dependencies, { manualMediaTest: true });
    await connectToActive(controller, session);
    await controller.setMicrophoneEnabled(true);

    platform.emit({
      revision: 1,
      sessionId: 'opaque-session-1',
      type: 'failed',
      code: 'audio_unavailable',
    });
    await vi.waitFor(() =>
      expect(controller.getState().mediaFailure).toBe('platform-lifecycle-failed')
    );

    expect(controller.getState().platform).toMatchObject({
      active: false,
      failure: 'audio_unavailable',
    });
    expect(mediaParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    expect(controller.getState().lifecycle).toBe('active');
  });
});
