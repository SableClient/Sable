import { useEffect, useState } from 'react';
import { checkForAppUpdates, hasPendingScopedAppUpdate } from '$utils/appUpdates';

const AUTO_UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Returns true once the service worker signals that a new version has been
 * installed and is waiting to take over.  The caller should prompt the user
 * to reload rather than doing so silently, since on mobile an unexpected full-
 * page reload is very disorienting.
 */
export function useSwUpdateAvailable(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let disposed = false;
    let updateCheckInFlight = false;
    // Set to true once a scoped SW update is positively confirmed (either by
    // hasPendingScopedAppUpdate after a checkForAppUpdates update-available result,
    // or by a post-mount sable:sw-update / controllerchange sync). When true,
    // syncUpdateAvailable will not reset the banner on a transient false-negative
    // (e.g. during a brief SW restart on Safari). Only controllerchange clears it.
    // Hosted-shell-only updates never set this flag so the banner can still be
    // cleared by a later poll (e.g. after a rollback).
    let swUpdateConfirmed = false;

    // latchable: true for any call that is allowed to promote swUpdateConfirmed.
    // The initial mount sync is NOT latchable — it may catch a stale broader-scope
    // registration (false positive) before checkForAppUpdates has had a chance to
    // confirm the real scoped state.
    const syncUpdateAvailable = (latchable: boolean) => {
      if (!('serviceWorker' in navigator)) return;
      void hasPendingScopedAppUpdate()
        .then((pendingUpdate) => {
          if (disposed) return;
          if (pendingUpdate) {
            if (latchable) swUpdateConfirmed = true;
            setUpdateAvailable(true);
          } else if (!swUpdateConfirmed) {
            setUpdateAvailable(false);
          }
        })
        .catch(() => {
          // Don't reset to false on error — a pending update may still be waiting.
        });
    };

    const requestAutomaticUpdateCheck = () => {
      if (disposed) return;
      if (document.visibilityState === 'hidden' || updateCheckInFlight) return;

      updateCheckInFlight = true;
      void checkForAppUpdates()
        .then((result) => {
          if (disposed) return;
          if (result.kind === 'update-available') {
            setUpdateAvailable(true);
            // Confirm whether a scoped SW is actually waiting. If yes, set the
            // latch so transient false-negatives from future polls won't hide the
            // banner. If no (hosted-shell or secondary-scope update), skip the
            // latch so a later up-to-date poll can still clear the banner.
            void hasPendingScopedAppUpdate().then((isSWBacked) => {
              if (!disposed && isSWBacked) swUpdateConfirmed = true;
            });
            return;
          }
          syncUpdateAvailable(/* latchable */ true);
        })
        .catch(() => {
          if (disposed) return;
          syncUpdateAvailable(/* latchable */ true);
        })
        .finally(() => {
          updateCheckInFlight = false;
        });
    };

    // Check if an update is already waiting when the component mounts.
    // This handles the race where SW registration completes and dispatches
    // 'sable:sw-update' before React finishes mounting and adds the listener.
    // Critical for mobile where the app may start with a waiting SW.
    // Not latchable: the first poll may see a stale broader-scope registration.
    syncUpdateAvailable(/* latchable */ false);
    requestAutomaticUpdateCheck();

    const handleUpdate = () => syncUpdateAvailable(/* latchable */ true);
    const handleControllerChange = () => {
      // The controller changed — the waiting SW took over (or was superseded).
      // Clear the confirmed flag so syncUpdateAvailable can reset the banner if
      // the new controller has no pending update.
      swUpdateConfirmed = false;
      syncUpdateAvailable(/* latchable */ true);
    };
    const handleVisibilityChange = () => {
      if (disposed) return;
      if (document.visibilityState === 'visible') {
        requestAutomaticUpdateCheck();
      }
    };
    const handleWindowFocus = () => {
      if (disposed) return;
      requestAutomaticUpdateCheck();
    };
    const intervalId = window.setInterval(
      requestAutomaticUpdateCheck,
      AUTO_UPDATE_CHECK_INTERVAL_MS
    );

    window.addEventListener('sable:sw-update', handleUpdate);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener('sable:sw-update', handleUpdate);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  return updateAvailable;
}
