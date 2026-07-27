'use strict';

var core = require('@tauri-apps/api/core');

async function connect(request) {
    return await core.invoke('plugin:call-lifecycle|connect', { payload: request });
}
async function disconnect(request) {
    return await core.invoke('plugin:call-lifecycle|disconnect', { payload: request });
}
async function getState() {
    return await core.invoke('plugin:call-lifecycle|get_state');
}

exports.connect = connect;
exports.disconnect = disconnect;
exports.getState = getState;
