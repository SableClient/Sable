import type { Room, StateEvents } from '$types/matrix-sdk';
import { useCallback, useMemo } from 'react';

import { getStateEvent } from '$utils/room';
import { useStateEventCallback } from './useStateEventCallback';
import { useForceUpdate } from './useForceUpdate';

export const useStateEvent = (room: Room, eventType: keyof StateEvents, stateKey = '') => {
  const [updateCount, forceUpdate] = useForceUpdate();

  useStateEventCallback(
    room.client,
    useCallback(
      (event) => {
        if (
          event.getRoomId() === room.roomId &&
          event.getType() === (eventType as string) &&
          event.getStateKey() === stateKey
        ) {
          forceUpdate();
        }
      },
      [room, eventType, stateKey, forceUpdate]
    )
  );

  return useMemo(() => {
    void updateCount;
    return getStateEvent(room, eventType, stateKey);
  }, [room, eventType, stateKey, updateCount]);
};
