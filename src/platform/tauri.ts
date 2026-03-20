import type { PlatformAdapter, NotificationOptions, AudioCaptureHandle } from './types';

// Tauri adapter — uses __TAURI_INTERNALS__ directly instead of importing
// @tauri-apps/* npm packages, since those are externalized from the Vite
// bundle and not available at runtime.

function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__TAURI_INTERNALS__.invoke(cmd, args);
}

const WINDOW_LABEL = 'main';

const tauriAdapter: PlatformAdapter = {
  name: 'tauri',
  supportsNativeNotifications: true,
  supportsAudioCapture: true,
  isDesktop: true,

  async showNotification(title: string, options?: NotificationOptions): Promise<void> {
    console.warn('[tauri] showNotification called:', title, options);
    try {
      const args = {
        options: {
          title,
          body: options?.body ?? null,
        },
      };
      console.warn('[tauri] invoking show_notification with:', JSON.stringify(args));
      await invoke('show_notification', args);
      console.warn('[tauri] show_notification invoke succeeded');
    } catch (e) {
      console.error('[tauri] show_notification invoke FAILED:', e);
    }
  },

  async requestNotificationPermission(): Promise<boolean> {
    // On desktop, the Tauri notification plugin always grants permission.
    return true;
  },

  async startAudioCapture(): Promise<AudioCaptureHandle | null> {
    try {
      const { port, sampleRate, channels } = await invoke<{
        port: number;
        sampleRate: number;
        channels: number;
      }>('start_audio_capture');

      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      ws.binaryType = 'arraybuffer';

      const audioCtx = new AudioContext({ sampleRate });
      const destination = audioCtx.createMediaStreamDestination();

      const bufferSize = 4096;
      const processor = audioCtx.createScriptProcessor(bufferSize, channels, channels);

      let pendingBuffers: Float32Array[] = [];

      ws.onmessage = (event) => {
        const pcm = new Float32Array(event.data as ArrayBuffer);
        pendingBuffers.push(pcm);
      };

      processor.onaudioprocess = (e) => {
        for (let ch = 0; ch < channels; ch++) {
          const output = e.outputBuffer.getChannelData(ch);
          output.fill(0);
        }

        if (pendingBuffers.length === 0) return;

        const combined = concatFloat32Arrays(pendingBuffers);
        pendingBuffers = [];

        const framesNeeded = e.outputBuffer.length;
        const framesAvailable = Math.floor(combined.length / channels);
        const frames = Math.min(framesNeeded, framesAvailable);

        for (let i = 0; i < frames; i++) {
          for (let ch = 0; ch < channels; ch++) {
            e.outputBuffer.getChannelData(ch)[i] = combined[i * channels + ch];
          }
        }
      };

      processor.connect(destination);

      const stream = destination.stream;

      return {
        getStream() {
          return stream;
        },
        async stop() {
          ws.close();
          processor.disconnect();
          await audioCtx.close();
          try {
            await invoke('stop_audio_capture');
          } catch {
            // Best-effort cleanup
          }
        },
      } as AudioCaptureHandle;
    } catch (e) {
      console.error('[tauri] Failed to start audio capture:', e);
      return null;
    }
  },

  async minimizeWindow(): Promise<void> {
    // Minimize to system tray (hide the window)
    await invoke('plugin:window|hide', { label: WINDOW_LABEL });
  },

  async toggleMaximizeWindow(): Promise<void> {
    await invoke('plugin:window|toggle_maximize', { label: WINDOW_LABEL });
  },

  async closeWindow(): Promise<void> {
    // Close hides to tray (the Rust side intercepts CloseRequested)
    await invoke('plugin:window|close', { label: WINDOW_LABEL });
  },
};

function concatFloat32Arrays(arrays: Float32Array[]): Float32Array {
  let totalLength = 0;
  for (const arr of arrays) totalLength += arr.length;
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

export { tauriAdapter as adapter };
