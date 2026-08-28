import { useCallback } from 'react';
import { useLocation, useNavigate, type To } from 'react-router';
import { getShallowCloseTarget, getShallowRoutePath } from './shallowRoute';

/**
 * Navigates to a shallow route, remembering the current location so the route
 * can render over it on desktop and return to it when closed. Navigating
 * within the same surface (settings section to settings section) keeps the
 * background it was opened over instead of recording itself.
 */
export function useOpenShallowRoute() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (to: string) => {
      const [targetPathname] = to.split('?');
      const currentSurface = getShallowRoutePath(location.pathname);
      const sameSurface =
        currentSurface !== undefined &&
        getShallowRoutePath(targetPathname ?? to) === currentSurface;

      navigate(to, { state: sameSurface ? location.state : { backgroundLocation: location } });
    },
    [location, navigate]
  );
}

/** Returns to the location a shallow route was opened from, or home. */
export function useCloseShallowRoute() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    const target: { to: To; state?: unknown } = getShallowCloseTarget(location.state);
    navigate(target.to, { replace: true, state: target.state });
  }, [location, navigate]);
}
