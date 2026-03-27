import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { pluginVersion } from '@arborium/arborium';

import { ThemeKind } from '$hooks/useTheme';

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

const baseHref = `https://cdn.jsdelivr.net/npm/@arborium/arborium@${pluginVersion}/dist/themes/base-rustdoc.css`;
const darkHref = `https://cdn.jsdelivr.net/npm/@arborium/arborium@${pluginVersion}/dist/themes/one-dark.css`;
const lightHref = `https://cdn.jsdelivr.net/npm/@arborium/arborium@${pluginVersion}/dist/themes/github-light.css`;

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
  const [baseReady, setBaseReady] = useState(false);
  const [themeReady, setThemeReady] = useState(false);

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
    const href = kind === ThemeKind.Dark ? darkHref : lightHref;
    const hrefChanged = themeLink.getAttribute('href') !== href;
    setLinkHref(themeLink, href);
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
  }, [kind]);

  const status = useMemo(() => ({ ready: baseReady && themeReady }), [baseReady, themeReady]);

  return (
    <ArboriumThemeStatusContext.Provider value={status}>
      {children}
    </ArboriumThemeStatusContext.Provider>
  );
}
