import type { Room } from '$types/matrix-sdk';
import { useCallback, useMemo } from 'react';
import type { StateEvent } from '$types/matrix/room';
import { getStateEvent } from '$utils/room';
import { useStateEventCallback } from './useStateEventCallback';
import { useForceUpdate } from './useForceUpdate';

export const useStateEvent = (room: Room, eventType: StateEvent, stateKey = '') => {
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

  return useMemo(
    () => getStateEvent(room, eventType, stateKey),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [room, eventType, stateKey, updateCount]
  );
};
