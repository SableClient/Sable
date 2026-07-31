import { addPluginListener, invoke, type PluginListener } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type NativeCallConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

export type NativeCallFailureCode =
  | 'invalid_request'
  | 'busy'
  | 'permission_denied'
  | 'connect_failed'
  | 'media_failed'
  | 'disconnected'
  | 'cancelled'
  | 'unavailable'
  | 'unexpected';

export type NativeCallCapabilities = {
  supported: boolean;
  microphone: boolean;
  backgroundAudio: boolean;
  nativeRoom: boolean;
  camera: boolean;
  nativeVideoOverlay: boolean;
  callKit: boolean;
};

export type NativeCallEncryptionKeyPayload = {
  identity: string;
  keyIndex: number;
  key: string;
};

export type NativeCallRemoteCamera = {
  sid: string;
  muted: boolean;
  subscribed: boolean;
};

export type NativeCallRemoteParticipant = {
  identity: string;
  camera?: NativeCallRemoteCamera;
  connectionQuality?: string;
};

export type NativeCallSnapshot = {
  revision: number;
  callId: string | null;
  connectionState: NativeCallConnectionState;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  participantCount: number;
  // Present on current native builds; optional so older payloads and test
  // fixtures without the field remain valid.
  remoteParticipants?: NativeCallRemoteParticipant[];
  lastError?: { code: NativeCallFailureCode; message: string };
};

export type ConnectNativeCallRequest = {
  callId: string;
  url: string;
  token: string;
  microphoneEnabled: boolean;
  encryptionKeys?: NativeCallEncryptionKeyPayload[];
};

export type SetNativeCallEncryptionKeyRequest = {
  callId: string;
  identity: string;
  keyIndex: number;
  key: string;
};

/**
 * Pins the single native-rendered remote camera view over a DOM tile. `x`,
 * `y`, `width`, `height` are the tile's viewport-relative CSS rect; the
 * native side maps them into view coordinates. A repeated call with the same
 * track repositions the view; a new track rebinds it.
 */
export type SetNativeCallRemoteVideoOverlayRequest = {
  callId: string;
  participantIdentity: string;
  trackId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
};

export type ClearNativeCallRemoteVideoOverlayRequest = {
  callId: string;
};

export type SetNativeCallLocalVideoOverlayRequest = {
  callId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
};

export type ClearNativeCallLocalVideoOverlayRequest = {
  callId: string;
};

export type ReportSystemIncomingCallRequest = {
  uuid: string;
  callerName: string;
};

export type StartSystemCallRequest = {
  callId: string;
  uuid: string;
  callerName: string;
};

export type AnswerSystemCallRequest = {
  callId: string;
  uuid: string;
};

export type EndSystemCallRequest = {
  callId: string;
  remoteEnded?: boolean;
};

export type SetSystemCallMutedRequest = {
  callId: string;
  muted: boolean;
};

export type GetAudioRoutesRequest = {
  callId: string;
};

export type SetAudioRouteRequest = {
  callId: string;
  routeId: string;
};

export type SendDTMFRequest = {
  callId: string;
  digits: string;
};

export type UpdateCallDisplayRequest = {
  callId: string;
  callerName: string;
  hasVideo?: boolean;
};

export type ReportAnsweredElsewhereRequest = {
  callId: string;
};

export type ReportDeclinedElsewhereRequest = {
  callId: string;
};

export type ReportUnansweredRequest = {
  callId: string;
};

export type DeclineSystemCallRequest = {
  callId: string;
  reason: string;
};

export type GetAudioRoutesResponse = {
  routes: unknown;
  receiver: NativeCallSnapshot;
};

export type SystemCallActionKind = 'answer' | 'end' | 'mute';

export type SystemCallAction = {
  action: SystemCallActionKind;
  uuid: string;
  muted?: boolean;
};

const NATIVE_CALL_EVENT = 'plugin:livekit-mobile://native-call-event';

export const getNativeCallCapabilities = (): Promise<NativeCallCapabilities> =>
  invoke<NativeCallCapabilities>('plugin:livekit-mobile|getNativeCallCapabilities');

export const connectNativeCall = (request: ConnectNativeCallRequest): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|connectNativeCall', { payload: request });

export const disconnectNativeCall = (request: { callId: string }): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|disconnectNativeCall', { payload: request });

