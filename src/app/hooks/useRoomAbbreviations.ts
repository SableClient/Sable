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
