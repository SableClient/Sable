import { Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { useScreenSizeContext } from '$hooks/useScreenSize';
import { Modal500 } from '$components/Modal500';
import { isShallowSettingsRoute } from '$pages/client/ClientRouteOutlet';
import { SETTINGS_PATH } from '$pages/paths';
import { SettingsRoute } from './SettingsRoute';

export function SettingsShallowRouteRenderer() {
  const navigate = useNavigate();
  const location = useLocation();
  const screenSize = useScreenSizeContext();

  if (!isShallowSettingsRoute(location.pathname, location.state, screenSize)) return null;

  return (
    <Modal500 requestClose={() => navigate(-1)}>
      <Routes>
        <Route path={SETTINGS_PATH} element={<SettingsRoute />} />
      </Routes>
    </Modal500>
  );
}
