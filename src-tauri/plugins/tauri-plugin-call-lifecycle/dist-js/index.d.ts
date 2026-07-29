import { type UnlistenFn } from '@tauri-apps/api/event';
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
export declare function getPlatformCallCapabilities(): Promise<PlatformCallCapabilities>;
export declare function startPlatformCallLifecycle(request: StartPlatformCallLifecycleRequest): Promise<PlatformCallState>;
export declare function stopPlatformCallLifecycle(request: StopPlatformCallLifecycleRequest): Promise<PlatformCallState>;
export declare function getPlatformCallState(): Promise<PlatformCallState>;
export declare function listenPlatformCallEvent(handler: (event: PlatformCallEvent) => void): Promise<UnlistenFn>;
