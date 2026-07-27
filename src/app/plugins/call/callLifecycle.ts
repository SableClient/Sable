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
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

const STATE_EVENT = 'plugin:call-lifecycle://state';
const ERROR_EVENT = 'plugin:call-lifecycle://error';

export type { CallLifecycleError, CallState, ConnectRequest, ConnectionState, DisconnectRequest };

export const connect = pluginConnect;
export const disconnect = pluginDisconnect;
export const getState = pluginGetState;

export function onState(handler: (state: CallState) => void): Promise<UnlistenFn> {
  return listen<CallState>(STATE_EVENT, (event) => handler(event.payload));
}

export function onError(handler: (error: CallLifecycleError) => void): Promise<UnlistenFn> {
  return listen<CallLifecycleError>(ERROR_EVENT, (event) => handler(event.payload));
}
