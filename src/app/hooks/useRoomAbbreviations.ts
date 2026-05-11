import { createContext, useContext, useCallback, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from '$types/matrix-sdk';

import type { RoomAbbreviationsContent } from '$utils/abbreviations';
import { buildAbbreviationsMap } from '$utils/abbreviations';
import { getAllParents, getStateEvent } from '$utils/room';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { useMatrixClient } from './useMatrixClient';
import { useStateEvent } from './useStateEvent';
import { useStateEventCallback } from './useStateEventCallback';
import { useForceUpdate } from './useForceUpdate';
import { CustomStateEvent } from '$types/matrix/room';

const EMPTY_MAP: Map<string, string> = new Map();

export const RoomAbbreviationsContext = createContext(EMPTY_MAP);

export const useRoomAbbreviationsContext = () => useContext(RoomAbbreviationsContext);

/** Read the room's abbreviations state event and return a term→definition map. */
export const useRoomAbbreviations = (room: Room): Map<string, string> => {
  const stateEvent = useStateEvent(room, CustomStateEvent.RoomAbbreviations);
  if (!stateEvent) return EMPTY_MAP;
  const content = stateEvent.getContent<RoomAbbreviationsContent>();
  if (!Array.isArray(content?.entries) || content.entries.length === 0) return EMPTY_MAP;
  return buildAbbreviationsMap(content.entries);
};

/**
 * Return a merged map of abbreviations from ALL ancestor spaces and the room.
 * Nearest ancestor entries override farther ancestor entries; room entries override everything.
 * Subscribes to abbreviation state changes across the full space hierarchy.
 */
export const useMergedAbbreviations = (room: Room): Map<string, string> => {
  const mx = useMatrixClient();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const [updateCount, forceUpdate] = useForceUpdate();

  useStateEventCallback(
    mx,
    useCallback(
      (event) => {
        if (event.getType() !== (CustomStateEvent.RoomAbbreviations as string)) return;
        const eventRoomId = event.getRoomId();
        if (!eventRoomId) return;
        if (
          eventRoomId === room.roomId ||
          getAllParents(roomToParents, room.roomId).has(eventRoomId)
        ) {
          forceUpdate();
        }
      },
      [room.roomId, roomToParents, forceUpdate]
    )
  );

  return useMemo(() => {
    // `updateCount` is a cache-busting key for state-event driven recomputation.
    void updateCount;
    const allParentIds = Array.from(getAllParents(roomToParents, room.roomId));
    const ancestorEntries = allParentIds.flatMap((parentId) => {
      const parentRoom = mx.getRoom(parentId);
      if (!parentRoom) return [];
      const content = getStateEvent(
        parentRoom,
        CustomStateEvent.RoomAbbreviations
      )?.getContent<RoomAbbreviationsContent>();
      return Array.isArray(content?.entries) ? content.entries : [];
    });

    const roomContent = getStateEvent(
      room,
      CustomStateEvent.RoomAbbreviations
    )?.getContent<RoomAbbreviationsContent>();
    const roomEntries = Array.isArray(roomContent?.entries) ? roomContent.entries : [];

    if (ancestorEntries.length === 0 && roomEntries.length === 0) return EMPTY_MAP;
    // Ancestor entries first; room entries appended so they override duplicates.
    return buildAbbreviationsMap([...ancestorEntries, ...roomEntries]);
  }, [mx, roomToParents, room, updateCount]);
};
