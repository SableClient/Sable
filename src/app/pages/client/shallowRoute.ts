import { matchPath, type To } from 'react-router';
import { ScreenSize } from '$hooks/useScreenSize';
import { getHomePath } from '$pages/pathUtils';
import {
  BUG_REPORT_PATH,
  CREATE_PATH,
  CREATE_ROOM_PATH,
  NAVIGATE_PATH,
  SETTINGS_PATH,
} from '../paths';

export type StoredLocation = {
  pathname: string;
  search: string;
  hash: string;
  state?: unknown;
  key?: string;
};

export type ShallowRouteState = {
  backgroundLocation?: StoredLocation;
};

/**
 * Routes that render as an overlay over the page they were opened from on
 * desktop, and as a full page on mobile.
 */
const SHALLOW_ROUTE_PATHS = [
  SETTINGS_PATH,
  CREATE_ROOM_PATH,
  CREATE_PATH,
  BUG_REPORT_PATH,
  NAVIGATE_PATH,
];

export const getBackgroundLocation = (state: unknown): StoredLocation | undefined =>
  (state as ShallowRouteState | null)?.backgroundLocation;

/** The shallow route pattern a pathname belongs to, if any. */
export const getShallowRoutePath = (pathname: string): string | undefined =>
  SHALLOW_ROUTE_PATHS.find((path) => matchPath(path, pathname) !== null);

export const isShallowRoute = (
  pathname: string,
  state: unknown,
  screenSize: ScreenSize
): boolean => {
  if (screenSize === ScreenSize.Mobile) return false;
  if (!getBackgroundLocation(state)) return false;
  return getShallowRoutePath(pathname) !== undefined;
};

export function getShallowCloseTarget(state: unknown): { to: To; state?: unknown } {
  const backgroundLocation = getBackgroundLocation(state);
  if (!backgroundLocation) {
    return { to: getHomePath() };
  }

  return {
    to: {
      pathname: backgroundLocation.pathname,
      search: backgroundLocation.search,
      hash: backgroundLocation.hash,
    },
    state: backgroundLocation.state,
  };
}
