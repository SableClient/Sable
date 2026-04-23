import type { ReactNode } from 'react';
import { Box } from 'folds';
import { matchPath, useLocation } from 'react-router-dom';
import { useScreenSizeContext } from '$hooks/useScreenSize';
import { SETTINGS_PATH } from '../paths';
import { isShallowSettingsRoute } from './ClientRouteOutlet';

type ClientLayoutProps = {
  nav: ReactNode;
  children: ReactNode;
};
export function ClientLayout({ nav, children }: ClientLayoutProps) {
  const location = useLocation();
  const screenSize = useScreenSizeContext();
  const fullPageSettings =
    Boolean(matchPath(SETTINGS_PATH, location.pathname)) &&
    !isShallowSettingsRoute(location.pathname, location.state, screenSize);

  return (
    <Box grow="Yes">
      {!fullPageSettings && <Box shrink="No">{nav}</Box>}
      <Box grow="Yes">{children}</Box>
    </Box>
  );
}
