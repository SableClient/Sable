import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { FormModal } from '$components/modal-overlay/FormModal';
import { getBackgroundLocation } from '$pages/client/shallowRoute';
import { useCloseShallowRoute } from '$pages/client/useShallowRoute';
import { FormPage } from './FormPage';

type RouteSurfaceProps = {
  title: string;
  subTitle: string;
  closeLabel: string;
  children: ReactNode;
};

/**
 * A route that presents as an overlay over the page it was opened from on
 * desktop, and as a full page on mobile or when deep linked.
 */
export function RouteSurface({ title, subTitle, closeLabel, children }: RouteSurfaceProps) {
  const location = useLocation();
  const screenSize = useScreenSizeContext();
  const requestClose = useCloseShallowRoute();

  const asOverlay = screenSize !== ScreenSize.Mobile && !!getBackgroundLocation(location.state);

  if (asOverlay) {
    return (
      <FormModal title={title} requestClose={requestClose}>
        {children}
      </FormModal>
    );
  }

  return (
    <FormPage title={title} subTitle={subTitle} closeLabel={closeLabel} onClose={requestClose}>
      {children}
    </FormPage>
  );
}
