import { atom } from 'jotai';
import type { NativeCallAudioRoute } from '$features/call/livekitMobileBridge';
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
  listAudioRoutes: () => Promise<NativeCallAudioRoute[]>;
  selectAudioRoute: (routeId: string) => Promise<void>;
  hangup: () => Promise<void>;
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
