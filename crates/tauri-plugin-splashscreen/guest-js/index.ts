import { invoke } from '@tauri-apps/api/core';

interface Splashscreen {
  ping(value: string): Promise<string | null>;
  close(): Promise<void>;
}

const splashscreen: Splashscreen = {
  async ping(value: string): Promise<string | null> {
    return await invoke<{ value?: string }>('plugin:splashscreen|ping', {
      payload: {
        value,
      },
    }).then((r) => (r.value ? r.value : null));
  },

  async close(): Promise<void> {
    await invoke('plugin:splashscreen|close');
  },
};

export default splashscreen;
