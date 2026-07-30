import { atom } from 'jotai';
import type {
  LivekitJsControllerFailure,
  LivekitJsControllerLifecycle,
} from '$features/call/livekitJsController';
import type { Room as LivekitRoom } from 'livekit-client';

export type LivekitJsCallMedia = {
  microphone: boolean;
  camera: boolean;
  sound: boolean;
  audioDeviceId?: string;
  videoDeviceId?: string;
};

export type LivekitJsCallSession = {
  roomId: string;
  /** What the user chose on the prescreen; applied once E2EE is ready. */
  initialMedia: LivekitJsCallMedia;
  lifecycle: LivekitJsControllerLifecycle;
  failure: LivekitJsControllerFailure | null;
  room?: LivekitRoom;
  e2eeReady: boolean;
  hangup: () => Promise<void>;
};

export const livekitJsCallAtom = atom<LivekitJsCallSession | undefined>(undefined);

export const isLivekitJsCallActive = (session: LivekitJsCallSession | undefined): boolean =>
  session?.lifecycle !== undefined &&
  session.lifecycle !== 'idle' &&
  session.lifecycle !== 'failed';

export const selectActiveCallSession = <Element>(
  elementCall: Element | undefined,
  livekitJsCall: LivekitJsCallSession | undefined
): Element | LivekitJsCallSession | undefined => {
  if (elementCall) return elementCall;
  if (isLivekitJsCallActive(livekitJsCall)) return livekitJsCall;
  return undefined;
};
