import { invoke } from '@tauri-apps/api/core';
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
};

export type NativeCallEncryptionKeyPayload = {
  identity: string;
  keyIndex: number;
  key: string;
};

export type NativeCallSnapshot = {
  revision: number;
  callId: string | null;
  connectionState: NativeCallConnectionState;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  participantCount: number;
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

export const setNativeCallEncryptionKey = (
  request: SetNativeCallEncryptionKeyRequest
): Promise<NativeCallSnapshot> =>
  invoke<NativeCallSnapshot>('plugin:livekit-mobile|setNativeCallEncryptionKey', {
    payload: request,
  });

export const listenNativeCallSnapshot = (
  handler: (snapshot: NativeCallSnapshot) => void
): Promise<UnlistenFn> =>
  listen<NativeCallSnapshot>(NATIVE_CALL_EVENT, ({ payload }) => handler(payload));
