import { useEffect } from 'react';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { getSlidingSyncManager } from '$client/initMatrix';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { addRecentRoom } from '$utils/recentRooms';

/**
 * Subscribes the currently selected room to the sliding sync "active room"
 * custom subscription (higher timeline limit) for the duration the room is open.
 *
 * Also tracks room visits in localStorage for recency-driven UI affordances.
 * The subscription is removed when navigating away so sliding sync does not
 * become a broad background room hydrator.
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

    // Track room visit for prefetching optimization
    const userId = mx.getUserId();
    if (userId) {
      addRecentRoom(userId, roomId);
    }

    return () => manager.unsubscribeFromRoom(roomId);
  }, [mx, roomId]);
};
