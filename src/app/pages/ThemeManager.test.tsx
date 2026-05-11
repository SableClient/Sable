import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import { ThemeKind, type Theme } from '$hooks/useTheme';
import { AuthRouteThemeManager, UnAuthRouteThemeManager } from './ThemeManager';

const settings = {
  saturationLevel: 100,
  underlineLinks: false,
  reducedMotion: false,
  themeRemoteEnabledTweakFullUrls: [] as string[],
};

let systemThemeKind = ThemeKind.Light;
let activeTheme: Theme = {
  id: 'test-light',
  kind: ThemeKind.Light,
  classNames: ['test-light-theme'],
};

type ThemeContextProviderProps = {
  value: Theme;
  children: ReactNode;
};

type ArboriumThemeBridgeProps = {
  kind: ThemeKind;
  children?: ReactNode;
};

vi.mock('$hooks/useTheme', () => ({
  ThemeKind: {
    Light: 'light',
    Dark: 'dark',
  },
  DarkTheme: {
    classNames: ['test-dark-theme'],
  },
  LightTheme: {
    classNames: ['test-light-theme'],
  },
  ThemeContextProvider: ({ value, children }: ThemeContextProviderProps) =>
    value.kind === ThemeKind.Dark ? <>{children}</> : <>{children}</>,
  useActiveTheme: () => activeTheme,
  useSystemThemeKind: () => systemThemeKind,
}));

vi.mock('$state/hooks/settings', () => ({
  useSetting: (_atom: unknown, key: keyof typeof settings) => [settings[key]],
}));

vi.mock('$state/settings', () => ({
  settingsAtom: {},
}));

vi.mock('$plugins/arborium', () => ({
  ArboriumThemeBridge: ({ kind, children }: ArboriumThemeBridgeProps) =>
    kind === ThemeKind.Dark ? <>{children}</> : <>{children}</>,
}));

beforeEach(() => {
  systemThemeKind = ThemeKind.Light;
  activeTheme = {
    id: 'test-light',
    kind: ThemeKind.Light,
    classNames: ['test-light-theme'],
  };
  settings.saturationLevel = 100;
  settings.underlineLinks = false;
  settings.reducedMotion = false;
  settings.themeRemoteEnabledTweakFullUrls = [];
  document.body.className = '';
  document.body.style.filter = '';
});

afterEach(() => {
  document.body.className = '';
  document.body.style.filter = '';
});

describe('ThemeManager', () => {
  it('applies the system theme classes for unauthenticated routes', () => {
    systemThemeKind = ThemeKind.Dark;

    render(<UnAuthRouteThemeManager />);

    expect(document.body).toHaveClass('test-dark-theme');
    expect(document.body).not.toHaveClass('test-light-theme');
  });

  it('applies the active theme classes for authenticated routes', () => {
    activeTheme = {
      id: 'test-dark',
      kind: ThemeKind.Dark,
      classNames: ['test-dark-theme'],
    };

    render(
      <AuthRouteThemeManager>
        <div>child</div>
      </AuthRouteThemeManager>
    );

    expect(document.body).toHaveClass('test-dark-theme');
    expect(document.body).not.toHaveClass('test-light-theme');
  });
});
