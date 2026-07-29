import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface ConnectRequest {
  connectionId: string;
  serverUrl: string;
  participantToken: string;
  audio?: boolean;
  video?: boolean;
  screenShare?: boolean;
}

export interface DisconnectRequest {
  connectionId: string;
}

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnecting';

export type MediaKind = 'microphone' | 'camera' | 'screen_share';

export interface SetMediaEnabledRequest {
  connectionId: string;
  kind: MediaKind;
  enabled: boolean;
}

export interface MediaState {
  microphone: boolean;
  camera: boolean;
  screenShare: boolean;
}

export interface MediaCapabilities {
  microphone: boolean;
  camera: boolean;
  screenShare: boolean;
}

export interface CallState {
  revision: number;
  state: ConnectionState;
  connectionId: string | null;
  media: MediaState;
  capabilities: MediaCapabilities;
}

export interface CallLifecycleError {
  revision: number;
  code: string;
  message: string;
  connectionId: string | null;
}

export type PlatformCallStateKind = 'idle' | 'starting' | 'active' | 'stopping';
export type PlatformCallRoute = 'earpiece' | 'speaker' | 'wired' | 'bluetooth' | 'unknown';
export type PlatformCallInterruption = 'began' | 'ended';
export type PlatformCallFailureCode =
  | 'unsupported'
  | 'permission_denied'
  | 'audio_unavailable'
  | 'start_failed'
  | 'stop_failed'
  | 'stale_session'
  | 'busy';

export interface PlatformCallCapabilities {
  supported: boolean;
  microphone: boolean;
  playback: boolean;
}

export interface StartPlatformCallLifecycleRequest {
  sessionId: string;
  microphone: boolean;
  playback: boolean;
}

export interface StopPlatformCallLifecycleRequest {
  sessionId: string;
}

export interface PlatformCallState {
  revision: number;
  state: PlatformCallStateKind;
  sessionId: string | null;
  microphone: boolean;
  playback: boolean;
  capabilities: PlatformCallCapabilities;
}

export type PlatformCallEventKind =
  | { type: 'focus_changed'; focused: boolean }
  | { type: 'route_changed'; route: PlatformCallRoute }
  | { type: 'interrupted'; state: PlatformCallInterruption }
  | { type: 'media_reset' }
  | { type: 'failed'; code: PlatformCallFailureCode };

export type PlatformCallEvent = {
  revision: number;
  sessionId: string;
} & PlatformCallEventKind;

export const PLATFORM_CALL_EVENT = 'plugin:call-lifecycle://platform-event';

export async function connect(request: ConnectRequest): Promise<CallState> {
  return await invoke<CallState>('plugin:call-lifecycle|connect', { payload: request });
}

export async function disconnect(request: DisconnectRequest): Promise<CallState> {
  return await invoke<CallState>('plugin:call-lifecycle|disconnect', { payload: request });
}

export async function setMediaEnabled(request: SetMediaEnabledRequest): Promise<CallState> {
  return await invoke<CallState>('plugin:call-lifecycle|set_media_enabled', { payload: request });
}

export async function getState(): Promise<CallState> {
  return await invoke<CallState>('plugin:call-lifecycle|get_state');
}

export async function getPlatformCallCapabilities(): Promise<PlatformCallCapabilities> {
  return await invoke<PlatformCallCapabilities>(
    'plugin:call-lifecycle|getPlatformCallCapabilities'
  );
}

export async function startPlatformCallLifecycle(
  request: StartPlatformCallLifecycleRequest
): Promise<PlatformCallState> {
  return await invoke<PlatformCallState>('plugin:call-lifecycle|startPlatformCallLifecycle', {
    payload: request,
  });
}

export async function stopPlatformCallLifecycle(
  request: StopPlatformCallLifecycleRequest
): Promise<PlatformCallState> {
  return await invoke<PlatformCallState>('plugin:call-lifecycle|stopPlatformCallLifecycle', {
    payload: request,
  });
}

export async function getPlatformCallState(): Promise<PlatformCallState> {
  return await invoke<PlatformCallState>('plugin:call-lifecycle|getPlatformCallState');
}

export async function listenPlatformCallEvent(
  handler: (event: PlatformCallEvent) => void
): Promise<UnlistenFn> {
  return await listen<PlatformCallEvent>(PLATFORM_CALL_EVENT, ({ payload }) => handler(payload));
}
