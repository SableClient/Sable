import {
  connect as pluginConnect,
  disconnect as pluginDisconnect,
  getState as pluginGetState,
  type CallLifecycleError,
  type CallState,
  type ConnectRequest,
  type ConnectionState,
  type DisconnectRequest,
} from 'tauri-plugin-call-lifecycle-api';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

const STATE_EVENT = 'plugin:call-lifecycle://state';
const ERROR_EVENT = 'plugin:call-lifecycle://error';

export type { CallLifecycleError, CallState, ConnectRequest, ConnectionState, DisconnectRequest };

export type MediaKind = 'microphone' | 'camera' | 'screen_share';

export type SetMediaEnabledRequest = {
  connectionId: string;
  kind: MediaKind;
  enabled: boolean;
};

export const connect = pluginConnect;
export const disconnect = pluginDisconnect;
export const getState = pluginGetState;

export function setMediaEnabled(request: SetMediaEnabledRequest): Promise<CallState> {
  return invoke<CallState>('plugin:call-lifecycle|set_media_enabled', { payload: request });
}

export function onState(handler: (state: CallState) => void): Promise<UnlistenFn> {
  return listen<CallState>(STATE_EVENT, (event) => handler(event.payload));
}

export function onError(handler: (error: CallLifecycleError) => void): Promise<UnlistenFn> {
  return listen<CallLifecycleError>(ERROR_EVENT, (event) => handler(event.payload));
}
