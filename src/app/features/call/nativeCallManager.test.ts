import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'jotai';
import type { MatrixClient, Room } from '$types/matrix-sdk';
import { createNativeCallManager, getNativeCallManager } from './nativeCallManager';
import type {
  NativeCallController,
  NativeCallControllerDependencies,
  NativeCallStartOptions,
} from './nativeCallController';
import { nativeCallAtom, type NativeCallSession } from '$state/nativeCall';
import { callEmbedAtom } from '$state/callEmbed';
import type { CallEmbed } from '$plugins/call';
import { resetCallOwnerForTests } from '$state/callOwner';

const room = { roomId: '!room:example.org' } as Room;

const makeClient = (memberships: unknown[] = []) =>
  ({
    matrixRTC: {
      getRoomSession: () => ({ memberships }),
    },
  }) as unknown as MatrixClient;

const makeNativeSession = (lifecycle: NativeCallSession['lifecycle']): NativeCallSession => ({
  backend: 'livekit-mobile',
  roomId: room.roomId,
  callId: 'call-id',
  lifecycle,
  participants: [],
  microphoneEnabled: true,
  cameraEnabled: false,
  screenShareEnabled: false,
  setMicrophoneEnabled: async () => {},
  setCameraEnabled: async () => {},
  switchCamera: async () => {},
  listAudioRoutes: async () => [],
  selectAudioRoute: async () => {},
  hangup: async () => undefined,
});

type FakeController = {
  controller: NativeCallController;
  start: ReturnType<typeof vi.fn<(options: NativeCallStartOptions) => Promise<void>>>;
  setSession?: (session: NativeCallSession | undefined) => void;
};

const makeFakeControllerFactory = () => {
  const fake: FakeController = {
    controller: undefined as unknown as NativeCallController,
    start: vi.fn<(options: NativeCallStartOptions) => Promise<void>>(async () => undefined),
  };
  fake.controller = { start: fake.start } as unknown as NativeCallController;
  const createController = (
    dependencies: Pick<NativeCallControllerDependencies, 'setSession'>
  ): NativeCallController => {
    fake.setSession = dependencies.setSession;
    return fake.controller;
  };
  return { fake, createController };
};

beforeEach(() => {
  resetCallOwnerForTests();
});

describe('createNativeCallManager', () => {
  it('starts the controller with the computed call options', () => {
    const store = createStore();
    const { fake, createController } = makeFakeControllerFactory();
    const manager = createNativeCallManager(store, createController);

    manager.start({
      mx: makeClient([{ userId: '@other:example.org' }]),
      room,
      dm: true,
      video: true,
      microphone: false,
    });

    expect(fake.start).toHaveBeenCalledWith({
      mx: expect.anything(),
      room,
      dm: true,
      video: true,
      microphone: false,
      ongoing: true,
    });
  });

  it('defaults audio/direct-message flags', () => {
    const store = createStore();
    const { fake, createController } = makeFakeControllerFactory();
    const manager = createNativeCallManager(store, createController);

    manager.start({ mx: makeClient(), room });

    expect(fake.start).toHaveBeenCalledWith(
      expect.objectContaining({ dm: false, video: false, microphone: true, ongoing: false })
    );
  });

  it('publishes controller sessions into the native call atom', () => {
    const store = createStore();
    const { fake, createController } = makeFakeControllerFactory();
    createNativeCallManager(store, createController);

    const session = makeNativeSession('connected');
    fake.setSession?.(session);
    expect(store.get(nativeCallAtom)).toBe(session);

    fake.setSession?.(undefined);
    expect(store.get(nativeCallAtom)).toBeUndefined();
  });

  it('does not start while a native call session is active', () => {
    const store = createStore();
    const { fake, createController } = makeFakeControllerFactory();
    const manager = createNativeCallManager(store, createController);

    store.set(nativeCallAtom, makeNativeSession('connected'));
    manager.start({ mx: makeClient(), room });

    expect(fake.start).not.toHaveBeenCalled();
  });

  it('does not start while a failed native session is cleared but Element Call is active', () => {
    const store = createStore();
    const { fake, createController } = makeFakeControllerFactory();
    const manager = createNativeCallManager(store, createController);

    store.set(callEmbedAtom, {
      roomId: '!other:example.org',
      dispose: vi.fn<() => void>(),
    } as unknown as CallEmbed);
    manager.start({ mx: makeClient(), room });

    expect(fake.start).not.toHaveBeenCalled();
  });
});

describe('getNativeCallManager', () => {
  it('reuses one manager per store', () => {
    const store = createStore();
    expect(getNativeCallManager(store)).toBe(getNativeCallManager(store));
  });
});
