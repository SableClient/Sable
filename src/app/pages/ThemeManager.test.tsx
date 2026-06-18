import type { ReactNode } from 'react';
import type * as Jotai from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { atom } from 'jotai';

import { ThemeKind, type Theme } from '$hooks/useTheme';
import { AuthRouteThemeManager, UnAuthRouteThemeManager } from './ThemeManager';
import {
  clearStoredAppliedThemeCss,
  clearStoredAppliedTweakCss,
  getCachedThemeCss,
} from '$app/theme/cache';

const settings = {
  saturationLevel: 100,
  underlineLinks: false,
  reducedMotion: false,
  useSystemTheme: false,
  themeRemoteLightFullUrl: undefined as string | undefined,
  themeRemoteDarkFullUrl: undefined as string | undefined,
  themeRemoteEnabledTweakFullUrls: [] as string[],
};
let storedThemeCssByUrl: Record<string, string> = {};
let storedTweakCssByUrls: Record<string, string> = {};

let systemThemeKind = ThemeKind.Light;
let settingsInitialized = false;
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

vi.mock('jotai', async () => {
  const actual = await vi.importActual<typeof Jotai>('jotai');
  return {
    ...actual,
    useAtomValue: () => settingsInitialized,
  };
});

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
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  systemThemeKind = ThemeKind.Light;
  settingsInitialized = false;
  activeTheme = {
    id: 'test-light',
    kind: ThemeKind.Light,
    classNames: ['test-light-theme'],
  };
  settings.saturationLevel = 100;
  settings.underlineLinks = false;
  settings.reducedMotion = false;
  settings.useSystemTheme = false;
  settings.themeRemoteLightFullUrl = undefined;
  settings.themeRemoteDarkFullUrl = undefined;
  settings.themeRemoteEnabledTweakFullUrls = [];
  storedThemeCssByUrl = {};
  storedTweakCssByUrls = {};
  document.body.className = '';
  document.body.style.filter = '';
  document.getElementById('sable-remote-theme-style')?.remove();
  document.getElementById('sable-remote-tweaks-style')?.remove();
});

