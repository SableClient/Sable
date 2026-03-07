'use strict';

var core = require('@tauri-apps/api/core');

const splashscreen = {
    async ping(value) {
        return await core.invoke('plugin:splashscreen|ping', {
            payload: {
                value,
            },
        }).then((r) => (r.value ? r.value : null));
    },
    async close() {
        await core.invoke('plugin:splashscreen|close');
    },
};

module.exports = splashscreen;
