import { invoke } from '@tauri-apps/api/core';

const splashscreen = {
    async ping(value) {
        return await invoke('plugin:splashscreen|ping', {
            payload: {
                value,
            },
        }).then((r) => (r.value ? r.value : null));
    },
    async close() {
        await invoke('plugin:splashscreen|close');
    },
};

export { splashscreen as default };
