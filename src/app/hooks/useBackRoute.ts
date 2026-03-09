import { useCallback } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import {
  getDirectPath,
  getExplorePath,
  getHomePath,
  getInboxPath,
  getSpacePath,
} from '$pages/pathUtils';
import {
  DIRECT_PATH,
  EXPLORE_PATH,
  HOME_PATH,
  INBOX_PATH,
  SPACE_PATH,
  HOME_ROOM_PATH,
  DIRECT_ROOM_PATH,
  SPACE_ROOM_PATH,
} from '$pages/paths';
import { useSetLastFocusedRoom, LastFocusedContext } from '$hooks/useLastFocusedRooms';
import { createLogger } from '$utils/debug';

const log = createLogger('useBackRoute');

export const BACK_ROOM_PARAM = 'room';

export function useBackRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const setLastFocusedRoom = useSetLastFocusedRoom();

  return useCallback(() => {
    log.log('goBack called — pathname:', location.pathname);

    const roomPaths = [HOME_ROOM_PATH, DIRECT_ROOM_PATH, SPACE_ROOM_PATH];
    log.log('checking room paths:', roomPaths);

    const roomMatches = roomPaths.map((path) => ({
      path,
      match: matchPath({ path, end: false }, location.pathname),
    }));
    log.log('room path matches:', roomMatches);

    const roomMatch = roomMatches.find((m) => m.match !== null)?.match ?? null;
    const currentRoomIdOrAlias = roomMatch?.params.roomIdOrAlias;
    const decodedRoomId = currentRoomIdOrAlias
      ? decodeURIComponent(currentRoomIdOrAlias)
      : undefined;

    log.log('currentRoomIdOrAlias:', currentRoomIdOrAlias, '→ decodedRoomId:', decodedRoomId);

    // Determine context and store last focused room
    let context: LastFocusedContext | undefined;
    const spaceMatch = matchPath(
      { path: SPACE_PATH, caseSensitive: true, end: false },
      location.pathname
    );
    const decodedSpaceIdOrAlias =
      spaceMatch?.params.spaceIdOrAlias && decodeURIComponent(spaceMatch.params.spaceIdOrAlias);

    if (matchPath({ path: HOME_PATH, caseSensitive: true, end: false }, location.pathname)) {
      context = 'home';
    } else if (
      matchPath({ path: DIRECT_PATH, caseSensitive: true, end: false }, location.pathname)
    ) {
      context = 'direct';
    } else if (decodedSpaceIdOrAlias) {
      context = { spaceId: decodedSpaceIdOrAlias };
    }

    if (decodedRoomId && context) {
      setLastFocusedRoom(context, decodedRoomId);
    }

    const roomSuffix = decodedRoomId
      ? `?${BACK_ROOM_PARAM}=${encodeURIComponent(decodedRoomId)}`
      : '';
    log.log('roomSuffix:', roomSuffix || '(none — room not found in URL)');

    if (matchPath({ path: HOME_PATH, caseSensitive: true, end: false }, location.pathname)) {
      const target = `${getHomePath()}${roomSuffix}`;
      log.log('matched HOME_PATH → navigating to:', target);
      navigate(target);
      return;
    }
    if (matchPath({ path: DIRECT_PATH, caseSensitive: true, end: false }, location.pathname)) {
      const target = `${getDirectPath()}${roomSuffix}`;
      log.log('matched DIRECT_PATH → navigating to:', target);
      navigate(target);
      return;
    }
    if (decodedSpaceIdOrAlias) {
      const target = `${getSpacePath(decodedSpaceIdOrAlias)}${roomSuffix}`;
      log.log('matched SPACE_PATH → navigating to:', target);
      navigate(target);
      return;
    }
    if (matchPath({ path: EXPLORE_PATH, caseSensitive: true, end: false }, location.pathname)) {
      log.log('matched EXPLORE_PATH');
      navigate(getExplorePath());
      return;
    }
    if (matchPath({ path: INBOX_PATH, caseSensitive: true, end: false }, location.pathname)) {
      log.log('matched INBOX_PATH');
      navigate(getInboxPath());
      return;
    }
    log.warn('no path matched! pathname was:', location.pathname);
  }, [navigate, location, setLastFocusedRoom]);
}
