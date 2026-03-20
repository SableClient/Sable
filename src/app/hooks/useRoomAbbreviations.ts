import { createContext, useContext } from 'react';
import { Room } from '$types/matrix-sdk';
import { StateEvent } from '$types/matrix/room';
import { buildAbbreviationsMap, RoomAbbreviationsContent } from '$utils/abbreviations';
import { useStateEvent } from './useStateEvent';

const EMPTY_MAP: Map<string, string> = new Map();

export const RoomAbbreviationsContext = createContext<Map<string, string>>(EMPTY_MAP);

export const useRoomAbbreviationsContext = () => useContext(RoomAbbreviationsContext);

/** Read the room's abbreviations state event and return a term→definition map. */
export const useRoomAbbreviations = (room: Room): Map<string, string> => {
  const stateEvent = useStateEvent(room, StateEvent.RoomAbbreviations);
  if (!stateEvent) return EMPTY_MAP;
  const content = stateEvent.getContent<RoomAbbreviationsContent>();
  if (!Array.isArray(content?.entries) || content.entries.length === 0) return EMPTY_MAP;
  return buildAbbreviationsMap(content.entries);
};

/**
 * Return a merged map of abbreviations from the parent space (if any) and the room.
 * Room-level entries override space-level entries for the same term (case-insensitive).
 * Pass `space` as the parent space Room, or null if there is none.
 * Both hooks are always called unconditionally to satisfy the Rules of Hooks.
 */
export const useMergedAbbreviations = (room: Room, space: Room | null): Map<string, string> => {
  // Always call with a valid Room — use `room` as a harmless fallback when space is null.
  const spaceStateEvent = useStateEvent(space ?? room, StateEvent.RoomAbbreviations);
  const roomStateEvent = useStateEvent(room, StateEvent.RoomAbbreviations);

  const spaceContent = space ? spaceStateEvent?.getContent<RoomAbbreviationsContent>() : undefined;
  const roomContent = roomStateEvent?.getContent<RoomAbbreviationsContent>();

  const spaceEntries = Array.isArray(spaceContent?.entries) ? spaceContent.entries : [];
  const roomEntries = Array.isArray(roomContent?.entries) ? roomContent.entries : [];

  if (spaceEntries.length === 0 && roomEntries.length === 0) return EMPTY_MAP;

  // Space entries first; room entries are appended so they override duplicates.
  return buildAbbreviationsMap([...spaceEntries, ...roomEntries]);
};