afterEach(() => {
  vi.unstubAllGlobals();
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

  it('clears preboot remote styles for unauthenticated routes', () => {
    const themeStyle = document.createElement('style');
    themeStyle.id = 'sable-remote-theme-style';
    themeStyle.textContent = 'body { --preboot-theme: 1; }';
    document.head.appendChild(themeStyle);

    const tweaksStyle = document.createElement('style');
    tweaksStyle.id = 'sable-remote-tweaks-style';
    tweaksStyle.textContent = 'body { --preboot-tweak: 1; }';
    document.head.appendChild(tweaksStyle);

    render(<UnAuthRouteThemeManager />);

    expect(document.getElementById('sable-remote-theme-style')).toBeNull();
    expect(document.getElementById('sable-remote-tweaks-style')).toBeNull();
  });

  it('applies the active theme classes for authenticated routes', () => {
    settingsInitialized = true;
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

  it('does not clear preboot remote theme css before synced settings initialize', () => {
    const existing = document.createElement('style');
    existing.id = 'sable-remote-theme-style';
    existing.textContent = 'body { --preboot-theme: 1; }';
    document.head.appendChild(existing);

    activeTheme = {
      id: 'test-remote',
      kind: ThemeKind.Dark,
      classNames: ['test-dark-theme'],
      remoteFullUrl: 'https://themes.example/dark.css',
    };

    render(
      <AuthRouteThemeManager>
        <div>child</div>
      </AuthRouteThemeManager>
    );

    expect(document.getElementById('sable-remote-theme-style')?.textContent).toBe(
      'body { --preboot-theme: 1; }'
    );
  });

  it('reappends cached remote styles after app styles when settings initialize', () => {
    settingsInitialized = true;
    const appStyle = document.createElement('style');
    appStyle.id = 'app-style';
    appStyle.textContent = 'body { color: red; }';
    document.head.appendChild(appStyle);

    const existing = document.createElement('style');
    existing.id = 'sable-remote-theme-style';
    existing.textContent = 'body { --preboot-theme: 1; }';
    document.head.insertBefore(existing, appStyle);

    storedThemeCssByUrl['https://themes.example/dark.css'] = 'body { --cached-theme: 1; }';
    activeTheme = {
      id: 'test-remote',
      kind: ThemeKind.Dark,
      classNames: ['test-dark-theme'],
      remoteFullUrl: 'https://themes.example/dark.css',
    };

    vi.mocked(getCachedThemeCss).mockResolvedValue('body { --cached-theme: 1; }');

    render(
      <AuthRouteThemeManager>
        <div>child</div>
      </AuthRouteThemeManager>
    );

    expect(document.head.lastElementChild?.id).toBe('sable-remote-theme-style');
  });

  it('keeps tweak styles after theme styles when both are present', async () => {
    settingsInitialized = true;
    const appStyle = document.createElement('style');
    appStyle.id = 'app-style';
    appStyle.textContent = 'body { color: red; }';
    document.head.appendChild(appStyle);

    const themeStyle = document.createElement('style');
    themeStyle.id = 'sable-remote-theme-style';
    themeStyle.textContent = 'body { --preboot-theme: 1; }';
    document.head.insertBefore(themeStyle, appStyle);

    const tweaksStyle = document.createElement('style');
    tweaksStyle.id = 'sable-remote-tweaks-style';
    tweaksStyle.textContent = 'body { --preboot-tweak: 1; }';
    document.head.insertBefore(tweaksStyle, appStyle);

    storedThemeCssByUrl['https://themes.example/dark.css'] = 'body { --cached-theme: 1; }';
    storedTweakCssByUrls['https://themes.example/tweak.css'] = 'body { --cached-tweak: 1; }';
    settings.themeRemoteEnabledTweakFullUrls = ['https://themes.example/tweak.css'];
    activeTheme = {
      id: 'test-remote',
      kind: ThemeKind.Dark,
      classNames: ['test-dark-theme'],
      remoteFullUrl: 'https://themes.example/dark.css',
    };

    render(
      <AuthRouteThemeManager>
        <div>child</div>
      </AuthRouteThemeManager>
    );

    const themeNode = document.getElementById('sable-remote-theme-style');
    const tweaksNode = document.getElementById('sable-remote-tweaks-style');

    expect(themeNode?.nextElementSibling).toBe(tweaksNode);
    expect(document.head.lastElementChild?.id).toBe('sable-remote-tweaks-style');
  });

  it('clears stale stored remote theme css when the fetch returns no css', async () => {
    settingsInitialized = true;
    storedThemeCssByUrl['https://themes.example/dark.css'] = 'body { --cached-theme: 1; }';
    activeTheme = {
      id: 'test-remote',
      kind: ThemeKind.Dark,
      classNames: ['test-dark-theme'],
      remoteFullUrl: 'https://themes.example/dark.css',
    };

    vi.mocked(getCachedThemeCss).mockResolvedValue(undefined);
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      text: async () => '',
    } as Response);

    render(
      <AuthRouteThemeManager>
        <div>child</div>
      </AuthRouteThemeManager>
    );

    await vi.waitFor(() => {
      expect(clearStoredAppliedThemeCss).toHaveBeenCalled();
    });
    expect(document.getElementById('sable-remote-theme-style')).toBeNull();
  });

  it('clears stale stored remote tweak css when all fetches return no css', async () => {
    settingsInitialized = true;
    settings.themeRemoteEnabledTweakFullUrls = ['https://themes.example/tweak.css'];
    storedTweakCssByUrls['https://themes.example/tweak.css'] = 'body { --cached-tweak: 1; }';

    vi.mocked(getCachedThemeCss).mockResolvedValue(undefined);
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      text: async () => '',
    } as Response);

    render(
      <AuthRouteThemeManager>
        <div>child</div>
      </AuthRouteThemeManager>
    );

    await vi.waitFor(() => {
      expect(clearStoredAppliedTweakCss).toHaveBeenCalled();
    });
    expect(document.getElementById('sable-remote-tweaks-style')).toBeNull();
  });

  it('preserves the applied theme snapshot when the inactive system slot is remote', () => {
    settingsInitialized = true;
    settings.useSystemTheme = true;
    settings.themeRemoteLightFullUrl = 'https://themes.example/light.css';
    systemThemeKind = ThemeKind.Dark;
    storedThemeCssByUrl['https://themes.example/light.css'] = 'body { --cached-theme: 1; }';
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

    expect(clearStoredAppliedThemeCss).not.toHaveBeenCalled();
    expect(document.getElementById('sable-remote-theme-style')).toBeNull();
  });

  it('preserves active remote css on transient fetch errors', async () => {
    settingsInitialized = true;
    storedThemeCssByUrl['https://themes.example/dark.css'] = 'body { --cached-theme: 1; }';
    activeTheme = {
      id: 'test-remote',
      kind: ThemeKind.Dark,
      classNames: ['test-dark-theme'],
      remoteFullUrl: 'https://themes.example/dark.css',
    };

    vi.mocked(getCachedThemeCss).mockResolvedValue(undefined);
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));

    render(
      <AuthRouteThemeManager>
        <div>child</div>
      </AuthRouteThemeManager>
    );

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    expect(clearStoredAppliedThemeCss).not.toHaveBeenCalled();
    expect(document.getElementById('sable-remote-theme-style')?.textContent).toBe(
      'body { --cached-theme: 1; }'
    );
  });
});