export const setNativeCallMicrophoneEnabled = (request: {
  callId: string;
  enabled: boolean;
}): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|setNativeCallMicrophoneEnabled', {
    payload: request,
  });

export const setNativeCallCameraEnabled = (request: {
  callId: string;
  enabled: boolean;
}): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|setNativeCallCameraEnabled', {
    payload: request,
  });

export const setNativeCallPiPEnabled = (request: {
  callId: string;
  enabled: boolean;
}): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|setNativeCallPiPEnabled', {
    payload: request,
  });

export const switchNativeCallCamera = (request: { callId: string }): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|switchNativeCallCamera', {
    payload: request,
  });

export const setNativeCallEncryptionKey = (
  request: SetNativeCallEncryptionKeyRequest
): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|setNativeCallEncryptionKey', {
    payload: request,
  });

export const setNativeCallRemoteVideoOverlay = (
  request: SetNativeCallRemoteVideoOverlayRequest
): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|setNativeCallRemoteVideoOverlay', {
    payload: request,
  });

export const clearNativeCallRemoteVideoOverlay = (
  request: ClearNativeCallRemoteVideoOverlayRequest
): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|clearNativeCallRemoteVideoOverlay', {
    payload: request,
  });

export const setNativeCallLocalVideoOverlay = (
  request: SetNativeCallLocalVideoOverlayRequest
): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|setNativeCallLocalVideoOverlay', {
    payload: request,
  });

export const clearNativeCallLocalVideoOverlay = (
  request: ClearNativeCallLocalVideoOverlayRequest
): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|clearNativeCallLocalVideoOverlay', {
    payload: request,
  });

export const getNativeCallState = (): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|getNativeCallState');

export const listenNativeCallSnapshot = (
  handler: (snapshot: NativeCallSnapshot) => void
): Promise<UnlistenFn> =>
  listen<NativeCallSnapshot>(NATIVE_CALL_EVENT, ({ payload }) => handler(payload));

export const reportSystemIncomingCall = (
  request: ReportSystemIncomingCallRequest
): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|reportSystemIncomingCall', { payload: request });

export const startSystemCall = (request: StartSystemCallRequest): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|startSystemCall', { payload: request });

export const answerSystemCall = (request: AnswerSystemCallRequest): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|answerSystemCall', { payload: request });

export const endSystemCall = (request: EndSystemCallRequest): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|endSystemCall', { payload: request });

export const setSystemCallMuted = (request: SetSystemCallMutedRequest): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|setSystemCallMuted', { payload: request });

export const drainPendingSystemCallActions = (): Promise<SystemCallAction[]> =>
  invoke<SystemCallAction[]>('plugin:livekit-mobile|drainPendingSystemCallActions');

export const fulfillAnswerCall = (uuid: string): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|fulfillAnswerCall', { payload: { uuid } });

export const fulfillEndCall = (uuid: string): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|fulfillEndCall', { payload: { uuid } });

export const reportSystemCallConnected = (uuid: string): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|reportSystemCallConnected', { payload: { uuid } });

export const getAudioRoutes = (
  request: GetAudioRoutesRequest
): Promise<GetAudioRoutesResponse> =>
  invoke<GetAudioRoutesResponse>('plugin:livekit-mobile|getAudioRoutes', { payload: request });

export const setAudioRoute = (request: SetAudioRouteRequest): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|setAudioRoute', { payload: request });

export const sendDTMF = (request: SendDTMFRequest): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|sendDTMF', { payload: request });

export const updateCallDisplay = (
  request: UpdateCallDisplayRequest
): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|updateCallDisplay', { payload: request });

export const reportSystemCallAnsweredElsewhere = (
  request: ReportAnsweredElsewhereRequest
): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|reportSystemCallAnsweredElsewhere', { payload: request });

export const reportSystemCallDeclinedElsewhere = (
  request: ReportDeclinedElsewhereRequest
): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|reportSystemCallDeclinedElsewhere', { payload: request });

export const reportSystemCallUnanswered = (
  request: ReportUnansweredRequest
): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|reportSystemCallUnanswered', { payload: request });

export const declineSystemCall = (request: DeclineSystemCallRequest): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|declineSystemCall', { payload: request });

export const onSystemCallAction = (
  handler: (action: SystemCallAction) => void
): Promise<PluginListener> =>
  addPluginListener('livekit-mobile', 'callkit_event', handler);
