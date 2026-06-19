import { matchPath } from 'react-router-dom';
import {
  getDirectSearchPath,
  getHomeSearchPath,
  getSpaceSearchPath,
  withSearchParam,
} from '$pages/pathUtils';
import {
  DIRECT_PATH,
  DIRECT_ROOM_PATH,
  HOME_PATH,
  HOME_ROOM_PATH,
  SPACE_LOBBY_PATH,
  SPACE_PATH,
  SPACE_ROOM_PATH,
  SPACE_SEARCH_PATH,
  type SearchPathSearchParams,
} from '$pages/paths';

type MessageSearchShortcutOptions = {
  pathname: string;
  selectedSpaceId?: string;
  currentRoomId?: string;
};

const withRoomFilter = (path: string, currentRoomId?: string): string => {
  if (!currentRoomId) return path;

  const searchParams: SearchPathSearchParams = {
    rooms: currentRoomId,
  };

  return withSearchParam(path, searchParams);
};

export const getMessageSearchShortcutPath = ({
  pathname,
  selectedSpaceId,
  currentRoomId,
}: MessageSearchShortcutOptions): string | null => {
  if (matchPath(HOME_ROOM_PATH, pathname)) {
    return withRoomFilter(getHomeSearchPath(), currentRoomId);
  }

  if (matchPath(DIRECT_ROOM_PATH, pathname)) {
    return withRoomFilter(getDirectSearchPath(), currentRoomId);
  }

  if (selectedSpaceId && matchPath(SPACE_ROOM_PATH, pathname)) {
    return withRoomFilter(getSpaceSearchPath(selectedSpaceId), currentRoomId);
  }

  if (pathname.startsWith(HOME_PATH)) {
    return getHomeSearchPath();
  }

  if (pathname.startsWith(DIRECT_PATH)) {
    return getDirectSearchPath();
  }

  if (
    selectedSpaceId &&
    (matchPath(SPACE_PATH, pathname) ||
      matchPath(SPACE_LOBBY_PATH, pathname) ||
      matchPath(SPACE_SEARCH_PATH, pathname) ||
      matchPath(SPACE_ROOM_PATH, pathname))
  ) {
    return getSpaceSearchPath(selectedSpaceId);
  }

  return null;
};
