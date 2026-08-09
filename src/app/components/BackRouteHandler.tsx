import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { useSetAtom } from 'jotai';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { resolveSection } from '$pages/pathUtils';
import { HOME_ROOM_PATH, DIRECT_ROOM_PATH, SPACE_ROOM_PATH } from '$pages/paths';
import { lastVisitedRoomAtom } from '$state/room/lastRoom';
import { isRoomAlias, isRoomId } from '$utils/matrix';
import { useAndroidBackHandler } from '$utils/androidBack';

type BackRouteHandlerProps = {
  children: (onBack: () => void) => ReactNode;
};

export function useBackRoute(): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const setLastRoom = useSetAtom(lastVisitedRoomAtom);

  return useCallback(() => {
    const section = resolveSection(location.pathname);
    if (!section) return;

    const roomPaths = [HOME_ROOM_PATH, DIRECT_ROOM_PATH, SPACE_ROOM_PATH];
    const roomMatch = roomPaths
      .map((path) => matchPath({ path, end: false }, location.pathname))
      .find((match) => match !== null);

    const currentRoomIdOrAlias = roomMatch?.params.roomIdOrAlias;
    const decoded = currentRoomIdOrAlias && decodeURIComponent(currentRoomIdOrAlias);
    if (section.getRoomPath && decoded && (isRoomId(decoded) || isRoomAlias(decoded))) {
      setLastRoom((prev) => ({ ...prev, [section.key]: decoded }));
    }

    navigate(section.listPath);
  }, [navigate, location, setLastRoom]);
}

export function BackRouteHandler({ children }: BackRouteHandlerProps) {
  const goBack = useBackRoute();
  useAndroidBackHandler(() => {
    goBack();
    return true;
  });

  return children(goBack);
}
