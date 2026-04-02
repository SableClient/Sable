import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { onDarkFontWeight, onLightFontWeight } from '../../config.css';
import {
  butterTheme,
  cinnyDarkTheme,
  darkTheme,
  lightTheme,
  rosePineTheme,
  silverTheme,
  cinnyLightTheme,
  cinnySilverTheme,
  gruvdarkTheme,
  accordTheme,
  blackTheme,
} from '../../colors.css';

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

const isHttpsThemeUrl = (u: string | undefined): u is string =>
  Boolean(u && /^https:\/\//i.test(u.trim()));

function parseRemoteKind(
  value: 'light' | 'dark' | undefined,
  fallback: ThemeKind
): ThemeKind {
  if (value === 'dark') return ThemeKind.Dark;
  if (value === 'light') return ThemeKind.Light;
  return fallback;
}

function makeRemoteTheme(url: string, kind: ThemeKind): Theme {
  const fw = kind === ThemeKind.Dark ? onDarkFontWeight : onLightFontWeight;
  return {
    id: REMOTE_THEME_ID,
    kind,
    classNames: ['sable-remote-theme', fw],
    remoteFullUrl: url.trim(),
  };
}

export const LightTheme: Theme = {
  id: 'light-theme',
  kind: ThemeKind.Light,
  classNames: ['light-theme', lightTheme, onLightFontWeight],
};

export const SilverTheme: Theme = {
  id: 'silver-theme',
  kind: ThemeKind.Light,
  classNames: ['silver-theme', silverTheme, onLightFontWeight],
};
export const CinnyLightTheme: Theme = {
  id: 'cinny-light-theme',
  kind: ThemeKind.Light,
  classNames: ['cinny-light-theme', cinnyLightTheme, onLightFontWeight],
};
export const CinnySilverTheme: Theme = {
  id: 'cinny-silver-theme',
  kind: ThemeKind.Light,
  classNames: ['cinny-silver-theme', cinnySilverTheme, onLightFontWeight],
};
export const DarkTheme: Theme = {
  id: 'dark-theme',
  kind: ThemeKind.Dark,
  classNames: ['dark-theme', darkTheme, onDarkFontWeight],
};
export const ButterTheme: Theme = {
  id: 'butter-theme',
  kind: ThemeKind.Dark,
  classNames: ['butter-theme', butterTheme, onDarkFontWeight],
};
export const RosePineTheme: Theme = {
  id: 'rose-pine-theme',
  kind: ThemeKind.Dark,
  classNames: ['rose-pine-theme', rosePineTheme, onDarkFontWeight],
};

export const GruvdarkTheme: Theme = {
  id: 'gruvdark-theme',
  kind: ThemeKind.Dark,
  classNames: ['gruvdark-theme', gruvdarkTheme, onDarkFontWeight],
};

export const CinnyDarkTheme: Theme = {
  id: 'cinny-dark-theme',
  kind: ThemeKind.Dark,
  classNames: ['cinny-dark-theme', cinnyDarkTheme, onDarkFontWeight],
};

export const AccordTheme: Theme = {
  id: 'accord-theme',
  kind: ThemeKind.Dark,
  classNames: ['accord-theme', accordTheme, onDarkFontWeight],
};

export const BlackTheme: Theme = {
  id: 'black-theme',
  kind: ThemeKind.Dark,
  classNames: ['black-theme', blackTheme, onDarkFontWeight],
};

export const useThemes = (): Theme[] => {
  const themes: Theme[] = useMemo(
    () => [
      LightTheme,
      SilverTheme,
      CinnyLightTheme,
      CinnySilverTheme,
      DarkTheme,
      ButterTheme,
      RosePineTheme,
      CinnyDarkTheme,
      GruvdarkTheme,
      AccordTheme,
      BlackTheme,
    ],
    []
  );

  return themes;
};

export const useThemeNames = (): Record<string, string> =>
  useMemo(
    () => ({
      [LightTheme.id]: 'Light',
      [SilverTheme.id]: 'Silver',
      [CinnyLightTheme.id]: 'Cinny Light',
      [CinnySilverTheme.id]: 'Cinny Silver',
      [DarkTheme.id]: 'Dark',
      [ButterTheme.id]: 'Butter',
      [CinnyDarkTheme.id]: 'Cinny Dark',
      [RosePineTheme.id]: 'Rose Pine',
      [GruvdarkTheme.id]: 'GruvDark',
      [AccordTheme.id]: 'Accord',
      [BlackTheme.id]: 'Black',
    }),
    []
  );

export const useSystemThemeKind = (): ThemeKind => {
  const darkModeQueryList = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [themeKind, setThemeKind] = useState<ThemeKind>(
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
    if (isHttpsThemeUrl(manualRemoteUrl)) {
      const inferred =
        themeId === 'dark-theme'
          ? ThemeKind.Dark
          : themeId === 'light-theme'
            ? ThemeKind.Light
            : ThemeKind.Light;
      return makeRemoteTheme(
        manualRemoteUrl,
        parseRemoteKind(manualRemoteKind, inferred)
      );
    }
    return themes.find((theme) => theme.id === themeId) ?? LightTheme;
  }

  const isDark = systemThemeKind === ThemeKind.Dark;
  const slotRemoteUrl = isDark ? darkRemoteUrl : lightRemoteUrl;
  if (isHttpsThemeUrl(slotRemoteUrl)) {
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
