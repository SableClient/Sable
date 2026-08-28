import { useAtom, useAtomValue } from 'jotai';
import { hasCustomDesktopTitlebar } from '$utils/tauriTitlebar';
import { isDesktopUpdaterEnabled } from '$utils/platform';
import { useDesktopSetting } from '$state/hooks/desktopSettings';
import { updatePhaseAtom, updateBannerVisibleAtom } from '$state/desktopUpdate';
import type { UpdatePhase } from '$state/desktopUpdate';
import type { TitlebarStatusView } from '$state/titlebarStatus';
import { SyncConnectionStatusTitlebar } from '$components/SyncConnectionStatus';
import { DownloadSimple } from '$components/icons/phosphor';

function phaseToStatusView(phase: UpdatePhase): TitlebarStatusView | null {
  switch (phase.type) {
    case 'downloading':
      return { text: 'Update Downloading', variant: 'Warning', progress: phase.progress };
    case 'ready':
      return { text: 'Update Available', variant: 'Success' };
    default:
      return null;
  }
}

export function DesktopUpdatePill() {
  const phase = useAtomValue(updatePhaseAtom);
  const [bannerVisible, setBannerVisible] = useAtom(updateBannerVisibleAtom);
  const [useCustomTitleBar] = useDesktopSetting('useCustomTitleBar');
  const status = !bannerVisible ? phaseToStatusView(phase) : null;

  if (!isDesktopUpdaterEnabled() || !hasCustomDesktopTitlebar(useCustomTitleBar)) return null;

  return (
    <SyncConnectionStatusTitlebar
      status={status}
      onClick={() => setBannerVisible(true)}
      icon={<DownloadSimple size={12} />}
    />
  );
}
