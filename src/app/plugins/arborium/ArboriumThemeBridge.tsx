import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { ThemeKind } from '$hooks/useTheme';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';

import {
  ARBORIUM_CDN_VERSION,
  DEFAULT_ARBORIUM_DARK_THEME,
  DEFAULT_ARBORIUM_LIGHT_THEME,
  getArboriumThemeHref,
  isArboriumThemeId,
} from './themes';

type ArboriumThemeStatus = {
  ready: boolean;
};

const ArboriumThemeStatusContext = createContext<ArboriumThemeStatus | null>(null);

export const useArboriumThemeStatus = (): ArboriumThemeStatus => {
  const status = useContext(ArboriumThemeStatusContext);
  if (!status) {
    throw new Error('No Arborium theme status provided!');
  }

  return status;
};

type ArboriumThemeBridgeProps = {
  kind: ThemeKind;
  children?: ReactNode;
};

const baseHref = `https://cdn.jsdelivr.net/npm/@arborium/arborium@${ARBORIUM_CDN_VERSION}/dist/themes/base-rustdoc.css`;

const baseLinkId = 'arborium-base';
const themeLinkId = 'arborium-theme';

const getOrCreateLink = (id: string): HTMLLinkElement => {
  const existingLink = document.getElementById(id);
  if (existingLink instanceof HTMLLinkElement) {
    return existingLink;
  }

  const link = document.createElement('link');
  link.setAttribute('id', id);
  link.setAttribute('rel', 'stylesheet');
  link.setAttribute('type', 'text/css');
  document.head.append(link);
  return link;
};

const setLinkHref = (link: HTMLLinkElement, href: string) => {
  if (link.getAttribute('href') !== href) {
    link.setAttribute('href', href);
  }
};

const markLinkLoaded = (link: HTMLLinkElement) => {
  link.setAttribute('data-arborium-loaded', 'true');
};

const clearLinkLoaded = (link: HTMLLinkElement) => {
  link.removeAttribute('data-arborium-loaded');
};

export function ArboriumThemeBridge({ kind, children }: ArboriumThemeBridgeProps) {
  const [useSystemArboriumTheme] = useSetting(settingsAtom, 'useSystemArboriumTheme');
  const [arboriumThemeId] = useSetting(settingsAtom, 'arboriumThemeId');
  const [arboriumLightTheme] = useSetting(settingsAtom, 'arboriumLightTheme');
  const [arboriumDarkTheme] = useSetting(settingsAtom, 'arboriumDarkTheme');
  const [baseReady, setBaseReady] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const selectedSystemThemeId = kind === ThemeKind.Dark ? arboriumDarkTheme : arboriumLightTheme;
  let resolvedSystemThemeId = DEFAULT_ARBORIUM_LIGHT_THEME;
  if (kind === ThemeKind.Dark) {
    resolvedSystemThemeId = DEFAULT_ARBORIUM_DARK_THEME;
  }
  if (selectedSystemThemeId && isArboriumThemeId(selectedSystemThemeId)) {
    resolvedSystemThemeId = selectedSystemThemeId;
  }
  const themeId =
    !useSystemArboriumTheme && arboriumThemeId && isArboriumThemeId(arboriumThemeId)
      ? arboriumThemeId
      : resolvedSystemThemeId;
  const themeHref = getArboriumThemeHref(themeId);

  useEffect(() => {
    const baseLink = getOrCreateLink(baseLinkId);
    setLinkHref(baseLink, baseHref);
    setBaseReady(baseLink.dataset.arboriumLoaded === 'true');

    const handleBaseLoad = () => {
      markLinkLoaded(baseLink);
      setBaseReady(true);
    };
    const handleBaseError = () => {
      clearLinkLoaded(baseLink);
      setBaseReady(false);
    };

    baseLink.addEventListener('load', handleBaseLoad);
    baseLink.addEventListener('error', handleBaseError);

    return () => {
      baseLink.removeEventListener('load', handleBaseLoad);
      baseLink.removeEventListener('error', handleBaseError);
    };
  }, []);

  useEffect(() => {
    const themeLink = getOrCreateLink(themeLinkId);
    const hrefChanged = themeLink.getAttribute('href') !== themeHref;
    setLinkHref(themeLink, themeHref);
    if (hrefChanged) {
      clearLinkLoaded(themeLink);
    }
    setThemeReady(!hrefChanged && themeLink.dataset.arboriumLoaded === 'true');

    const handleThemeLoad = () => {
      markLinkLoaded(themeLink);
      setThemeReady(true);
    };
    const handleThemeError = () => {
      clearLinkLoaded(themeLink);
      setThemeReady(false);
    };

    themeLink.addEventListener('load', handleThemeLoad);
    themeLink.addEventListener('error', handleThemeError);

    return () => {
      themeLink.removeEventListener('load', handleThemeLoad);
      themeLink.removeEventListener('error', handleThemeError);
    };
  }, [themeHref]);

  const status = useMemo(() => ({ ready: baseReady && themeReady }), [baseReady, themeReady]);

  return (
    <ArboriumThemeStatusContext.Provider value={status}>
      {children}
    </ArboriumThemeStatusContext.Provider>
  );
}
