import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { matchPath, useLocation, useNavigate } from 'react-router';
import { getHomePath, resolveSection } from '$pages/pathUtils';
import {
  DIRECT_ROOM_FORUM_PATH,
  DIRECT_ROOM_PATH,
  HOME_ROOM_FORUM_PATH,
  HOME_ROOM_PATH,
  SPACE_ROOM_FORUM_PATH,
  SPACE_ROOM_PATH,
} from '$pages/paths';
import { lastVisitedRoomAtom } from '$state/room/lastRoom';
import { allRoomsAtom } from '$state/room-list/roomList';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { getCanonicalAliasRoomId, isRoomAlias, isRoomId } from '$utils/matrix';
import { useAndroidBackHandler } from '$utils/androidBack';

type BackRouteHandlerProps = {
  children: (onBack: () => void) => ReactNode;
};

export function useBackRoute(): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const mx = useMatrixClient();
  const allRooms = useAtomValue(allRoomsAtom);
  const setLastRoom = useSetAtom(lastVisitedRoomAtom);

  return useCallback(() => {
    const section = resolveSection(location.pathname);
    if (!section) return;

    const roomPaths = [
      HOME_ROOM_FORUM_PATH,
      DIRECT_ROOM_FORUM_PATH,
      SPACE_ROOM_FORUM_PATH,
      HOME_ROOM_PATH,
      DIRECT_ROOM_PATH,
      SPACE_ROOM_PATH,
    ];
    const roomMatch = roomPaths
      .map((path) => matchPath({ path, end: false }, location.pathname))
      .find((match) => match !== null);

    const currentRoomIdOrAlias = roomMatch?.params.roomIdOrAlias;
    const decoded = currentRoomIdOrAlias && decodeURIComponent(currentRoomIdOrAlias);
    const inRoomRoute = !!decoded && (isRoomId(decoded) || isRoomAlias(decoded));
    if (section.getRoomPath && inRoomRoute && decoded) {
      setLastRoom((prev) => ({ ...prev, [section.key]: decoded }));
    }

    // An unjoined space renders the preview screen on every route of its section,
    // so its own list path loops back onto the same screen: escape to home instead.
    if (!inRoomRoute && section.spaceIdOrAlias) {
      const spaceId = isRoomId(section.spaceIdOrAlias)
        ? section.spaceIdOrAlias
        : getCanonicalAliasRoomId(mx, section.spaceIdOrAlias);
      if (!spaceId || !allRooms.includes(spaceId)) {
        navigate(getHomePath(), { replace: true });
        return;
      }
    }

    navigate(section.listPath);
  }, [navigate, location, setLastRoom, mx, allRooms]);
}

export function BackRouteHandler({ children }: BackRouteHandlerProps) {
  const goBack = useBackRoute();
  useAndroidBackHandler(() => {
    goBack();
    return true;
  });

  return children(goBack);
}
