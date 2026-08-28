import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import { useAtomValue } from 'jotai';
import { titlebarStatusAtom } from '$state/titlebarStatus';
import { SyncConnectionStatusTitlebar } from '$components/SyncConnectionStatus';
import { DesktopUpdatePill } from './DesktopUpdatePill';

// Draggable strip that reserves space for the native traffic lights (floating
// over the content via the transparent titlebar) and hosts the sync pill.
export function MacTitleBar() {
  const isMac = isTauri() && osType() === 'macos';
  const titlebarStatus = useAtomValue(titlebarStatusAtom);

  if (!isMac) return null;

  return (
    <nav
      className="tauri-titlebar tauri-titlebar--mac"
      data-tauri-drag-region
      style={{ position: 'relative' }}
    >
      <div className="tauri-titlebar__status" data-tauri-drag-region>
        <SyncConnectionStatusTitlebar status={titlebarStatus} />
      </div>
      <div className="tauri-titlebar__update">
        <DesktopUpdatePill />
      </div>
    </nav>
  );
}
