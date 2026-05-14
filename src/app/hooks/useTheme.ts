import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { isLocalImportThemeUrl } from '../theme/localImportUrls';
import { onDarkFontWeight, onLightFontWeight } from '../../config.css';
import { darkTheme, lightTheme } from '../../colors.css';

export enum ThemeKind {
  Light = 'light',
  Dark = 'dark',
}

export type Theme = {
  id: string;
  kind: ThemeKind;
  classNames: string[];
  remoteFullUrl?: string;
};

export const REMOTE_THEME_ID = 'sable-remote-theme';

const isRemoteLoadedThemeUrl = (u: string | undefined): u is string => {
  if (!u) return false;
  const t = u.trim();
  return /^https:\/\//i.test(t) || isLocalImportThemeUrl(t);
};

function parseRemoteKind(value: 'light' | 'dark' | undefined, fallback: ThemeKind): ThemeKind {
  if (value === 'dark') return ThemeKind.Dark;
  if (value === 'light') return ThemeKind.Light;
  return fallback;
}

function makeRemoteTheme(url: string, kind: ThemeKind): Theme {
  const fw = kind === ThemeKind.Dark ? onDarkFontWeight : onLightFontWeight;
  const kindClass = kind === ThemeKind.Dark ? 'sable-remote-kind-dark' : 'sable-remote-kind-light';
  const legacyCssTheme = kind === ThemeKind.Dark ? 'dark-theme' : 'light-theme';
  const veTheme = kind === ThemeKind.Dark ? darkTheme : lightTheme;
  return {
    id: REMOTE_THEME_ID,
    kind,
    classNames: ['sable-remote-theme', kindClass, legacyCssTheme, veTheme, fw],
    remoteFullUrl: url.trim(),
  };
}

export const LightTheme: Theme = {
  id: 'light-theme',
  kind: ThemeKind.Light,
  classNames: ['sable-remote-theme', 'light-theme', lightTheme, onLightFontWeight],
};

export const DarkTheme: Theme = {
  id: 'dark-theme',
  kind: ThemeKind.Dark,
  classNames: ['sable-remote-theme', 'dark-theme', darkTheme, onDarkFontWeight],
};

export const useThemes = (): Theme[] => {
  const themes: Theme[] = useMemo(() => [LightTheme, DarkTheme], []);

  return themes;
};

export const useThemeNames = (): Record<string, string> =>
  useMemo(
    () => ({
      [LightTheme.id]: 'Light',
      [DarkTheme.id]: 'Dark',
    }),
    []
  );

export const useSystemThemeKind = (): ThemeKind => {
  const darkModeQueryList = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [themeKind, setThemeKind] = useState(
    darkModeQueryList.matches ? ThemeKind.Dark : ThemeKind.Light
  );

  useEffect(() => {
    const handleMediaQueryChange = () => {
      setThemeKind(darkModeQueryList.matches ? ThemeKind.Dark : ThemeKind.Light);
    };

    darkModeQueryList.addEventListener('change', handleMediaQueryChange);
    return () => {
      darkModeQueryList.removeEventListener('change', handleMediaQueryChange);
    };
  }, [darkModeQueryList, setThemeKind]);

  return themeKind;
};

export const useActiveTheme = (): Theme => {
  const systemThemeKind = useSystemThemeKind();
  const themes = useThemes();
  const [systemTheme] = useSetting(settingsAtom, 'useSystemTheme');
  const [themeId] = useSetting(settingsAtom, 'themeId');
  const [lightThemeId] = useSetting(settingsAtom, 'lightThemeId');
  const [darkThemeId] = useSetting(settingsAtom, 'darkThemeId');
  const [manualRemoteUrl] = useSetting(settingsAtom, 'themeRemoteManualFullUrl');
  const [lightRemoteUrl] = useSetting(settingsAtom, 'themeRemoteLightFullUrl');
  const [darkRemoteUrl] = useSetting(settingsAtom, 'themeRemoteDarkFullUrl');
  const [manualRemoteKind] = useSetting(settingsAtom, 'themeRemoteManualKind');
  const [lightRemoteKind] = useSetting(settingsAtom, 'themeRemoteLightKind');
  const [darkRemoteKind] = useSetting(settingsAtom, 'themeRemoteDarkKind');

  if (!systemTheme) {
    if (isRemoteLoadedThemeUrl(manualRemoteUrl)) {
      const inferred = themeId === 'dark-theme' ? ThemeKind.Dark : ThemeKind.Light;
      return makeRemoteTheme(manualRemoteUrl, parseRemoteKind(manualRemoteKind, inferred));
    }
    return themes.find((theme) => theme.id === themeId) ?? LightTheme;
  }

  const isDark = systemThemeKind === ThemeKind.Dark;
  const slotRemoteUrl = isDark ? darkRemoteUrl : lightRemoteUrl;
  if (isRemoteLoadedThemeUrl(slotRemoteUrl)) {
    const defaultSlotKind = isDark ? ThemeKind.Dark : ThemeKind.Light;
    const slotKind = isDark ? darkRemoteKind : lightRemoteKind;
    return makeRemoteTheme(slotRemoteUrl, parseRemoteKind(slotKind, defaultSlotKind));
  }

  return isDark
    ? (themes.find((theme) => theme.id === darkThemeId) ?? DarkTheme)
    : (themes.find((theme) => theme.id === lightThemeId) ?? LightTheme);
};

const ThemeContext = createContext<Theme | null>(null);
export const ThemeContextProvider = ThemeContext.Provider;

export const useTheme = (): Theme => {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('No theme provided!');
  }

  return theme;
};
