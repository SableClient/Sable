import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useScreenSizeContext } from '$hooks/useScreenSize';
import { Modal500 } from '$components/Modal500';
import { isShallowSettingsRoute } from '$pages/client/ClientRouteOutlet';
import { SETTINGS_PATH } from '$pages/paths';
import { getSettingsCloseTarget, type SettingsRouteState } from './navigation';
import { SettingsRoute } from './SettingsRoute';

export function SettingsShallowRouteRenderer() {
  const navigate = useNavigate();
  const location = useLocation();
  const screenSize = useScreenSizeContext();
  const routeState = location.state as SettingsRouteState | null;
  const routeMatch = matchPath(SETTINGS_PATH, location.pathname);

  if (!isShallowSettingsRoute(location.pathname, location.state, screenSize) || !routeMatch) {
    return null;
  }

  const handleRequestClose = () => {
    const closeTarget = getSettingsCloseTarget(routeState);
    navigate(closeTarget.to, { replace: true, state: closeTarget.state });
  };

  return (
    <Modal500 requestClose={handleRequestClose}>
      <SettingsRoute routeSection={routeMatch.params.section} />
    </Modal500>
  );
}
