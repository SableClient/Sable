'use strict';

var core = require('@tauri-apps/api/core');
var event = require('@tauri-apps/api/event');

const PLATFORM_CALL_EVENT = 'plugin:call-lifecycle://platform-event';
async function connect(request) {
    return await core.invoke('plugin:call-lifecycle|connect', { payload: request });
}
async function disconnect(request) {
    return await core.invoke('plugin:call-lifecycle|disconnect', { payload: request });
}
async function setMediaEnabled(request) {
    return await core.invoke('plugin:call-lifecycle|set_media_enabled', { payload: request });
}
async function getState() {
    return await core.invoke('plugin:call-lifecycle|get_state');
}
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
exports.connect = connect;
exports.disconnect = disconnect;
exports.getPlatformCallCapabilities = getPlatformCallCapabilities;
exports.getPlatformCallState = getPlatformCallState;
exports.getState = getState;
exports.listenPlatformCallEvent = listenPlatformCallEvent;
exports.setMediaEnabled = setMediaEnabled;
exports.startPlatformCallLifecycle = startPlatformCallLifecycle;
exports.stopPlatformCallLifecycle = stopPlatformCallLifecycle;
