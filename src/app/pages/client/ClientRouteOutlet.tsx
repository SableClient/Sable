import { useRef } from 'react';
import { matchPath, useLocation, useOutlet } from 'react-router-dom';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { SETTINGS_PATH } from '../paths';

type BackgroundLocationState = {
  backgroundLocation?: unknown;
};

export const isShallowSettingsRoute = (
  pathname: string,
  state: unknown,
  screenSize: ScreenSize
): boolean => {
  if (screenSize === ScreenSize.Mobile) return false;
  if (!matchPath(SETTINGS_PATH, pathname)) return false;

  const backgroundLocation = (state as BackgroundLocationState | null)?.backgroundLocation;
  return !!backgroundLocation;
};

export function ClientRouteOutlet() {
  const outlet = useOutlet();
  const location = useLocation();
  const screenSize = useScreenSizeContext();
  const cachedOutletRef = useRef(outlet);
  const shallowSettings = isShallowSettingsRoute(location.pathname, location.state, screenSize);

  if (!shallowSettings) {
    cachedOutletRef.current = outlet;
    return outlet;
  }

  return cachedOutletRef.current;
}
