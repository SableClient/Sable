import type { MatrixClient } from '$types/matrix-sdk';
import { SyncState } from '$types/matrix-sdk';
import { useCallback, useEffect, useState } from 'react';
import { Box, config, Line, Text } from 'folds';
import * as Sentry from '@sentry/react';
import { useSyncState } from '$hooks/useSyncState';
import { ContainerColor } from '$styles/ContainerColor.css';

type StateData = {
  current: SyncState | null;
  previous: SyncState | null | undefined;
};

type SyncStatusProps = {
  mx: MatrixClient;
};

// How long (ms) to wait in a degraded state before showing the banner.
// Fast reconnections (e.g. normal iOS bfcache restore) never trigger the UI.
const RECONNECTING_DELAY_MS = 2500;
// How long (ms) the "Connected!" recovery banner stays visible.
const RECOVERED_DISMISS_MS = 3000;

// Banner lifecycle: idle → pending → visible → recovered → idle
type BannerPhase = 'idle' | 'pending' | 'visible' | 'recovered';

export function SyncStatus({ mx }: SyncStatusProps) {
  const [stateData, setStateData] = useState<StateData>(() => ({
    current: mx.getSyncState(),
    previous: undefined,
  }));

  useSyncState(
    mx,
    useCallback((current, previous) => {
      setStateData((s) => {
        if (s.current === current && s.previous === previous) {
          return s;
        }
        return { current, previous };
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

  const [bannerPhase, setBannerPhase] = useState<BannerPhase>('idle');
  const syncCurrent = stateData.current;

  // Drive banner phase transitions from sync state.
  useEffect(() => {
    const isDegraded = syncCurrent === SyncState.Reconnecting || syncCurrent === SyncState.Error;
    const isHealthy =
      syncCurrent === SyncState.Prepared ||
      syncCurrent === SyncState.Syncing ||
      syncCurrent === SyncState.Catchup;

    if (isDegraded) {
      // Stay in 'visible' once the banner is showing; otherwise queue the delay.
      setBannerPhase((p) => (p === 'visible' ? 'visible' : 'pending'));
      return undefined;
    }

    if (isHealthy) {
      // Quick reconnect never showed banner → silent recovery. Slow reconnect → show "Connected!".
      setBannerPhase((p) => (p === 'visible' ? 'recovered' : 'idle'));
    } else {
      // Stopped, null, or other non-healthy transition — clear immediately.
      setBannerPhase('idle');
    }
    return undefined;
  }, [syncCurrent]);

  // After the delay in 'pending', promote to 'visible'.
  useEffect(() => {
    if (bannerPhase !== 'pending') return undefined;
    const timer = window.setTimeout(() => setBannerPhase('visible'), RECONNECTING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [bannerPhase]);

  // Auto-dismiss the 'recovered' (Connected!) banner.
  useEffect(() => {
    if (bannerPhase !== 'recovered') return undefined;
    const timer = window.setTimeout(() => setBannerPhase('idle'), RECOVERED_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [bannerPhase]);

  if (bannerPhase === 'recovered') {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Success' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">Connected!</Text>
        </Box>
        <Line variant="Success" size="300" />
      </Box>
    );
  }

  if (bannerPhase === 'visible' && syncCurrent === SyncState.Reconnecting) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Warning' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">Connection Lost! Reconnecting...</Text>
        </Box>
        <Line variant="Warning" size="300" />
      </Box>
    );
  }

  if (bannerPhase === 'visible' && syncCurrent === SyncState.Error) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Critical' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">Connection Lost!</Text>
        </Box>
        <Line variant="Critical" size="300" />
      </Box>
    );
  }

  return null;
}
