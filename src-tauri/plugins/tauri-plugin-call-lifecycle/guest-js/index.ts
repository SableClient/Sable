import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

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
