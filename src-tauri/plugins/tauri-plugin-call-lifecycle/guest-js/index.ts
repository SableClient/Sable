import { invoke } from '@tauri-apps/api/core'

export interface ConnectRequest {
  connectionId: string
  serverUrl: string
  participantToken: string
  audio?: boolean
  video?: boolean
  screenShare?: boolean
}

export interface DisconnectRequest {
  connectionId: string
}

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnecting'

export interface CallState {
  revision: number
  state: ConnectionState
  connectionId: string | null
}

export interface CallLifecycleError {
  revision: number
  code: string
  message: string
  connectionId: string | null
}

export async function connect(request: ConnectRequest): Promise<CallState> {
  return await invoke<CallState>('plugin:call-lifecycle|connect', { payload: request })
}

export async function disconnect(request: DisconnectRequest): Promise<CallState> {
  return await invoke<CallState>('plugin:call-lifecycle|disconnect', { payload: request })
}

export async function getState(): Promise<CallState> {
  return await invoke<CallState>('plugin:call-lifecycle|get_state')
}
