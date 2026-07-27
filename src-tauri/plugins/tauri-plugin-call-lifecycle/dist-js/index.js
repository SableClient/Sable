import { invoke } from '@tauri-apps/api/core';

async function connect(request) {
    return await invoke('plugin:call-lifecycle|connect', { payload: request });
}
async function disconnect(request) {
    return await invoke('plugin:call-lifecycle|disconnect', { payload: request });
}
async function getState() {
    return await invoke('plugin:call-lifecycle|get_state');
}

export { connect, disconnect, getState };
