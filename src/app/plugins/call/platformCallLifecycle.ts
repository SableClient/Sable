import {
  getPlatformCallCapabilities as pluginGetCapabilities,
  getPlatformCallState as pluginGetState,
  listenPlatformCallEvent as pluginListenEvent,
  startPlatformCallLifecycle as pluginStart,
  stopPlatformCallLifecycle as pluginStop,
  type PlatformCallCapabilities,
  type PlatformCallEvent,
  type PlatformCallFailureCode,
  type PlatformCallRoute,
  type PlatformCallState,
  type StartPlatformCallLifecycleRequest,
  type StopPlatformCallLifecycleRequest,
} from 'tauri-plugin-call-lifecycle-api';
import type { UnlistenFn } from '@tauri-apps/api/event';

export type {
  PlatformCallCapabilities,
  PlatformCallEvent,
  PlatformCallFailureCode,
  PlatformCallRoute,
  PlatformCallState,
  StartPlatformCallLifecycleRequest,
  StopPlatformCallLifecycleRequest,
};

const EVENT_TYPES = new Set([
  'focus_changed',
  'route_changed',
  'interrupted',
  'media_reset',
  'failed',
]);

const ROUTES = new Set<PlatformCallRoute>(['earpiece', 'speaker', 'wired', 'bluetooth', 'unknown']);

const FAILURE_CODES = new Set<PlatformCallFailureCode>([
  'unsupported',
  'permission_denied',
  'audio_unavailable',
  'start_failed',
  'stop_failed',
  'stale_session',
  'busy',
]);

const isBoundedEvent = (payload: unknown): payload is PlatformCallEvent => {
  if (!payload || typeof payload !== 'object') return false;
  const event = payload as Record<string, unknown>;
  if (typeof event.revision !== 'number' || typeof event.sessionId !== 'string') return false;
  if (typeof event.type !== 'string' || !EVENT_TYPES.has(event.type)) return false;
  switch (event.type) {
    case 'focus_changed':
      return typeof event.focused === 'boolean';
    case 'route_changed':
      return typeof event.route === 'string' && ROUTES.has(event.route as PlatformCallRoute);
    case 'interrupted':
      return event.state === 'began' || event.state === 'ended';
    case 'media_reset':
      return true;
    case 'failed':
      return (
        typeof event.code === 'string' && FAILURE_CODES.has(event.code as PlatformCallFailureCode)
      );
    default:
      return false;
  }
};

export const getPlatformCapabilities = pluginGetCapabilities;
export const startPlatformLifecycle = pluginStart;
export const stopPlatformLifecycle = pluginStop;
export const getPlatformState = pluginGetState;

export function onPlatformCallEvent(
  handler: (event: PlatformCallEvent) => void
): Promise<UnlistenFn> {
  return pluginListenEvent((payload) => {
    if (isBoundedEvent(payload)) handler(payload);
  });
}
