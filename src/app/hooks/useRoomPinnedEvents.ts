import { useMemo } from 'react';
import type { RoomPinnedEventsEventContent, Room } from '$types/matrix-sdk';
import { StateEvent } from '$types/matrix/room';
import { useStateEvent } from './useStateEvent';

export const useRoomPinnedEvents = (room: Room): string[] => {
  const pinEvent = useStateEvent(room, StateEvent.RoomPinnedEvents);
  const events = useMemo(() => {
    const content = pinEvent?.getContent<RoomPinnedEventsEventContent>();
    return content?.pinned ?? [];
  }, [pinEvent]);

  return events;
};
