import { useEffect } from 'react';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { getSlidingSyncManager } from '$client/initMatrix';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';

/**
 * Subscribes the currently selected room to the sliding sync "active room"
 * custom subscription (higher timeline limit) for the duration the room is open.
 *
 * Safe to call unconditionally — it is a no-op when classic sync is in use
 * (i.e. when there is no SlidingSyncManager for the client).
 */
export const useSlidingSyncActiveRoom = (): void => {
  const mx = useMatrixClient();
  const roomId = useSelectedRoom();

  useEffect(() => {
    if (!roomId) return undefined;
    const manager = getSlidingSyncManager(mx);
    if (!manager) return undefined;

    manager.subscribeToRoom(roomId);
    return () => {
      manager.unsubscribeFromRoom(roomId);
    };
  }, [mx, roomId]);
};
