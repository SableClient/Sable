import { beforeEach, describe, expect, it, vi } from 'vitest';

const pluginConnect = vi.hoisted(() => vi.fn<(request: unknown) => Promise<unknown>>());
const pluginDisconnect = vi.hoisted(() => vi.fn<(request: unknown) => Promise<unknown>>());
const pluginGetState = vi.hoisted(() => vi.fn<() => Promise<unknown>>());
const invoke = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());
const listen = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());

vi.mock('tauri-plugin-call-lifecycle-api', () => ({
  connect: pluginConnect,
  disconnect: pluginDisconnect,
  getState: pluginGetState,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen }));

import {
  connect,
  disconnect,
  getState,
  onError,
  onState,
  setMediaEnabled,
  type CallLifecycleError,
  type CallState,
} from './callLifecycle';

describe('call lifecycle wrapper', () => {
  beforeEach(() => {
    pluginConnect.mockReset();
    pluginDisconnect.mockReset();
    pluginGetState.mockReset();
    invoke.mockReset();
    listen.mockReset();
    listen.mockResolvedValue(vi.fn());
  });

  it('uses the namespaced media command and native snake-case payload', async () => {
    const state = {
      revision: 1,
      state: 'connected',
      connectionId: 'connection-id',
    } satisfies CallState;
    invoke.mockResolvedValue(state);

    await expect(
      setMediaEnabled({ connectionId: 'connection-id', kind: 'screen_share', enabled: true })
    ).resolves.toEqual(state);

    expect(invoke).toHaveBeenCalledWith('plugin:call-lifecycle|set_media_enabled', {
      payload: { connectionId: 'connection-id', kind: 'screen_share', enabled: true },
    });
  });

  it('delegates lifecycle commands to the guest API', async () => {
    const state = {
      revision: 1,
      state: 'connecting',
      connectionId: 'connection-id',
    } satisfies CallState;
    pluginConnect.mockResolvedValue(state);
    pluginDisconnect.mockResolvedValue(state);
    pluginGetState.mockResolvedValue(state);

    const request = {
      connectionId: 'connection-id',
      serverUrl: 'wss://livekit.example',
      participantToken: 'token',
    };
    await expect(connect(request)).resolves.toEqual(state);
    await expect(disconnect({ connectionId: 'connection-id' })).resolves.toEqual(state);
    await expect(getState()).resolves.toEqual(state);

    expect(pluginConnect).toHaveBeenCalledWith(request);
    expect(pluginDisconnect).toHaveBeenCalledWith({
      connectionId: 'connection-id',
    });
    expect(pluginGetState).toHaveBeenCalledWith();
  });

  it('registers typed state and error listeners', async () => {
    const state = {
      revision: 2,
      state: 'connected',
      connectionId: 'connection-id',
    } satisfies CallState;
    const error = {
      revision: 3,
      code: 'connect_failed',
      message: 'call connection failed',
      connectionId: 'connection-id',
    } satisfies CallLifecycleError;
    const onStateEvent = vi.fn<(value: CallState) => void>();
    const onErrorEvent = vi.fn<(value: CallLifecycleError) => void>();

    const stateUnlisten = await onState(onStateEvent);
    const stateListener = listen.mock.calls[0]?.[1] as (event: { payload: CallState }) => void;
    stateListener({ payload: state });

    const errorUnlisten = await onError(onErrorEvent);
    const errorListener = listen.mock.calls[1]?.[1] as (event: {
      payload: CallLifecycleError;
    }) => void;
    errorListener({ payload: error });

    expect(listen).toHaveBeenNthCalledWith(
      1,
      'plugin:call-lifecycle://state',
      expect.any(Function)
    );
    expect(listen).toHaveBeenNthCalledWith(
      2,
      'plugin:call-lifecycle://error',
      expect.any(Function)
    );
    expect(onStateEvent).toHaveBeenCalledWith(state);
    expect(onErrorEvent).toHaveBeenCalledWith(error);
    expect(stateUnlisten).toBeTypeOf('function');
    expect(errorUnlisten).toBeTypeOf('function');
  });
});
