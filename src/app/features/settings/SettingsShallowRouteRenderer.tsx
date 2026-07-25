import { matchPath, useLocation } from 'react-router-dom';
import { useScreenSizeContext } from '$hooks/useScreenSize';
import { Modal500 } from '$components/Modal500';
import { isShallowRoute } from '$pages/client/shallowRoute';
import { useCloseShallowRoute } from '$pages/client/useShallowRoute';
import { SETTINGS_PATH } from '$pages/paths';
import { SettingsRoute } from './SettingsRoute';

export function SettingsShallowRouteRenderer() {
  const location = useLocation();
  const screenSize = useScreenSizeContext();
  const requestClose = useCloseShallowRoute();
  const routeMatch = matchPath(SETTINGS_PATH, location.pathname);

  if (!routeMatch || !isShallowRoute(location.pathname, location.state, screenSize)) {
    return null;
  }

  return (
    <Modal500 requestClose={requestClose}>
      <SettingsRoute routeSection={routeMatch.params.section} />
    </Modal500>
  );
}
