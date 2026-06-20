import { matchPath } from 'react-router-dom';
import {
  getDirectSearchPath,
  getHomeSearchPath,
  getSpaceSearchPath,
  withSearchParam,
} from '$pages/pathUtils';
import {
  CREATE_PATH,
  DIRECT_PATH,
  DIRECT_SEARCH_PATH,
  DIRECT_ROOM_PATH,
  EXPLORE_PATH,
  HOME_PATH,
  HOME_SEARCH_PATH,
  HOME_ROOM_PATH,
  INBOX_PATH,
  LOGIN_PATH,
  REGISTER_PATH,
  RESET_PASSWORD_PATH,
  SETTINGS_PATH,
  SPACE_LOBBY_PATH,
  SPACE_PATH,
  SPACE_ROOM_PATH,
  SPACE_SEARCH_PATH,
  type SearchPathSearchParams,
} from '$pages/paths';

type MessageSearchShortcutOptions = {
  pathname: string;
  currentSearch?: string;
  selectedSpaceId?: string;
  currentRoomId?: string;
};

const NON_SPACE_ROUTE_PREFIXES = [
  HOME_PATH,
  DIRECT_PATH,
  CREATE_PATH,
  EXPLORE_PATH,
  INBOX_PATH,
  SETTINGS_PATH.split(':')[0]!,
  LOGIN_PATH.split(':')[0]!,
  REGISTER_PATH.split(':')[0]!,
  RESET_PASSWORD_PATH.split(':')[0]!,
];

const matchesRoutePrefix = (pathname: string, prefix: string): boolean => {
  const normalizedPrefix = prefix.length > 1 && prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;

  return pathname === normalizedPrefix || pathname.startsWith(`${normalizedPrefix}/`);
};

const withRoomFilter = (path: string, currentRoomId?: string): string => {
  if (!currentRoomId) return path;

  const searchParams: SearchPathSearchParams = {
    rooms: currentRoomId,
  };

  return withSearchParam(path, searchParams);
};

export const getSelectedSpaceIdOrAliasFromPath = (pathname: string): string | undefined => {
  if (NON_SPACE_ROUTE_PREFIXES.some((prefix) => matchesRoutePrefix(pathname, prefix))) {
    return undefined;
  }

  const spaceMatch =
    matchPath(SPACE_ROOM_PATH, pathname) ??
    matchPath(SPACE_SEARCH_PATH, pathname) ??
    matchPath(SPACE_LOBBY_PATH, pathname) ??
    matchPath(SPACE_PATH, pathname);

  return spaceMatch?.params.spaceIdOrAlias
    ? decodeURIComponent(spaceMatch.params.spaceIdOrAlias)
    : undefined;
};

export const getMessageSearchShortcutPath = ({
  pathname,
  currentSearch,
  selectedSpaceId,
  currentRoomId,
}: MessageSearchShortcutOptions): string | null => {
  if (
    matchPath(HOME_SEARCH_PATH, pathname) ||
    matchPath(DIRECT_SEARCH_PATH, pathname) ||
    matchPath(SPACE_SEARCH_PATH, pathname)
  ) {
    return `${pathname}${currentSearch ?? ''}`;
  }

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
