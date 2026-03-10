import { isTauri } from '@tauri-apps/api/core';

export function hasServiceWorker(): boolean {
  // Android WebViews (Tauri) do not support service workers.
  return 'serviceWorker' in navigator && !isTauri();
}
