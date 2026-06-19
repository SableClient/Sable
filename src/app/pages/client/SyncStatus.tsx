import type { MatrixClient } from '$types/matrix-sdk';
import { SyncState } from '$types/matrix-sdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSetAtom } from 'jotai';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import * as Sentry from '@sentry/react';
import { getClientSyncDiagnostics, getSlidingSyncManager } from '$client/initMatrix';
import { useSyncState } from '$hooks/useSyncState';
import { titlebarStatusAtom, type TitlebarStatusView } from '$state/titlebarStatus';
import {
  getSyncConnectionStatusView,
  SyncConnectionStatusBanner,
} from '$components/SyncConnectionStatus';

type StateData = {
  current: SyncState | null;
  previous: SyncState | null | undefined;
};

type SyncStatusProps = {
  mx: MatrixClient;
};

const DEMO_STATUS_STEP_MS = 1500;
export const CONNECTING_STATUS_DISPLAY_MS = 1500;
const PERSISTENT_DEGRADED_CAPTURE_MS = 30_000;
export const RECONNECTING_STATUS_DISPLAY_MS = 10_000;
const DEMO_STATUS_SEQUENCE: readonly (TitlebarStatusView | null)[] = [
  { text: 'Connecting...', variant: 'Success' },
  null,
  { text: 'Connection Lost! Reconnecting...', variant: 'Warning' },
  null,
  { text: 'Connection Lost!', variant: 'Critical' },
  null,
];
const ERROR_STATUS_DISPLAY_MS = 1200;
const SLIDING_ERROR_STATUS_DISPLAY_MS = RECONNECTING_STATUS_DISPLAY_MS;
const SLIDING_DEGRADED_RECHECK_MS = 15_000;

const isSyncStatusDemoEnabled = (): boolean => {
  if (import.meta.env.VITE_DEMO_SYNC_STATUS === '1') return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('demoSyncStatus') === '1';
};

const isSlidingSyncRecentlyHealthy = (mx: MatrixClient): boolean => {
  const diagnostics = getClientSyncDiagnostics(mx);
  return diagnostics.transport === 'sliding' && diagnostics.sliding?.healthy === true;
};

