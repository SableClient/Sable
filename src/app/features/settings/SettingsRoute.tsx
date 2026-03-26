import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { getSettingsPath } from '$pages/pathUtils';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Settings } from './Settings';
import { isSettingsSectionId, type SettingsSectionId } from './routes';

function resolveSettingsSection(
  section: string | undefined,
  screenSize: ScreenSize,
  showPersona: boolean
): SettingsSectionId | null {
  if (section === undefined) {
    return screenSize === ScreenSize.Mobile ? null : 'general';
  }

  if (!isSettingsSectionId(section)) {
    return null;
  }

  if (section === 'persona' && !showPersona) {
    return null;
  }

  return section;
}

export function SettingsRoute() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const screenSize = useScreenSizeContext();
  const [showPersona] = useSetting(settingsAtom, 'showPersonaSetting');

  const activeSection = resolveSettingsSection(section, screenSize, showPersona);
  const shouldRedirectToIndex = section !== undefined && activeSection === null;

  useEffect(() => {
    if (!shouldRedirectToIndex) return;

    navigate(getSettingsPath(), { replace: true, state: location.state });
  }, [location.state, navigate, shouldRedirectToIndex]);

  if (shouldRedirectToIndex) return null;

  const requestClose = () => {
    navigate(-1);
  };

  const handleSelectSection = (nextSection: SettingsSectionId) => {
    navigate(getSettingsPath(nextSection));
  };

  return (
    <Settings
      activeSection={activeSection}
      onSelectSection={handleSelectSection}
      requestClose={requestClose}
    />
  );
}
