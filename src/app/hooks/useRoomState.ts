import type { MatrixEvent, Room, RoomStateEventHandlerMap } from '$types/matrix-sdk';
import { Direction, RoomStateEvent, EventType } from '$types/matrix-sdk';
import { useCallback, useEffect, useState } from 'react';

export type StateKeyToEvents = Map<string, MatrixEvent>;
export type StateTypeToState = Map<string, StateKeyToEvents>;

export const useRoomState = (room: Room): StateTypeToState => {
  const getState = useCallback((): StateTypeToState => {
    const roomState = room.getLiveTimeline().getState(Direction.Forward);
    const state: StateTypeToState = new Map();

    if (!roomState) return state;

    roomState.events.forEach((stateKeyToEvents, eventType) => {
      if (eventType === (EventType.RoomMember as string)) {
        // Ignore room members from state on purpose;
        return;
      }
      const kToE: StateKeyToEvents = new Map();
      stateKeyToEvents.forEach((mEvent, stateKey) => kToE.set(stateKey, mEvent));

      state.set(eventType, kToE);
    });

    return state;
  }, [room]);

  const [state, setState] = useState(getState);

  useEffect(() => {
    const roomState = room.getLiveTimeline().getState(Direction.Forward);
    const handler: RoomStateEventHandlerMap[RoomStateEvent.Events] = () => {
      setState(getState());
    };

    roomState?.on(RoomStateEvent.Events, handler);
    return () => {
      roomState?.removeListener(RoomStateEvent.Events, handler);
    };
  }, [room, getState]);

  return state;
};
