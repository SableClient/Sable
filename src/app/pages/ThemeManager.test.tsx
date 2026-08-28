import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

import { ThemeKind, type Theme } from '$hooks/useTheme';
import { AuthRouteThemeManager, UnAuthRouteThemeManager } from './ThemeManager';

const settings = {
  saturationLevel: 100,
  underlineLinks: false,
  reducedMotion: false,
  themeRemoteEnabledTweakFullUrls: [] as string[],
  themeRemoteTweakFavorites: [] as {
    fullUrl: string;
    displayName: string;
    basename: string;
    cssText?: string;
  }[],
};

let systemThemeKind = ThemeKind.Light;
let activeTheme: Theme = {
  id: 'test-light',
  kind: ThemeKind.Light,
  classNames: ['test-light-theme'],
};
let cachedCss = '';
let cacheUpdateListener: ((update: { url: string; contentHash: string }) => void) | undefined;

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

vi.mock('../theme/cache', () => ({
  getCachedThemeCss: vi.fn<(url: string) => Promise<string | undefined>>(async () =>
    cachedCss ? cachedCss : undefined
  ),
  putCachedThemeCss: vi.fn<(url: string, cssText: string) => Promise<void>>(async () => undefined),
  subscribeThemeCacheUpdates: vi.fn<
    (listener: (update: { url: string; contentHash: string }) => void) => () => void
  >((listener: (update: { url: string; contentHash: string }) => void) => {
    cacheUpdateListener = listener;
    return () => {
      cacheUpdateListener = undefined;
    };
  }),
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
  settings.themeRemoteTweakFavorites = [];
  cachedCss = '';
  cacheUpdateListener = undefined;
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

  it('reloads active CSS when the cached content changes without a URL change', async () => {
    const themeUrl = 'https://catalog.example/theme.sable.css';
    cachedCss = 'body { --sable-primary-main: red; }';
    activeTheme = {
      id: 'test-remote',
      kind: ThemeKind.Dark,
      classNames: ['test-dark-theme'],
      remoteFullUrl: themeUrl,
    };

    render(
      <AuthRouteThemeManager>
        <div>child</div>
      </AuthRouteThemeManager>
    );

    await waitFor(() =>
      expect(document.getElementById('sable-remote-theme-style')).toHaveTextContent('red')
    );
    cachedCss = 'body { --sable-primary-main: blue; }';
    cacheUpdateListener?.({ url: themeUrl, contentHash: 'new-hash' });
    await waitFor(() =>
      expect(document.getElementById('sable-remote-theme-style')).toHaveTextContent('blue')
    );
  });

  it('applies embedded CSS for a restored local tweak when the cache is unavailable', async () => {
    const tweakUrl = 'sable-import://tweak/restored/full.sable.css';
    settings.themeRemoteEnabledTweakFullUrls = [tweakUrl];
    settings.themeRemoteTweakFavorites = [
      {
        fullUrl: tweakUrl,
        displayName: 'Restored',
        basename: 'restored',
        cssText: '.restored { color: red; }',
      },
    ];

    render(
      <AuthRouteThemeManager>
        <div>child</div>
      </AuthRouteThemeManager>
    );

    await waitFor(() =>
      expect(document.getElementById('sable-remote-tweaks-style')).toHaveTextContent('color: red')
    );
  });
});
