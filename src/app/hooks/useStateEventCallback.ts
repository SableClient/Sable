import type { MatrixClient, MatrixEvent, RoomState } from '$types/matrix-sdk';
import { RoomStateEvent } from '$types/matrix-sdk';
import { useEffect } from 'react';

export type StateEventCallback = (
  event: MatrixEvent,
  state: RoomState,
  lastStateEvent: MatrixEvent | null
) => void;

export const useStateEventCallback = (mx: MatrixClient, onStateEvent: StateEventCallback) => {
  useEffect(() => {
    mx.on(RoomStateEvent.Events, onStateEvent);
    return () => {
      mx.removeListener(RoomStateEvent.Events, onStateEvent);
    };
  }, [mx, onStateEvent]);
};
