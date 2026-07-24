import type { ReactNode } from 'react';
import { Box } from 'folds';
import { matchPath, useLocation } from 'react-router-dom';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { SETTINGS_PATH } from '../paths';
import { isShallowSettingsRoute } from './ClientRouteOutlet';

type ClientLayoutProps = {
  nav: ReactNode;
  children: ReactNode;
};
export function ClientLayout({ nav, children }: ClientLayoutProps) {
  const location = useLocation();
  const screenSize = useScreenSizeContext();
  const [mobileGestures] = useSetting(settingsAtom, 'mobileGestures');
  const fullPageSettings =
    Boolean(matchPath(SETTINGS_PATH, location.pathname)) &&
    !isShallowSettingsRoute(location.pathname, location.state, screenSize);

  const railInDrawer = screenSize === ScreenSize.Mobile && mobileGestures;

  return (
    <Box grow="Yes" direction="Row">
      {!fullPageSettings && !railInDrawer && <Box shrink="No">{nav}</Box>}
      <Box grow="Yes">{children}</Box>
    </Box>
  );
}
