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
    const handleUpdate = () => setUpdateAvailable(true);
    window.addEventListener('sable:sw-update', handleUpdate);
    return () => window.removeEventListener('sable:sw-update', handleUpdate);
  }, []);

  return updateAvailable;
}
