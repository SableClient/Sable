import { useEffect, useState } from 'react';
import { checkForAppUpdates, hasPendingAppUpdate } from '$utils/appUpdates';

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

    const syncUpdateAvailable = () => {
      if (!('serviceWorker' in navigator)) return;
      void navigator.serviceWorker
        .getRegistration()
        .then((registration) => {
          if (!disposed) {
            setUpdateAvailable(hasPendingAppUpdate(registration));
          }
        })
        .catch(() => {
          if (!disposed) {
            setUpdateAvailable(false);
          }
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
            return;
          }
          syncUpdateAvailable();
        })
        .catch(() => {
          if (disposed) return;
          syncUpdateAvailable();
        })
        .finally(() => {
          updateCheckInFlight = false;
        });
    };

    // Check if an update is already waiting when the component mounts.
    // This handles the race where SW registration completes and dispatches
    // 'sable:sw-update' before React finishes mounting and adds the listener.
    // Critical for mobile where the app may start with a waiting SW.
    syncUpdateAvailable();
    requestAutomaticUpdateCheck();

    const handleUpdate = () => syncUpdateAvailable();
    const handleControllerChange = () => syncUpdateAvailable();
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
