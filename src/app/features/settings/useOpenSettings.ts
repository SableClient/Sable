import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSettingsPath } from '$pages/pathUtils';
import type { SettingsSectionId } from './routes';

export function useOpenSettings() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (section?: SettingsSectionId, focus?: string) => {
      navigate(getSettingsPath(section, focus), {
        state: { backgroundLocation: location },
      });
    },
    [location, navigate]
  );
}
