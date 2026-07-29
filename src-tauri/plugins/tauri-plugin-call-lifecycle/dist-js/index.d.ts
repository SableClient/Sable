import { type UnlistenFn } from '@tauri-apps/api/event';
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
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnecting';
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
export type PlatformCallFailureCode = 'unsupported' | 'permission_denied' | 'audio_unavailable' | 'start_failed' | 'stop_failed' | 'stale_session' | 'busy';
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
export type PlatformCallEventKind = {
    type: 'focus_changed';
    focused: boolean;
} | {
    type: 'route_changed';
    route: PlatformCallRoute;
} | {
    type: 'interrupted';
    state: PlatformCallInterruption;
} | {
    type: 'media_reset';
} | {
    type: 'failed';
    code: PlatformCallFailureCode;
};
export type PlatformCallEvent = {
    revision: number;
    sessionId: string;
} & PlatformCallEventKind;
export declare const PLATFORM_CALL_EVENT = "plugin:call-lifecycle://platform-event";
export declare function connect(request: ConnectRequest): Promise<CallState>;
export declare function disconnect(request: DisconnectRequest): Promise<CallState>;
export declare function setMediaEnabled(request: SetMediaEnabledRequest): Promise<CallState>;
export declare function getState(): Promise<CallState>;
export declare function getPlatformCallCapabilities(): Promise<PlatformCallCapabilities>;
export declare function startPlatformCallLifecycle(request: StartPlatformCallLifecycleRequest): Promise<PlatformCallState>;
export declare function stopPlatformCallLifecycle(request: StopPlatformCallLifecycleRequest): Promise<PlatformCallState>;
export declare function getPlatformCallState(): Promise<PlatformCallState>;
export declare function listenPlatformCallEvent(handler: (event: PlatformCallEvent) => void): Promise<UnlistenFn>;
