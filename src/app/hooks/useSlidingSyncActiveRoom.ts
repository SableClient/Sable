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

    // Wait for the room to be initialized from list sync before subscribing
    // with high timeline limit. This prevents timeline ordering issues where
    // the room might be receiving events from list expansion while we're also
    // trying to load a large timeline, causing events to be added out of order.
    const timeoutId = setTimeout(() => {
      const room = mx.getRoom(roomId);
      if (room) {
        // Room exists and has been initialized from list sync
        manager.subscribeToRoom(roomId);
      } else {
        // Room not in cache yet - subscribe anyway (will use default encrypted subscription)
        manager.subscribeToRoom(roomId);
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      manager.unsubscribeFromRoom(roomId);
    };
  }, [mx, roomId]);
};
