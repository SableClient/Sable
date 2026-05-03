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
};

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

  if (!systemTheme) {
    const selectedTheme = themes.find((theme) => theme.id === themeId) ?? LightTheme;

    return selectedTheme;
  }

  const selectedTheme =
    systemThemeKind === ThemeKind.Dark
      ? (themes.find((theme) => theme.id === darkThemeId) ?? DarkTheme)
      : (themes.find((theme) => theme.id === lightThemeId) ?? LightTheme);

  return selectedTheme;
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
