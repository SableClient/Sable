import { atom } from 'jotai';
import type { NativeCallAudioRoute } from '@sableclient/tauri-plugin-livekit-mobile';
import type { CallParticipant } from '@sableclient/matrixrtc';
import {
  isLivekitJsCallActive,
  livekitJsCallAtom,
  selectActiveCallSession,
  type LivekitJsCallSession,
} from './livekitJsCall';
import { callEmbedAtom } from './callEmbed';

export type NativeCallBackend = 'livekit-mobile';

export type NativeCallLifecycle =
  | 'starting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type NativeCallCapabilities = {
  camera: boolean;
  screenShare: boolean;
  pictureInPicture: boolean;
  audioRoutes: boolean;
};

export type NativeCallSession = {
  backend: NativeCallBackend;
  roomId: string;
  callId: string;
  lifecycle: NativeCallLifecycle;
  error?: string;
  /** Remote peers only, as the transport reports them. */
  participants: CallParticipant[];
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  capabilities?: NativeCallCapabilities;
  /** Absent where the platform cannot publish a screen share. */
  setScreenShareEnabled?: (enabled: boolean) => Promise<void>;
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

/**
 * Whether any engine already owns a call. Only one may run at a time: a second
 * start would lose the call-owner lease and publish a failure of its own while
 * the first call carries on.
 */
export const callInProgressAtom = atom(
  (get) =>
    get(callEmbedAtom) !== undefined ||
    isLivekitJsCallActive(get(livekitJsCallAtom)) ||
    isNativeCallActive(get(nativeCallAtom))
);

export const selectActiveCallSessionIncludingNative = <Element>(
  elementCall: Element | undefined,
  livekitJsCall: LivekitJsCallSession | undefined,
  nativeCall: NativeCallSession | undefined
): Element | LivekitJsCallSession | NativeCallSession | undefined => {
  const selected = selectActiveCallSession(elementCall, livekitJsCall);
  if (selected) return selected;
  return isNativeCallActive(nativeCall) ? nativeCall : undefined;
};
