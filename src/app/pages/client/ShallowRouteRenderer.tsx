import { lazy, Suspense } from 'react';
import { matchPath, useLocation } from 'react-router';
import { useScreenSizeContext } from '$hooks/useScreenSize';
import { BUG_REPORT_PATH, CREATE_PATH, CREATE_ROOM_PATH, NAVIGATE_PATH } from '../paths';
import { isShallowRoute } from './shallowRoute';

const CreateRoomPage = lazy(() =>
  import('./create-room').then((m) => ({ default: m.CreateRoomPage }))
);
const Create = lazy(() => import('./create').then((m) => ({ default: m.Create })));
const BugReportPage = lazy(() =>
  import('./bug-report').then((m) => ({ default: m.BugReportPage }))
);
const Navigate = lazy(() => import('./navigate').then((m) => ({ default: m.Navigate })));

/**
 * Renders shallow routes as an overlay while `ClientRouteOutlet` keeps the
 * page they were opened from mounted underneath.
 */
export function ShallowRouteRenderer() {
  const location = useLocation();
  const screenSize = useScreenSizeContext();

  if (!isShallowRoute(location.pathname, location.state, screenSize)) return null;

  const { pathname } = location;
  let surface = null;
  if (matchPath(CREATE_ROOM_PATH, pathname)) surface = <CreateRoomPage />;
  else if (matchPath(CREATE_PATH, pathname)) surface = <Create />;
  else if (matchPath(BUG_REPORT_PATH, pathname)) surface = <BugReportPage />;
  else if (matchPath(NAVIGATE_PATH, pathname)) surface = <Navigate />;

  if (!surface) return null;
  return <Suspense fallback={null}>{surface}</Suspense>;
}
