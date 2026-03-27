import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { getSettingsPath } from '$pages/pathUtils';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { trimTrailingSlash } from '$utils/common';
import { getSettingsCloseTarget, type SettingsRouteState } from './navigation';
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

type SettingsRouteProps = {
  routeSection?: string;
};

export function SettingsRoute({ routeSection }: SettingsRouteProps) {
  const { section: paramsSection } = useParams<{ section?: string }>();
  const section = routeSection ?? paramsSection;
  const navigate = useNavigate();
  const location = useLocation();
  const screenSize = useScreenSizeContext();
  const [showPersona] = useSetting(settingsAtom, 'showPersonaSetting');
  const routeState = location.state as SettingsRouteState | null;
  const shallowBackgroundState =
    screenSize !== ScreenSize.Mobile && Boolean(routeState?.backgroundLocation);
  const canonicalPathname = trimTrailingSlash(location.pathname);
  const shouldCanonicalizeTrailingSlash =
    location.pathname.length > canonicalPathname.length &&
    canonicalPathname.startsWith('/settings');
  const browserHistoryIndex =
    typeof window !== 'undefined' && typeof window.history.state?.idx === 'number'
      ? window.history.state.idx
      : null;
  const hasPreviousEntry =
    (typeof browserHistoryIndex === 'number' && browserHistoryIndex > 0) ||
    location.key !== 'default';

  const activeSection = resolveSettingsSection(section, screenSize, showPersona);
  const shouldRedirectToGeneral = section === undefined && screenSize !== ScreenSize.Mobile;
  const shouldRedirectToIndex = section !== undefined && activeSection === null;

  useEffect(() => {
    if (shouldCanonicalizeTrailingSlash) {
      navigate(
        {
          pathname: canonicalPathname,
          search: location.search,
          hash: location.hash,
        },
        { replace: true, state: routeState }
      );
      return;
    }

    if (shouldRedirectToGeneral) {
      navigate(getSettingsPath('general'), {
        replace: true,
        state: routeState?.backgroundLocation ? routeState : { redirectedFromDesktopRoot: true },
      });
      return;
    }

    if (!shouldRedirectToIndex) return;

    navigate(getSettingsPath(), { replace: true, state: routeState });
  }, [
    canonicalPathname,
    location.hash,
    location.search,
    navigate,
    routeState,
    shouldCanonicalizeTrailingSlash,
    shouldRedirectToGeneral,
    shouldRedirectToIndex,
  ]);

  if (shouldCanonicalizeTrailingSlash || shouldRedirectToGeneral || shouldRedirectToIndex) {
    return null;
  }

  const requestBack = () => {
    if (section === undefined) return;

    if (screenSize === ScreenSize.Mobile) {
      if (hasPreviousEntry) {
        navigate(-1);
        return;
      }

      navigate(getSettingsPath(), {
        replace: true,
        state: routeState?.backgroundLocation ? routeState : undefined,
      });
      return;
    }

    let desktopBackState: SettingsRouteState | undefined;
    if (routeState?.backgroundLocation) {
      desktopBackState = routeState;
    } else if (routeState?.redirectedFromDesktopRoot) {
      desktopBackState = { redirectedFromDesktopRoot: true };
    }

    navigate(getSettingsPath('general'), {
      replace: true,
      state: desktopBackState,
    });
  };

  const requestClose = () => {
    const closeTarget = getSettingsCloseTarget(routeState);
    navigate(closeTarget.to, { replace: true, state: closeTarget.state });
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
      onBack={requestBack}
      onSelectSection={handleSelectSection}
      requestClose={requestClose}
    />
  );
}
