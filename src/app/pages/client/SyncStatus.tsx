import type { MatrixClient } from '$types/matrix-sdk';
import { SyncState } from '$types/matrix-sdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSetAtom } from 'jotai';
import * as Sentry from '@sentry/react';
import { useSyncState } from '$hooks/useSyncState';
import { useSlidingSyncHydrating } from '$hooks/useSlidingSyncHydrating';
import { type TitlebarStatusView, titlebarStatusAtom } from '$state/titlebarStatus';
import { SyncConnectionStatusBanner } from '$components/SyncConnectionStatus';
import { useDesktopSetting } from '$state/hooks/desktopSettings';
import { hasCustomDesktopTitlebar } from '$utils/tauriTitlebar';

const DISCONNECTED_SHOW_DELAY_MS = 2000;
const DISCONNECTED_HIDE_DELAY_MS = 3000;

type StateData = {
  current: SyncState | null;
  previous: SyncState | null | undefined;
  showConnecting: boolean;
};

export const shouldShowConnecting = (
  hasConnected: boolean,
  current: SyncState | null,
  previous: SyncState | null | undefined
): boolean =>
  hasConnected &&
  (current === SyncState.Prepared ||
    current === SyncState.Syncing ||
    current === SyncState.Catchup) &&
  previous !== SyncState.Syncing;

export const shouldShowInlineSyncStatus = (hasCustomTitleBar: boolean): boolean =>
  !hasCustomTitleBar;

export const useStickyDisconnected = (syncCurrent: SyncState | null): SyncState | null => {
  const degraded =
    syncCurrent === SyncState.Reconnecting || syncCurrent === SyncState.Error ? syncCurrent : null;
  const showStartedAtRef = useRef<number | null>(null);
  const [stickyDisconnected, setStickyDisconnected] = useState<SyncState | null>(null);

  useEffect(() => {
    if (degraded) {
      if (stickyDisconnected) {
        showStartedAtRef.current = null;
        if (stickyDisconnected !== degraded) setStickyDisconnected(degraded);
        return undefined;
      }

      const startedAt = showStartedAtRef.current ?? Date.now();
      showStartedAtRef.current = startedAt;
      const remaining = Math.max(0, DISCONNECTED_SHOW_DELAY_MS - (Date.now() - startedAt));
      const id = setTimeout(() => {
        showStartedAtRef.current = null;
        setStickyDisconnected(degraded);
      }, remaining);
      return () => clearTimeout(id);
    }

    showStartedAtRef.current = null;
    if (!stickyDisconnected) return undefined;
    const id = setTimeout(() => setStickyDisconnected(null), DISCONNECTED_HIDE_DELAY_MS);
    return () => clearTimeout(id);
  }, [degraded, stickyDisconnected]);

  return stickyDisconnected;
};

type SyncStatusProps = {
  mx: MatrixClient;
};
export function SyncStatus({ mx }: SyncStatusProps) {
  const setTitlebarStatus = useSetAtom(titlebarStatusAtom);
  const [useCustomTitleBar] = useDesktopSetting('useCustomTitleBar');
  const hasConnectedRef = useRef(false);
  const [stateData, setStateData] = useState<StateData>({
    current: null,
    previous: undefined,
    showConnecting: false,
  });
  const stickyDisconnected = useStickyDisconnected(stateData.current);
  const { isHydrating, progress } = useSlidingSyncHydrating(mx);

  useSyncState(
    mx,
    useCallback((current, previous) => {
      const showConnecting = shouldShowConnecting(hasConnectedRef.current, current, previous);
      if (current === SyncState.Syncing) hasConnectedRef.current = true;

      setStateData((s) => {
        if (
          s.current === current &&
          s.previous === previous &&
          s.showConnecting === showConnecting
        ) {
          return s;
        }
        return { current, previous, showConnecting };
      });

      if (current === SyncState.Reconnecting || current === SyncState.Error) {
        Sentry.addBreadcrumb({
          category: 'sync',
          message: `Sync state changed to ${current}`,
          level: current === SyncState.Error ? 'error' : 'warning',
          data: { previous },
        });
        Sentry.metrics.count('sable.sync.degraded', 1, {
          attributes: { state: current },
        });
      }
    }, [])
  );

  const view = useMemo<TitlebarStatusView | null>(() => {
    if (stickyDisconnected === SyncState.Error) {
      return { text: 'Connection Lost!', variant: 'Critical' };
    }
    if (stickyDisconnected === SyncState.Reconnecting) {
      return { text: 'Connection Lost! Reconnecting...', variant: 'Warning' };
    }
    if (!stickyDisconnected && stateData.showConnecting)
      return { text: 'Connecting...', variant: 'Success' };
    if (
      isHydrating &&
      (stateData.current === SyncState.Syncing ||
        stateData.current === SyncState.Prepared ||
        stateData.current === SyncState.Catchup)
    ) {
      let percentage: number | undefined = undefined;
      if (progress && progress.totalRooms > 0) {
        percentage = Math.min(100, Math.floor((progress.loadedRooms / progress.totalRooms) * 100));
      }
      return {
        text: 'Syncing room data...',
        variant: 'Success',
        progress: percentage,
      };
    }
    return null;
  }, [stateData, stickyDisconnected, isHydrating, progress]);

  // Publish to the atom that feeds the custom desktop titlebar's status pill.
  useEffect(() => {
    setTitlebarStatus(view);
    return () => setTitlebarStatus(null);
  }, [setTitlebarStatus, view]);

  // Where a custom titlebar renders the pill, skip the inline banner.
  if (!shouldShowInlineSyncStatus(hasCustomDesktopTitlebar(useCustomTitleBar))) return null;

  return <SyncConnectionStatusBanner status={view} />;
}
