import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';

export function hasServiceWorker(): boolean {
  // Android WebViews (Tauri) do not support service workers.
  return 'serviceWorker' in navigator && !isTauri();
}

export type DesktopTauriPlatform = 'linux' | 'macos' | 'windows';

const DESKTOP_TAURI_OS = new Set<DesktopTauriPlatform>(['linux', 'macos', 'windows']);

export function getDesktopTauriPlatform(): DesktopTauriPlatform | undefined {
  if (!isTauri()) return undefined;
  const os = osType() as string;
  return DESKTOP_TAURI_OS.has(os as DesktopTauriPlatform)
    ? (os as DesktopTauriPlatform)
    : undefined;
}

export function isDesktopTauri(): boolean {
  return getDesktopTauriPlatform() !== undefined;
}

export function hasControllingServiceWorker(): boolean {
  return hasServiceWorker() && navigator.serviceWorker.controller !== null;
}

// window.location.origin is "null" on Tauri (tauri:// is opaque per WHATWG).
export function getAppOrigin(): string {
  if (
    isTauri() ||
    (typeof window !== 'undefined' && window.location.hostname === 'tauri.localhost')
  ) {
    return 'https://app.sable.moe';
  }
  return window.location.origin === 'null'
    ? `${window.location.protocol}//${window.location.host}`
    : window.location.origin;
}
