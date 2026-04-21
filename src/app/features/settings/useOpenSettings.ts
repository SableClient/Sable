import { useCallback } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { getSettingsPath } from '$pages/pathUtils';
import { SETTINGS_PATH } from '$pages/paths';
import type { SettingsSectionId } from './routes';
import { normalizeSettingsFocusId } from './settingsLink';

export function useOpenSettings() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (section?: SettingsSectionId, focus?: string) => {
      const settingsState = matchPath(SETTINGS_PATH, location.pathname)
        ? undefined
        : { backgroundLocation: location };

      navigate(getSettingsPath(section, normalizeSettingsFocusId(focus)), {
        state: settingsState,
      });
    },
    [location, navigate]
  );
}