export function SyncStatus({ mx }: SyncStatusProps) {
  const [stateData, setStateData] = useState<StateData>({
    current: null,
    previous: undefined,
  });
  const [displayStatus, setDisplayStatus] = useState<TitlebarStatusView | null>(null);
  const [demoIndex, setDemoIndex] = useState(0);
  const useDemoStatusLoop = isSyncStatusDemoEnabled();
  const setTitlebarStatus = useSetAtom(titlebarStatusAtom);
  const { current, previous } = stateData;
  const degradedSinceRef = useRef<number | undefined>(undefined);
  const degradedReportedRef = useRef(false);
  const [visibilityState, setVisibilityState] = useState<DocumentVisibilityState>(
    document.visibilityState
  );
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useSyncState(
    mx,
    useCallback((nextCurrent, nextPrevious) => {
      setStateData((s) => {
        if (s.current === nextCurrent && s.previous === nextPrevious) {
          return s;
        }
        return { current: nextCurrent, previous: nextPrevious };
      });

      if (nextCurrent === SyncState.Reconnecting || nextCurrent === SyncState.Error) {
        Sentry.addBreadcrumb({
          category: 'sync',
          message: `Sync state changed to ${nextCurrent}`,
          level: nextCurrent === SyncState.Error ? 'error' : 'warning',
          data: { previous: nextPrevious },
        });
        Sentry.metrics.count('sable.sync.degraded', 1, {
          attributes: { state: nextCurrent },
        });
      }
    }, [])
  );

  useEffect(() => {
    if (!useDemoStatusLoop) return undefined;
    const intervalId = window.setInterval(() => {
      setDemoIndex((index) => (index + 1) % DEMO_STATUS_SEQUENCE.length);
    }, DEMO_STATUS_STEP_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [useDemoStatusLoop]);

  useEffect(() => {
    const handleVisibilityChange = () => setVisibilityState(document.visibilityState);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const degraded = current === SyncState.Reconnecting || current === SyncState.Error;
    if (!degraded) {
      degradedSinceRef.current = undefined;
      degradedReportedRef.current = false;
      return undefined;
    }

    degradedSinceRef.current ??= Date.now();
    const degradedForMs = Date.now() - degradedSinceRef.current;
    const timeoutMs = Math.max(0, PERSISTENT_DEGRADED_CAPTURE_MS - degradedForMs);
    const timeoutId = window.setTimeout(() => {
      if (visibilityState !== 'visible' || !isOnline) return;
      const syncState = mx.getSyncState();
      const stillDegraded = syncState === SyncState.Reconnecting || syncState === SyncState.Error;
      if (!stillDegraded || degradedReportedRef.current) return;

      const diagnostics = getClientSyncDiagnostics(mx);
      if (diagnostics.transport === 'sliding' && diagnostics.sliding?.healthy === true) return;
      degradedReportedRef.current = true;
      Sentry.captureMessage('Sync remained degraded', {
        level: 'warning',
        tags: {
          sync_state: syncState ?? 'unknown',
          transport: diagnostics.transport,
        },
        extra: {
          diagnostics,
          degradedMs: Date.now() - (degradedSinceRef.current ?? Date.now()),
          visibilityState,
          online: isOnline,
        },
      });
    }, timeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [current, isOnline, mx, visibilityState]);

  const rawStatusView = useMemo(() => {
    if (useDemoStatusLoop) return DEMO_STATUS_SEQUENCE[demoIndex] ?? null;
    return getSyncConnectionStatusView(current, previous);
  }, [current, demoIndex, previous, useDemoStatusLoop]);

  const retrySync = useCallback(() => {
    const syncState = mx.getSyncState();
    const classicRetried = mx.retryImmediately();
    const slidingSyncManager = getSlidingSyncManager(mx);
    slidingSyncManager?.retryNow();

    Sentry.addBreadcrumb({
      category: 'sync',
      message: 'Manual sync retry requested',
      level: 'info',
      data: {
        syncState,
        classicRetried,
        slidingSync: !!slidingSyncManager,
      },
    });
    Sentry.metrics.count('sable.sync.manual_retry', 1, {
      attributes: {
        sync_state: syncState ?? 'unknown',
        classic_retried: String(classicRetried),
        sliding_sync: String(!!slidingSyncManager),
      },
    });
  }, [mx]);

  useEffect(() => {
    if (useDemoStatusLoop) {
      setDisplayStatus(rawStatusView);
      return undefined;
    }

    if (!rawStatusView) {
      setDisplayStatus(null);
      return undefined;
    }

    if (rawStatusView.variant !== 'Warning' && rawStatusView.variant !== 'Critical') {
      setDisplayStatus(rawStatusView);
      const timeoutId = window.setTimeout(() => {
        setDisplayStatus((currentStatus) =>
          currentStatus?.text === rawStatusView.text &&
          currentStatus.variant === rawStatusView.variant
            ? null
            : currentStatus
        );
      }, CONNECTING_STATUS_DISPLAY_MS);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    const isSlidingSync = getClientSyncDiagnostics(mx).transport === 'sliding';
    const degradedDisplayDelayMs =
      current === SyncState.Reconnecting
        ? RECONNECTING_STATUS_DISPLAY_MS
        : isSlidingSync
          ? SLIDING_ERROR_STATUS_DISPLAY_MS
          : ERROR_STATUS_DISPLAY_MS;
    let intervalId: number | undefined;
    const updateDegradedStatus = () => {
      const syncState = mx.getSyncState();
      const stillDegraded = syncState === SyncState.Reconnecting || syncState === SyncState.Error;
      if (!stillDegraded || (isSlidingSync && isSlidingSyncRecentlyHealthy(mx))) {
        setDisplayStatus(null);
        return;
      }
      setDisplayStatus(rawStatusView);
    };
    const timeoutId = window.setTimeout(() => {
      updateDegradedStatus();
      if (isSlidingSync) {
        intervalId = window.setInterval(updateDegradedStatus, SLIDING_DEGRADED_RECHECK_MS);
      }
    }, degradedDisplayDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [current, mx, rawStatusView, useDemoStatusLoop]);

  const useTitlebarSlot = isTauri() && osType() === 'windows';
  useEffect(() => {
    if (!useTitlebarSlot) return undefined;
    setTitlebarStatus(displayStatus);
    return () => {
      setTitlebarStatus(null);
    };
  }, [displayStatus, setTitlebarStatus, useTitlebarSlot]);

  if (useTitlebarSlot) return null;

  return <SyncConnectionStatusBanner status={displayStatus} onRetry={retrySync} />;
}
