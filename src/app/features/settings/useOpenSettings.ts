import { useCallback } from 'react';
import { getSettingsPath } from '$pages/pathUtils';
import { useOpenShallowRoute } from '$pages/client/useShallowRoute';
import type { SettingsSectionId } from './routes';
import { normalizeSettingsFocusId } from './settingsLink';

export function useOpenSettings() {
  const openShallowRoute = useOpenShallowRoute();

  return useCallback(
    (section?: SettingsSectionId, focus?: string) => {
      openShallowRoute(getSettingsPath(section, normalizeSettingsFocusId(focus)));
    },
    [openShallowRoute]
  );
}
