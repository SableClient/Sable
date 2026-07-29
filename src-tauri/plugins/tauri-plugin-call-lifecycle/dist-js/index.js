import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const PLATFORM_CALL_EVENT = 'plugin:call-lifecycle://platform-event';
async function connect(request) {
    return await invoke('plugin:call-lifecycle|connect', { payload: request });
}
async function disconnect(request) {
    return await invoke('plugin:call-lifecycle|disconnect', { payload: request });
}
async function setMediaEnabled(request) {
    return await invoke('plugin:call-lifecycle|set_media_enabled', { payload: request });
}
async function getState() {
    return await invoke('plugin:call-lifecycle|get_state');
}
async function getPlatformCallCapabilities() {
    return await invoke('plugin:call-lifecycle|getPlatformCallCapabilities');
}
async function startPlatformCallLifecycle(request) {
    return await invoke('plugin:call-lifecycle|startPlatformCallLifecycle', {
        payload: request,
    });
}
async function stopPlatformCallLifecycle(request) {
    return await invoke('plugin:call-lifecycle|stopPlatformCallLifecycle', {
        payload: request,
    });
}
async function getPlatformCallState() {
    return await invoke('plugin:call-lifecycle|getPlatformCallState');
}
async function listenPlatformCallEvent(handler) {
    return await listen(PLATFORM_CALL_EVENT, ({ payload }) => handler(payload));
}

export { PLATFORM_CALL_EVENT, connect, disconnect, getPlatformCallCapabilities, getPlatformCallState, getState, listenPlatformCallEvent, setMediaEnabled, startPlatformCallLifecycle, stopPlatformCallLifecycle };
