import { invoke, isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';

export type HapticKind = 'light' | 'medium' | 'heavy' | 'selection';

const ANDROID_MS: Record<HapticKind, number> = {
  light: 8,
  medium: 12,
  heavy: 18,
  selection: 5,
};

export function haptic(kind: HapticKind = 'light'): void {
  if (!isTauri()) return;
  const os = osType();
  if (os === 'android') {
    navigator.vibrate?.(ANDROID_MS[kind]);
  } else if (os === 'ios') {
    invoke('haptic_feedback', { style: kind }).catch(() => {});
  }
}
