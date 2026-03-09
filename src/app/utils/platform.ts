import { isTauri } from '@tauri-apps/api/core';

let swSupported: boolean | undefined;

export function hasServiceWorker(): boolean {
  // Android WebViews (Tauri) do not support service workers.
  // Cache the result to avoid repeated isTauri() IPC overhead.
  if (swSupported === undefined) {
    swSupported = 'serviceWorker' in navigator && !isTauri();
  }
  return swSupported;
}
