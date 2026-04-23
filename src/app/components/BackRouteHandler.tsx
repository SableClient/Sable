import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { useSetAtom } from 'jotai';
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
import { lastVisitedRoomIdAtom } from '$state/room/lastRoom';

type BackRouteHandlerProps = {
  children: (onBack: () => void) => ReactNode;
};
export function BackRouteHandler({ children }: BackRouteHandlerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const setLastRoomId = useSetAtom(lastVisitedRoomIdAtom);

  const goBack = useCallback(() => {
    const roomPaths = [HOME_ROOM_PATH, DIRECT_ROOM_PATH, SPACE_ROOM_PATH];

    const roomMatch = roomPaths
      .map((path) => matchPath({ path, end: false }, location.pathname))
      .find((match) => match !== null);

    const currentRoomIdOrAlias = roomMatch?.params.roomIdOrAlias;
    if (currentRoomIdOrAlias) {
      setLastRoomId(decodeURIComponent(currentRoomIdOrAlias));
    }

    if (
      matchPath(
        {
          path: HOME_PATH,
          caseSensitive: true,
          end: false,
        },
        location.pathname
      )
    ) {
      navigate(getHomePath());
      return;
    }
    if (
      matchPath(
        {
          path: DIRECT_PATH,
          caseSensitive: true,
          end: false,
        },
        location.pathname
      )
    ) {
      navigate(getDirectPath());
      return;
    }
    const spaceMatch = matchPath(
      {
        path: SPACE_PATH,
        caseSensitive: true,
        end: false,
      },
      location.pathname
    );
    const encodedSpaceIdOrAlias = spaceMatch?.params.spaceIdOrAlias;
    const decodedSpaceIdOrAlias =
      encodedSpaceIdOrAlias && decodeURIComponent(encodedSpaceIdOrAlias);

    if (decodedSpaceIdOrAlias) {
      navigate(getSpacePath(decodedSpaceIdOrAlias));
      return;
    }
    if (
      matchPath(
        {
          path: EXPLORE_PATH,
          caseSensitive: true,
          end: false,
        },
        location.pathname
      )
    ) {
      navigate(getExplorePath());
      return;
    }
    if (
      matchPath(
        {
          path: INBOX_PATH,
          caseSensitive: true,
          end: false,
        },
        location.pathname
      )
    ) {
      navigate(getInboxPath());
    }
  }, [navigate, location, setLastRoomId]);

  return children(goBack);
}
