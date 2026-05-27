import { useEffect, useState } from 'react';

/**
 * Returns true once the service worker signals that a new version has been
 * installed and is waiting to take over.  The caller should prompt the user
 * to reload rather than doing so silently, since on mobile an unexpected full-
 * page reload is very disorienting.
 */
export function useSwUpdateAvailable(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // Check if an update is already waiting when the component mounts.
    // This handles the race where SW registration completes and dispatches
    // 'sable:sw-update' before React finishes mounting and adds the listener.
    // Critical for mobile where the app may start with a waiting SW.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration?.waiting && navigator.serviceWorker.controller) {
          setUpdateAvailable(true);
        }
      });
    }

    const handleUpdate = () => setUpdateAvailable(true);
    window.addEventListener('sable:sw-update', handleUpdate);
    return () => window.removeEventListener('sable:sw-update', handleUpdate);
  }, []);

  return updateAvailable;
}
