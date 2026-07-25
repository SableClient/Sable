import { useRef } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { Modal } from 'folds';
import { useScreenSizeContext } from '$hooks/useScreenSize';
import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';
import { isShallowRoute } from '$pages/client/shallowRoute';
import { useCloseShallowRoute } from '$pages/client/useShallowRoute';
import { SETTINGS_PATH } from '$pages/paths';
import { SettingsRoute } from './SettingsRoute';

export function SettingsShallowRouteRenderer() {
  const location = useLocation();
  const screenSize = useScreenSizeContext();
  const requestClose = useCloseShallowRoute();
  const routeMatch = matchPath(SETTINGS_PATH, location.pathname);
  const modalRef = useRef<HTMLDivElement | null>(null);

  if (!routeMatch || !isShallowRoute(location.pathname, location.state, screenSize)) {
    return null;
  }

  return (
    <ModalOverlay requestClose={requestClose} mobile="fullscreen" contentRef={modalRef}>
      <Modal ref={modalRef} tabIndex={-1} size="500" variant="Background">
        <SettingsRoute routeSection={routeMatch.params.section} />
      </Modal>
    </ModalOverlay>
  );
}
