import { ReactNode } from 'react';
import { useMatch } from 'react-router-dom';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import {
  DIRECT_PATH,
  EXPLORE_PATH,
  HOME_PATH,
  INBOX_PATH,
  SPACE_PATH,
  LOBBY_PATH_SEGMENT,
  ROOM_PATH_SEGMENT,
} from './paths';

type MobileFriendlyClientNavProps = {
  children: ReactNode;
};
export function MobileFriendlyClientNav({ children }: MobileFriendlyClientNavProps) {
  const screenSize = useScreenSizeContext();
  const homeMatch = useMatch({ path: HOME_PATH, caseSensitive: true, end: true });
  const directMatch = useMatch({ path: DIRECT_PATH, caseSensitive: true, end: true });
  const spaceMatch = useMatch({ path: SPACE_PATH, caseSensitive: true, end: true });
  const exploreMatch = useMatch({ path: EXPLORE_PATH, caseSensitive: true, end: true });
  const inboxMatch = useMatch({ path: INBOX_PATH, caseSensitive: true, end: true });

  if (
    screenSize === ScreenSize.Mobile &&
    !(homeMatch || directMatch || spaceMatch || exploreMatch || inboxMatch)
  ) {
    return null;
  }

  return children;
}

type MobileFriendlyPageNavProps = {
  path: string;
  children: ReactNode;
};
export function MobileFriendlyPageNav({ path, children }: MobileFriendlyPageNavProps) {
  const screenSize = useScreenSizeContext();
  const exactPath = useMatch({ path, caseSensitive: true, end: true });
  const spaceLobbyMatch = useMatch({
    path: `${SPACE_PATH}${LOBBY_PATH_SEGMENT}`,
    caseSensitive: true,
    end: true,
  });
  const roomMatch = useMatch({
    path: `${path}${ROOM_PATH_SEGMENT}`,
    caseSensitive: true,
    end: false,
  });

  if (screenSize === ScreenSize.Mobile) {
    return children;
  }

  if (path === SPACE_PATH) {
    if (!exactPath && !spaceLobbyMatch && !roomMatch) return null;
  } else {
    if (!exactPath && !roomMatch) return null;
  }

  return children;
}
