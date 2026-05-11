import type { To } from 'react-router-dom';
import { getHomePath } from '$pages/pathUtils';

export type SettingsStoredLocation = {
  pathname: string;
  search: string;
  hash: string;
  state?: unknown;
  key?: string;
};

export type SettingsRouteState = {
  backgroundLocation?: SettingsStoredLocation;
  redirectedFromDesktopRoot?: boolean;
};

export function getSettingsCloseTarget(routeState: SettingsRouteState | null | undefined): {
  to: To;
  state?: unknown;
} {
  const backgroundLocation = routeState?.backgroundLocation;
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
