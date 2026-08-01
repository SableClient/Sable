import { addPluginListener, invoke, type PluginListener } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { CallAudioRoute } from './callTransport';

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
  screenShare?: NativeCallRemoteCamera;
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

export type StartSystemCallRequest = {
  callId: string;
  uuid: string;
  callerName: string;
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

export type UpdateCallDisplayRequest = {
  callId: string;
  callerName: string;
  hasVideo?: boolean;
};

export type NativeCallAudioRoute = CallAudioRoute;

export type GetAudioRoutesResponse = {
  routes: NativeCallAudioRoute[];
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
  invoke<NativeCallCapabilities>('plugin:livekit-mobile|get_native_call_capabilities');

export const connectNativeCall = (request: ConnectNativeCallRequest): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|connect_native_call', { payload: request });

export const disconnectNativeCall = (request: { callId: string }): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|disconnect_native_call', { payload: request });

export const setNativeCallMicrophoneEnabled = (request: {
  callId: string;
  enabled: boolean;
}): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|set_native_call_microphone_enabled', {
    payload: request,
  });

export const setNativeCallCameraEnabled = (request: {
  callId: string;
  enabled: boolean;
}): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|set_native_call_camera_enabled', {
    payload: request,
  });

export const setNativeCallPiPEnabled = (request: {
  callId: string;
  enabled: boolean;
}): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|set_native_call_pip_enabled', {
    payload: request,
  });

export const switchNativeCallCamera = (request: { callId: string }): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|switch_native_call_camera', {
    payload: request,
  });

export const setNativeCallEncryptionKey = (
  request: SetNativeCallEncryptionKeyRequest
): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|set_native_call_encryption_key', {
    payload: request,
  });

export const setNativeCallRemoteVideoOverlay = (
  request: SetNativeCallRemoteVideoOverlayRequest
): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|set_native_call_remote_video_overlay', {
    payload: request,
  });

export const clearNativeCallRemoteVideoOverlay = (
  request: ClearNativeCallRemoteVideoOverlayRequest
): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|clear_native_call_remote_video_overlay', {
    payload: request,
  });

export const setNativeCallLocalVideoOverlay = (
  request: SetNativeCallLocalVideoOverlayRequest
): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|set_native_call_local_video_overlay', {
    payload: request,
  });

export const clearNativeCallLocalVideoOverlay = (
  request: ClearNativeCallLocalVideoOverlayRequest
): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|clear_native_call_local_video_overlay', {
    payload: request,
  });

export const getNativeCallState = (): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|get_native_call_state');

export const listenNativeCallSnapshot = (
  handler: (snapshot: NativeCallSnapshot) => void
): Promise<UnlistenFn> =>
  listen<NativeCallSnapshot>(NATIVE_CALL_EVENT, ({ payload }) => handler(payload));

export const startSystemCall = (request: StartSystemCallRequest): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|start_system_call', { payload: request });

export const endSystemCall = (request: EndSystemCallRequest): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|end_system_call', { payload: request });

export const setSystemCallMuted = (request: SetSystemCallMutedRequest): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|set_system_call_muted', { payload: request });

export const drainPendingSystemCallActions = (): Promise<SystemCallAction[]> =>
  invoke<SystemCallAction[]>('plugin:livekit-mobile|drain_pending_system_call_actions');

export const fulfillAnswerCall = (uuid: string): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|fulfill_answer_call', { payload: { uuid } });

export const fulfillEndCall = (uuid: string): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|fulfill_end_call', { payload: { uuid } });

export const reportSystemCallConnected = (uuid: string): Promise<void> =>
  invoke<void>('plugin:livekit-mobile|report_system_call_connected', { payload: { uuid } });

export const getAudioRoutes = (request: GetAudioRoutesRequest): Promise<GetAudioRoutesResponse> =>
  invoke<GetAudioRoutesResponse>('plugin:livekit-mobile|get_audio_routes', { payload: request });

export const setAudioRoute = (request: SetAudioRouteRequest): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|set_audio_route', { payload: request });

export const updateCallDisplay = (request: UpdateCallDisplayRequest): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|update_call_display', { payload: request });

export const onSystemCallAction = (
  handler: (action: SystemCallAction) => void
): Promise<PluginListener> => addPluginListener('livekit-mobile', 'callkit_event', handler);
