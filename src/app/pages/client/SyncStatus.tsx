import type { MatrixClient } from '$types/matrix-sdk';
import { SyncState } from '$types/matrix-sdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSetAtom } from 'jotai';
import * as Sentry from '@sentry/react';
import { useSyncState } from '$hooks/useSyncState';
import { type TitlebarStatusView, titlebarStatusAtom } from '$state/titlebarStatus';
import { SyncConnectionStatusBanner } from '$components/SyncConnectionStatus';
import { hasCustomDesktopTitlebar } from '$utils/tauriTitlebar';

const DISCONNECTED_GRACE_MS = 2000;

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

type SyncStatusProps = {
  mx: MatrixClient;
};
export function SyncStatus({ mx }: SyncStatusProps) {
  const setTitlebarStatus = useSetAtom(titlebarStatusAtom);
  const hasConnectedRef = useRef(false);
  const [stateData, setStateData] = useState<StateData>({
    current: null,
    previous: undefined,
    showConnecting: false,
  });
  const [showDisconnected, setShowDisconnected] = useState(false);

  const isDisconnected =
    stateData.current === SyncState.Reconnecting || stateData.current === SyncState.Error;

  useEffect(() => {
    if (!isDisconnected) {
      setShowDisconnected(false);
      return undefined;
    }
    const timeoutId = setTimeout(() => setShowDisconnected(true), DISCONNECTED_GRACE_MS);
    return () => clearTimeout(timeoutId);
  }, [isDisconnected]);

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
    if (stateData.showConnecting) return { text: 'Connecting...', variant: 'Success' };
    if (showDisconnected && stateData.current === SyncState.Reconnecting) {
      return { text: 'Connection Lost! Reconnecting...', variant: 'Warning' };
    }
    if (showDisconnected && stateData.current === SyncState.Error) {
      return { text: 'Connection Lost!', variant: 'Critical' };
    }
    return null;
  }, [stateData, showDisconnected]);

  // Publish to the atom that feeds the custom desktop titlebar's status pill.
  useEffect(() => {
    setTitlebarStatus(view);
  }, [setTitlebarStatus, view]);
  useEffect(() => () => setTitlebarStatus(null), [setTitlebarStatus]);

  // Where a custom titlebar renders the pill, skip the inline banner.
  if (hasCustomDesktopTitlebar()) return null;

  return <SyncConnectionStatusBanner status={view} />;
}
