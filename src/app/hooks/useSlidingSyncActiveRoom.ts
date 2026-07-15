import { useEffect } from 'react';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { getSlidingSyncManager } from '$client/initMatrix';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';

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
