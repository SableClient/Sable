import { type MatrixClient, type MatrixEvent, type Room } from '$types/matrix-sdk';
import { useMemo } from 'react';
import { type IRoomCreateContent, StateEvent } from '$types/matrix/room';
import { creatorsSupported } from '$utils/matrix';
import { getStateEvent } from '$utils/room';
import { useStateEvent } from './useStateEvent';

export const getRoomCreators = (createEvent: MatrixEvent): Set<string> => {
  const createContent = createEvent.getContent<IRoomCreateContent>();

  const creators: Set<string> = new Set();

  if (!creatorsSupported(createContent.room_version)) return creators;

  if (createEvent.event.sender) {
    creators.add(createEvent.event.sender);
  }

  if ('additional_creators' in createContent && Array.isArray(createContent.additional_creators)) {
    createContent.additional_creators.forEach((creator) => {
      if (typeof creator === 'string') {
        creators.add(creator);
      }
    });
  }

  return creators;
};

export const useRoomCreators = (room: Room): Set<string> => {
  const createEvent = useStateEvent(room, StateEvent.RoomCreate);

  const creators = useMemo(
    () => (createEvent ? getRoomCreators(createEvent) : new Set<string>()),
    [createEvent]
  );

  return creators;
};

export const getRoomCreatorsForRoomId = (mx: MatrixClient, roomId: string): Set<string> => {
  const room = mx.getRoom(roomId);
  if (!room) return new Set();

  const createEvent = getStateEvent(room, StateEvent.RoomCreate);
  if (!createEvent) return new Set();

  return getRoomCreators(createEvent);
};
