import { useCallback, useEffect, useRef } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { TauriEvent, listen } from '@tauri-apps/api/event';
import { isTauri } from '@tauri-apps/api/core';
import type { MatrixClient } from '$types/matrix-sdk';
import type { NudgeReason } from '$client/reconnect';
import { abortClassicSyncPoll, nudgeReconnect } from '$client/reconnect';
import { useSyncState } from './useSyncState';

// Sync fires on every poll response: at most 45s apart on sliding, 30s classic.
const SYNC_STALL_MS = 75_000;
const STALL_CHECK_INTERVAL_MS = 10_000;
// Visibility alone is not evidence the network changed.
const VISIBLE_STALE_MS = 30_000;
// After a foreground nudge, verify a Sync arrived within this window; retry once otherwise.
const VERIFY_AFTER_NUDGE_MS = 3_000;
// Dead stalled nudges before aborting; spares a warm resume whose poll survived.
const WEDGED_NUDGE_ATTEMPTS = 3;

export const useNetworkRecovery = (mx: MatrixClient | undefined): void => {
  const lastSyncAtRef = useRef(Date.now());
  const verifyTimerRef = useRef<number | undefined>(undefined);
  const deadNudgesRef = useRef(0);

  const cancelVerify = useCallback(() => {
    if (verifyTimerRef.current === undefined) return;
    window.clearTimeout(verifyTimerRef.current);
    verifyTimerRef.current = undefined;
  }, []);

  const nudge = useCallback(
    (reason: NudgeReason, opts?: { force?: boolean }): boolean => {
      if (!mx) return false;
      onlineManager.setOnline(true);
      return nudgeReconnect(mx, reason, opts);
    },
    [mx]
  );

  useSyncState(
    mx,
    useCallback(() => {
      lastSyncAtRef.current = Date.now();
      deadNudgesRef.current = 0;
      cancelVerify();
    }, [cancelVerify])
  );

  // Foreground nudges (resume / visible-stale / online) get one sync verification:
  // if no Sync arrives within VERIFY_AFTER_NUDGE_MS, retry once past the throttle.
  const nudgeForeground = useCallback(
    (reason: NudgeReason, opts?: { force?: boolean }): void => {
      cancelVerify();
      if (!mx) return;
      const syncAtNudge = lastSyncAtRef.current;
      if (!nudge(reason, opts)) return;
      verifyTimerRef.current = window.setTimeout(() => {
        verifyTimerRef.current = undefined;
        if (lastSyncAtRef.current === syncAtNudge) {
          onlineManager.setOnline(true);
          nudgeReconnect(mx, 'retry', { force: true });
        }
      }, VERIFY_AFTER_NUDGE_MS);
    },
    [mx, nudge, cancelVerify]
  );

  useEffect(() => {
    if (!mx) return undefined;

    const onOnline = () => nudgeForeground('online');
    const onVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastSyncAtRef.current >= VISIBLE_STALE_MS
      ) {
        nudgeForeground('visible');
      }
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);

    const stallCheck = window.setInterval(() => {
      if (Date.now() - lastSyncAtRef.current < SYNC_STALL_MS) {
        deadNudgesRef.current = 0;
        return;
      }
      if (nudge('stalled')) {
        lastSyncAtRef.current = Date.now();
        deadNudgesRef.current = 0;
        return;
      }
      // Throttled counts too: no request went out, and the 10s tick clears the 3s throttle.
      deadNudgesRef.current += 1;
      if (deadNudgesRef.current < WEDGED_NUDGE_ATTEMPTS) return;
      deadNudgesRef.current = 0;
      // Give the keepalive poke its own stall window before escalating again.
      lastSyncAtRef.current = Date.now();
      abortClassicSyncPoll(mx);
    }, STALL_CHECK_INTERVAL_MS);

    const unlisten = isTauri()
      ? listen(TauriEvent.WINDOW_RESUMED, () => nudgeForeground('resumed', { force: true }))
      : undefined;

    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(stallCheck);
      cancelVerify();
      unlisten?.then((off) => off());
    };
  }, [mx, nudge, nudgeForeground, cancelVerify]);
};
