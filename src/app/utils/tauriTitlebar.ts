import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';

// Windows and Linux draw their own titlebar with a slot for the sync pill; macOS
// keeps native decorations and uses the inline banner like web/mobile.
export function hasCustomDesktopTitlebar(): boolean {
  if (!isTauri()) return false;
  const os = osType();
  return os === 'windows' || os === 'linux';
}
