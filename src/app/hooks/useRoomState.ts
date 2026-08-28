import type { MatrixEvent, Room } from '$types/matrix-sdk';
import { Direction, RoomStateEvent } from '$types/matrix-sdk';
import { useCallback, useMemo, useState } from 'react';
import { useMatrixEvent } from '$hooks/useMatrixEvent';

export type StateKeyToEvents = Map<string, MatrixEvent>;
export type StateTypeToState = Map<string, StateKeyToEvents>;

export const useRoomState = (room: Room): StateTypeToState => {
  const getState = useCallback((): StateTypeToState => {
    const roomState = room.getLiveTimeline().getState(Direction.Forward);
    const state: StateTypeToState = new Map();

    if (!roomState) return state;

    roomState.events.forEach((stateKeyToEvents, eventType) => {
      const kToE: StateKeyToEvents = new Map();
      stateKeyToEvents.forEach((mEvent, stateKey) => kToE.set(stateKey, mEvent));

      state.set(eventType, kToE);
    });

    return state;
  }, [room]);

  const [state, setState] = useState(getState);

  const roomState = useMemo(() => room.getLiveTimeline().getState(Direction.Forward), [room]);
  const handler = useCallback(() => {
    setState(getState());
  }, [getState]);

  useMatrixEvent(roomState, RoomStateEvent.Events, handler);

  return state;
};
