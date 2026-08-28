import { useRef } from 'react';
import { useLocation, useOutlet } from 'react-router';
import { useScreenSizeContext } from '$hooks/useScreenSize';
import { isShallowRoute } from './shallowRoute';

export function ClientRouteOutlet() {
  const outlet = useOutlet();
  const location = useLocation();
  const screenSize = useScreenSizeContext();
  const cachedOutletRef = useRef(outlet);
  const shallow = isShallowRoute(location.pathname, location.state, screenSize);

  if (!shallow) {
    cachedOutletRef.current = outlet;
    return outlet;
  }

  return cachedOutletRef.current;
}
