import { atom } from 'jotai';
import { selectActiveCallSession, type LivekitJsCallSession } from './livekitJsCall';

export type NativeCallBackend = 'livekit-mobile';

export type NativeCallLifecycle =
  | 'starting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type NativeCallSession = {
  backend: NativeCallBackend;
  roomId: string;
  callId: string;
  lifecycle: NativeCallLifecycle;
  error?: string;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  switchCamera: () => Promise<void>;
  hangup: () => Promise<void>;
  /** Fetch available audio output routes from CallKit. Follow-up wiring. */
  getAudioRoutes?: () => Promise<unknown>;
  /** Switch the active audio route (e.g. speaker vs bluetooth). Follow-up wiring. */
  setAudioRoute?: (routeId: string) => Promise<void>;
  /** Send DTMF digits over the active call. Follow-up wiring. */
  sendDTMF?: (digits: string) => Promise<void>;
};

export const nativeCallAtom = atom<NativeCallSession | undefined>(undefined);

export const isNativeCallActive = (session: NativeCallSession | undefined): boolean =>
  session?.lifecycle !== undefined && session.lifecycle !== 'error';

export const selectActiveCallSessionIncludingNative = <Element>(
  elementCall: Element | undefined,
  livekitJsCall: LivekitJsCallSession | undefined,
  nativeCall: NativeCallSession | undefined
): Element | LivekitJsCallSession | NativeCallSession | undefined => {
  const selected = selectActiveCallSession(elementCall, livekitJsCall);
  if (selected) return selected;
  return isNativeCallActive(nativeCall) ? nativeCall : undefined;
};
