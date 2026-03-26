import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { getHomePath, getSettingsPath } from '$pages/pathUtils';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Settings } from './Settings';
import { isSettingsSectionId, type SettingsSectionId } from './routes';

type SettingsRouteState = {
  backgroundLocation?: unknown;
  redirectedFromDesktopRoot?: boolean;
};

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
  const routeState = location.state as SettingsRouteState | null;
  const shallowBackgroundState =
    screenSize !== ScreenSize.Mobile && Boolean(routeState?.backgroundLocation);

  const activeSection = resolveSettingsSection(section, screenSize, showPersona);
  const shouldRedirectToGeneral = section === undefined && screenSize !== ScreenSize.Mobile;
  const shouldRedirectToIndex = section !== undefined && activeSection === null;

  useEffect(() => {
    if (shouldRedirectToGeneral) {
      navigate(getSettingsPath('general'), {
        replace: true,
        state: routeState?.backgroundLocation ? routeState : { redirectedFromDesktopRoot: true },
      });
      return;
    }

    if (!shouldRedirectToIndex) return;

    navigate(getSettingsPath(), { replace: true, state: routeState });
  }, [navigate, routeState, shouldRedirectToGeneral, shouldRedirectToIndex]);

  if (shouldRedirectToGeneral || shouldRedirectToIndex) return null;

  const requestClose = () => {
    if (section !== undefined && routeState?.redirectedFromDesktopRoot) {
      navigate(getHomePath(), { replace: true });
      return;
    }

    if (section !== undefined && location.key === 'default') {
      navigate(getSettingsPath(), { replace: true, state: routeState });
      return;
    }

    if (section === undefined && location.key === 'default') {
      navigate(getHomePath(), { replace: true });
      return;
    }

    navigate(-1);
  };

  const handleSelectSection = (nextSection: SettingsSectionId) => {
    if (nextSection === activeSection) return;

    navigate(getSettingsPath(nextSection), {
      replace: shallowBackgroundState,
      state: location.state,
    });
  };

  return (
    <Settings
      activeSection={activeSection}
      onSelectSection={handleSelectSection}
      requestClose={requestClose}
    />
  );
}
