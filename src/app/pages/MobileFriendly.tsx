import type { ReactNode } from 'react';
import { useMatch } from 'react-router-dom';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import {
  DIRECT_PATH,
  EXPLORE_PATH,
  HOME_PATH,
  INBOX_PATH,
  NAVIGATE_PATH,
  PROFILE_PATH,
  SPACE_PATH,
} from './paths';

type MobileFriendlyClientNavProps = {
  children: ReactNode;
};
export function MobileFriendlySidebarNav({ children }: MobileFriendlyClientNavProps) {
  const screenSize = useScreenSizeContext();
  const homeMatch = useMatch({ path: HOME_PATH, caseSensitive: true, end: true });
  const directMatch = useMatch({ path: DIRECT_PATH, caseSensitive: true, end: true });
  const spaceMatch = useMatch({ path: SPACE_PATH, caseSensitive: true, end: true });
  const exploreMatch = useMatch({ path: EXPLORE_PATH, caseSensitive: true, end: true });
  const inboxMatch = useMatch({ path: INBOX_PATH, caseSensitive: true, end: true });
  const profileMatch = useMatch({ path: PROFILE_PATH, caseSensitive: true, end: true });
  const navigateMatch = useMatch({ path: NAVIGATE_PATH, caseSensitive: true, end: true });
  if (
    screenSize === ScreenSize.Mobile &&
    (!(homeMatch || directMatch || spaceMatch || exploreMatch) ||
      profileMatch ||
      inboxMatch ||
      navigateMatch)
  ) {
    return null;
  }

  return children;
}

export function MobileFriendlyBottomNav({ children }: MobileFriendlyClientNavProps) {
  const screenSize = useScreenSizeContext();
  const [mobileGestures] = useSetting(settingsAtom, 'mobileGestures');
  const homeMatch = useMatch({ path: HOME_PATH, caseSensitive: true, end: true });
  const directMatch = useMatch({ path: DIRECT_PATH, caseSensitive: true, end: true });
  const spaceMatch = useMatch({ path: SPACE_PATH, caseSensitive: true, end: true });
  const inboxMatch = useMatch({ path: INBOX_PATH, caseSensitive: true, end: false });
  const navigateMatch = useMatch({ path: NAVIGATE_PATH, caseSensitive: true, end: false });
  const profileMatch = useMatch({ path: PROFILE_PATH, caseSensitive: true, end: false });
  const settingsMatch = useMatch({ path: '/settings/', caseSensitive: true, end: true });
  const onBarDestination =
    homeMatch || directMatch || spaceMatch || inboxMatch || navigateMatch || profileMatch;
  if (
    screenSize !== ScreenSize.Mobile ||
    (mobileGestures && !inboxMatch && !navigateMatch && !profileMatch) ||
    !onBarDestination ||
    settingsMatch
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
  const [mobileGestures] = useSetting(settingsAtom, 'mobileGestures');
  const exactPath = useMatch({
    path,
    caseSensitive: true,
    end: true,
  });

  // With mobile gestures on, the list stays mounted so MobileNavDrawer can reveal it as a
  // co-present panel. Without gestures, fall back to the route-based single-view behavior.
  if (screenSize === ScreenSize.Mobile && !mobileGestures && !exactPath) {
    return null;
  }

  return children;
}
