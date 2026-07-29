'use strict';

var core = require('@tauri-apps/api/core');
var event = require('@tauri-apps/api/event');

const PLATFORM_CALL_EVENT = 'plugin:call-lifecycle://platform-event';
async function getPlatformCallCapabilities() {
    return await core.invoke('plugin:call-lifecycle|getPlatformCallCapabilities');
}
async function startPlatformCallLifecycle(request) {
    return await core.invoke('plugin:call-lifecycle|startPlatformCallLifecycle', {
        payload: request,
    });
}
async function stopPlatformCallLifecycle(request) {
    return await core.invoke('plugin:call-lifecycle|stopPlatformCallLifecycle', {
        payload: request,
    });
}
async function getPlatformCallState() {
    return await core.invoke('plugin:call-lifecycle|getPlatformCallState');
}
async function listenPlatformCallEvent(handler) {
    return await event.listen(PLATFORM_CALL_EVENT, ({ payload }) => handler(payload));
}

exports.PLATFORM_CALL_EVENT = PLATFORM_CALL_EVENT;
exports.getPlatformCallCapabilities = getPlatformCallCapabilities;
exports.getPlatformCallState = getPlatformCallState;
exports.listenPlatformCallEvent = listenPlatformCallEvent;
exports.startPlatformCallLifecycle = startPlatformCallLifecycle;
exports.stopPlatformCallLifecycle = stopPlatformCallLifecycle;
