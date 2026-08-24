import type { ReactNode } from 'react';
import { Box } from 'folds';
import { matchPath, useLocation } from 'react-router';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { SETTINGS_PATH } from '../paths';
import { isShallowRoute } from './shallowRoute';

type ClientLayoutProps = {
  nav: ReactNode;
  children: ReactNode;
};
export function ClientLayout({ nav, children }: ClientLayoutProps) {
  const location = useLocation();
  const screenSize = useScreenSizeContext();
  const fullPageSettings =
    Boolean(matchPath(SETTINGS_PATH, location.pathname)) &&
    !isShallowRoute(location.pathname, location.state, screenSize);

  const railInDrawer = screenSize === ScreenSize.Mobile;

  return (
    <Box grow="Yes" direction="Row">
      {!fullPageSettings && !railInDrawer && <Box shrink="No">{nav}</Box>}
      <Box grow="Yes" style={{ minWidth: 0 }}>
        {children}
      </Box>
    </Box>
  );
}
