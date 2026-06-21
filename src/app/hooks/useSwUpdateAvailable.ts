import { useEffect, useState } from 'react';
import { hasPendingAppUpdate } from '$utils/appUpdates';

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

    // Check if an update is already waiting when the component mounts.
    // This handles the race where SW registration completes and dispatches
    // 'sable:sw-update' before React finishes mounting and adds the listener.
    // Critical for mobile where the app may start with a waiting SW.
    syncUpdateAvailable();

    const handleUpdate = () => syncUpdateAvailable();
    const handleControllerChange = () => syncUpdateAvailable();
    window.addEventListener('sable:sw-update', handleUpdate);
    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);
    return () => {
      disposed = true;
      window.removeEventListener('sable:sw-update', handleUpdate);
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  return updateAvailable;
}
