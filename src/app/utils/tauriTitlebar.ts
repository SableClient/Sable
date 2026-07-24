import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';

export type CustomTitlebarKind = 'desktop' | 'mac' | null;

export function getCustomTitlebarKind(
  useCustomTitleBar: boolean,
  platform: string | undefined
): CustomTitlebarKind {
  if (!useCustomTitleBar) return null;
  if (platform === 'windows' || platform === 'linux') return 'desktop';
  if (platform === 'macos') return 'mac';
  return null;
}

export function hasCustomDesktopTitlebar(useCustomTitleBar: boolean): boolean {
  if (!isTauri()) return false;
  return getCustomTitlebarKind(useCustomTitleBar, osType()) !== null;
}
