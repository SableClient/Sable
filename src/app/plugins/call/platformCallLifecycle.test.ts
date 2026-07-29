import { beforeEach, describe, expect, it, vi } from 'vitest';

const pluginGetCapabilities = vi.hoisted(() => vi.fn<() => Promise<unknown>>());
const pluginGetState = vi.hoisted(() => vi.fn<() => Promise<unknown>>());
const pluginListenEvent = vi.hoisted(() =>
  vi.fn<(handler: (event: unknown) => void) => Promise<unknown>>()
);
const pluginStart = vi.hoisted(() => vi.fn<(request: unknown) => Promise<unknown>>());
const pluginStop = vi.hoisted(() => vi.fn<(request: unknown) => Promise<unknown>>());

vi.mock('tauri-plugin-call-lifecycle-api', () => ({
  getPlatformCallCapabilities: pluginGetCapabilities,
  getPlatformCallState: pluginGetState,
  listenPlatformCallEvent: pluginListenEvent,
  startPlatformCallLifecycle: pluginStart,
  stopPlatformCallLifecycle: pluginStop,
}));

import {
  getPlatformCapabilities,
  getPlatformState,
  onPlatformCallEvent,
  startPlatformLifecycle,
  stopPlatformLifecycle,
  type PlatformCallEvent,
  type PlatformCallState,
} from './platformCallLifecycle';

describe('platform call lifecycle wrapper', () => {
  beforeEach(() => {
    pluginGetCapabilities.mockReset();
    pluginGetState.mockReset();
    pluginListenEvent.mockReset();
    pluginStart.mockReset();
    pluginStop.mockReset();
    pluginListenEvent.mockResolvedValue(vi.fn());
  });

  it('delegates capabilities/start/stop/state commands with opaque session payloads', async () => {
    const capabilities = { supported: true, microphone: true, playback: true };
    const state = {
      revision: 2,
      state: 'active',
      sessionId: 'opaque-session',
      microphone: true,
      playback: true,
      capabilities,
    } satisfies PlatformCallState;
    pluginGetCapabilities.mockResolvedValue(capabilities);
    pluginStart.mockResolvedValue(state);
    pluginStop.mockResolvedValue(state);
    pluginGetState.mockResolvedValue(state);

    await expect(getPlatformCapabilities()).resolves.toEqual(capabilities);
    await expect(
      startPlatformLifecycle({ sessionId: 'opaque-session', microphone: true, playback: true })
    ).resolves.toEqual(state);
    await expect(stopPlatformLifecycle({ sessionId: 'opaque-session' })).resolves.toEqual(state);
    await expect(getPlatformState()).resolves.toEqual(state);

    expect(pluginStart).toHaveBeenCalledWith({
      sessionId: 'opaque-session',
      microphone: true,
      playback: true,
    });
    expect(pluginStop).toHaveBeenCalledWith({ sessionId: 'opaque-session' });
  });

  it('forwards bounded platform events and drops malformed payloads', async () => {
    const handler = vi.fn<(event: PlatformCallEvent) => void>();
    await onPlatformCallEvent(handler);
    const listener = pluginListenEvent.mock.calls[0]?.[0] as (event: unknown) => void;

    const routeEvent: PlatformCallEvent = {
      revision: 4,
      sessionId: 'opaque-session',
      type: 'route_changed',
      route: 'speaker',
    };
    listener(routeEvent);
    listener({ revision: 5, sessionId: 'opaque-session', type: 'media_reset' });
    listener({
      revision: 6,
      sessionId: 'opaque-session',
      type: 'failed',
      code: 'audio_unavailable',
    });

    // Malformed or out-of-contract payloads never reach the handler.
    listener({ revision: 7, sessionId: 'opaque-session', type: 'route_changed', route: 'eth0' });
    listener({ revision: 8, sessionId: 'opaque-session', type: 'publish_track' });
    listener({ revision: '9', sessionId: 'opaque-session', type: 'media_reset' });
    listener({ revision: 10, type: 'media_reset' });
    listener({ revision: 11, sessionId: 'opaque-session', type: 'failed', code: 'raw-native' });

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenNthCalledWith(1, routeEvent);
  });
});
