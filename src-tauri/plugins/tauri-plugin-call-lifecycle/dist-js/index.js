import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const PLATFORM_CALL_EVENT = 'plugin:call-lifecycle://platform-event';
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

export { PLATFORM_CALL_EVENT, getPlatformCallCapabilities, getPlatformCallState, listenPlatformCallEvent, startPlatformCallLifecycle, stopPlatformCallLifecycle };
