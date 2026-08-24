import { matchPath } from 'react-router';
import { isEventId, isRoomAlias, isRoomId } from '$utils/matrix';
import {
  DIRECT_ROOM_FORUM_PATH,
  DIRECT_ROOM_PATH,
  HOME_ROOM_FORUM_PATH,
  HOME_ROOM_PATH,
  SPACE_ROOM_FORUM_PATH,
  SPACE_ROOM_PATH,
} from './paths';

export type RoomRouteMatch = {
  roomIdOrAlias: string;
  eventId?: string;
};

const isForumRoute = (pathname: string): boolean =>
  [HOME_ROOM_FORUM_PATH, DIRECT_ROOM_FORUM_PATH, SPACE_ROOM_FORUM_PATH].some(
    (path) => matchPath({ path, end: false }, pathname) !== null
  );

export const matchRoomRoute = (pathname: string): RoomRouteMatch | undefined => {
  if (isForumRoute(pathname)) return undefined;

  const match =
    matchPath({ path: HOME_ROOM_PATH, end: false }, pathname) ??
    matchPath({ path: DIRECT_ROOM_PATH, end: false }, pathname) ??
    matchPath({ path: SPACE_ROOM_PATH, end: false }, pathname);
  if (!match) return undefined;

  const encodedId = match.params.roomIdOrAlias;
  if (!encodedId) return undefined;
  const roomIdOrAlias = decodeURIComponent(encodedId);
  if (!isRoomId(roomIdOrAlias) && !isRoomAlias(roomIdOrAlias)) return undefined;

  const encodedEvent = match.params.eventId;
  const eventId = encodedEvent ? decodeURIComponent(encodedEvent) : undefined;

  return {
    roomIdOrAlias,
    eventId: eventId && isEventId(eventId) ? eventId : undefined,
  };
};
