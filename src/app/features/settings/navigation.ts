import type { ShallowRouteState } from '$pages/client/shallowRoute';

export type SettingsRouteState = ShallowRouteState & {
  redirectedFromDesktopRoot?: boolean;
  pushedFromSettingsMenu?: boolean;
};
