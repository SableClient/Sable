import type { PlatformAdapter } from './types';

export type { PlatformAdapter, NotificationOptions, AudioCaptureHandle } from './types';

let cachedPlatform: PlatformAdapter | undefined;

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Returns the platform adapter, loading it asynchronously if needed (Tauri).
 * The result is cached after first call. Call this early in app startup.
 */
export async function getPlatform(): Promise<PlatformAdapter> {
  if (cachedPlatform) return cachedPlatform;

  if (isTauri()) {
    const { adapter } = await import('./tauri');
    cachedPlatform = adapter;
  } else {
    const { adapter } = await import('./web');
    cachedPlatform = adapter;
  }

  return cachedPlatform;
}

/**
 * Synchronous access after getPlatform() has resolved.
 * Throws if called before initialization.
 */
export function platform(): PlatformAdapter {
  if (!cachedPlatform) {
    throw new Error('Platform not initialized. Call getPlatform() during app startup first.');
  }
  return cachedPlatform;
}
