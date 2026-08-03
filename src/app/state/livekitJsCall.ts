import { atom } from 'jotai';
import type {
  LivekitJsControllerFailure,
  LivekitJsControllerLifecycle,
} from '@sableclient/matrixrtc';
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
  /** What the user chose on the prescreen; applied once media is ready. */
  initialMedia: LivekitJsCallMedia;
  lifecycle: LivekitJsControllerLifecycle;
  failure: LivekitJsControllerFailure | null;
  room?: LivekitRoom;
  /** Immediate for an unencrypted room, after the Matrix key for an encrypted one. */
  mediaReady: boolean;
  hangup: () => Promise<void>;
};

export const livekitJsCallAtom = atom<LivekitJsCallSession | undefined>(undefined);

export const livekitJsCallSoundAtom = atom(true);

/**
 * Whether `initialMedia` has been published for the current call. The surface
 * unmounts when the user navigates out of the room while the call keeps
 * running, so this has to outlive it or coming back re-applies the prescreen
 * choice and undoes anything toggled from the call bar.
 */
export const livekitJsCallInitialMediaAppliedAtom = atom(false);

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
