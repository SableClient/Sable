import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { atom } from 'jotai';

import { ThemeKind, type Theme } from '$hooks/useTheme';
import { AuthRouteThemeManager, UnAuthRouteThemeManager } from './ThemeManager';

const settings = {
  saturationLevel: 100,
  underlineLinks: false,
  reducedMotion: false,
  themeRemoteEnabledTweakFullUrls: [] as string[],
};
let storedThemeCssByUrl: Record<string, string> = {};
let storedTweakCssByUrls: Record<string, string> = {};

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
  settingsInitializedAtom: atom(false),
}));

vi.mock('$plugins/arborium', () => ({
  ArboriumThemeBridge: ({ kind, children }: ArboriumThemeBridgeProps) =>
    kind === ThemeKind.Dark ? <>{children}</> : <>{children}</>,
}));

vi.mock('$app/theme/cache', () => ({
  getCachedThemeCss: vi.fn<() => Promise<string | undefined>>(),
  putCachedThemeCss: vi.fn<() => Promise<void>>(),
  putStoredAppliedThemeCss: vi.fn<() => void>(),
  putStoredAppliedTweakCss: vi.fn<() => void>(),
  clearStoredAppliedThemeCss: vi.fn<() => void>(),
  clearStoredAppliedTweakCss: vi.fn<() => void>(),
  getStoredAppliedThemeCss: (url: string) => storedThemeCssByUrl[url],
  getStoredAppliedTweakCss: (urls: string[]) => storedTweakCssByUrls[urls.join('\n')],
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
  storedThemeCssByUrl = {};
  storedTweakCssByUrls = {};
  document.body.className = '';
  document.body.style.filter = '';
  document.getElementById('sable-remote-theme-style')?.remove();
  document.getElementById('sable-remote-tweaks-style')?.remove();
});

afterEach(() => {
  document.body.className = '';
  document.body.style.filter = '';
  document.getElementById('sable-remote-theme-style')?.remove();
  document.getElementById('sable-remote-tweaks-style')?.remove();
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

  it('applies the active theme before synced settings initialize', () => {
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

    expect(document.documentElement.dataset.sableBootTheme).toBe('dark');
    expect(document.body).toHaveClass('test-dark-theme');
  });

  it('reapplies cached remote theme css before synced settings initialize', () => {
    const remoteThemeUrl = 'https://themes.example/dark.css';
    activeTheme = {
      id: 'test-remote',
      kind: ThemeKind.Dark,
      classNames: ['test-dark-theme'],
      remoteFullUrl: remoteThemeUrl,
    };
    storedThemeCssByUrl[remoteThemeUrl] = 'body { --remote-theme: 1; }';

    render(
      <AuthRouteThemeManager>
        <div>child</div>
      </AuthRouteThemeManager>
    );

    expect(document.getElementById('sable-remote-theme-style')?.textContent).toBe(
      'body { --remote-theme: 1; }'
    );
  });

  it('reapplies cached remote tweak css before synced settings initialize', () => {
    settings.themeRemoteEnabledTweakFullUrls = ['https://themes.example/tweak-a.css'];
    storedTweakCssByUrls['https://themes.example/tweak-a.css'] = 'body { --remote-tweak: 1; }';

    render(
      <AuthRouteThemeManager>
        <div>child</div>
      </AuthRouteThemeManager>
    );

    expect(document.getElementById('sable-remote-tweaks-style')?.textContent).toBe(
      'body { --remote-tweak: 1; }'
    );
  });
});
