import { useMemo } from 'react';
import type { RoomPinnedEventsEventContent, Room } from '$types/matrix-sdk';

import { useStateEvent } from './useStateEvent';
import { EventType } from '$types/matrix-sdk';

export const useRoomPinnedEvents = (room: Room): string[] => {
  const pinEvent = useStateEvent(room, EventType.RoomPinnedEvents);
  const events = useMemo(() => {
    const content = pinEvent?.getContent<RoomPinnedEventsEventContent>();
    return content?.pinned ?? [];
  }, [pinEvent]);

  return events;
};
