import { useEffect, useState } from 'react';
import type { MatrixClient } from '$types/matrix-sdk';
import { ClientEvent } from '$types/matrix-sdk';
import { getSlidingSyncManager } from '$client/initMatrix';
import type { HydrationProgress } from '$client/slidingSync';

export const useSlidingSyncHydrating = (
  mx: MatrixClient
): { isHydrating: boolean; progress?: HydrationProgress } => {
  const [manager, setManager] = useState(() => getSlidingSyncManager(mx));
  const [state, setState] = useState<{ isHydrating: boolean; progress?: HydrationProgress }>(
    () => ({
      isHydrating: manager?.isSyncingRoomData() ?? false,
      progress: manager?.isSyncingRoomData() ? manager.getHydrationProgress() : undefined,
    })
  );

  useEffect(() => {
    if (manager) return undefined;

    const checkForManager = () => {
      const nextManager = getSlidingSyncManager(mx);
      if (nextManager) setManager(nextManager);
    };

    const retryId = globalThis.setTimeout(checkForManager, 0);
    mx.on(ClientEvent.Sync, checkForManager);
    return () => {
      globalThis.clearTimeout(retryId);
      mx.removeListener(ClientEvent.Sync, checkForManager);
    };
  }, [manager, mx]);

  useEffect(() => {
    if (!manager) {
      setState({ isHydrating: false });
      return undefined;
    }
    return manager.onHydrationStatusChange((isHydrating, progress) => {
      setState({ isHydrating, progress });
    });
  }, [manager]);

  return state;
};
