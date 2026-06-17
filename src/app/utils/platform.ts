const TAURI_INTERNALS_KEY = '__TAURI_INTERNALS__' as const;

type MaybeTauriWindow = Window &
  typeof globalThis & {
    [TAURI_INTERNALS_KEY]?: unknown;
  };

export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as MaybeTauriWindow)[TAURI_INTERNALS_KEY] !== 'undefined';
}

export function hasServiceWorker(): boolean {
  // Android WebViews (Tauri) do not support service workers.
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !isTauriRuntime();
}

export function hasControllingServiceWorker(): boolean {
  return hasServiceWorker() && navigator.serviceWorker.controller !== null;
}
