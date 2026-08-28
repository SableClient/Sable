import type { useStore } from 'jotai';

type Store = ReturnType<typeof useStore>;
import type { MatrixClient, Room } from '$types/matrix-sdk';
import type { AutoDiscoveryInfo } from '../../cs-api';
import { callInProgressAtom, nativeCallAtom } from '$state/nativeCall';
import { isCallOngoing } from '@sableclient/matrixrtc';
import type { NativeCallCapabilities } from '@sableclient/tauri-plugin-livekit-mobile';
import {
  createNativeCallController,
  type NativeCallController,
  type NativeCallControllerDependencies,
} from './nativeCallController';

export type NativeCallManagerStartOptions = {
  mx: MatrixClient;
  room: Room;
  discovery?: Pick<AutoDiscoveryInfo, 'org.matrix.msc4143.rtc_foci'>;
  dm?: boolean;
  video?: boolean;
  microphone?: boolean;
  capabilities?: NativeCallCapabilities;
};

export type NativeCallManager = {
  start: (options: NativeCallManagerStartOptions) => void;
};

export const createNativeCallManager = (
  store: Pick<Store, 'get' | 'set'>,
  createController: (
    dependencies: Pick<NativeCallControllerDependencies, 'setSession'>
  ) => NativeCallController = createNativeCallController
): NativeCallManager => {
  const controller = createController({
    setSession: (session) => store.set(nativeCallAtom, session),
  });

  return {
    start: ({ mx, room, discovery, dm, video, microphone, capabilities }) => {
      if (store.get(callInProgressAtom)) return;
      void controller
        .start({
          mx,
          room,
          discovery,
          dm: dm ?? false,
          video: video ?? false,
          microphone: microphone ?? true,
          capabilities,
          ongoing: isCallOngoing(mx, room),
        })
        .catch(() => undefined);
    },
  };
};

const managers = new WeakMap<Pick<Store, 'get' | 'set'>, NativeCallManager>();

export const getNativeCallManager = (store: Pick<Store, 'get' | 'set'>): NativeCallManager => {
  const cached = managers.get(store);
  if (cached) return cached;
  const manager = createNativeCallManager(store);
  managers.set(store, manager);
  return manager;
};
