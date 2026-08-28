import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getCachedThemeCss, putCachedThemeCss } = vi.hoisted(() => ({
  getCachedThemeCss: vi.fn<() => Promise<string | undefined>>(),
  putCachedThemeCss: vi.fn<() => Promise<void>>(),
}));

type TweakFavorite = {
  fullUrl: string;
  displayName: string;
  basename: string;
  importedLocal: boolean;
  cssText?: string;
};

const settings = {
  themeRemoteFavorites: [],
  themeRemoteTweakFavorites: [
    {
      fullUrl: 'sable-import://tweak/restored/full.sable.css',
      displayName: 'Fallback name',
      basename: 'restored',
      importedLocal: true,
      cssText: '/*\n@sable-tweak\nname: Restored tweak\n*/\n.restored {}',
    },
  ] as TweakFavorite[],
  themeRemoteEnabledTweakFullUrls: [],
  useSystemTheme: false,
  themeRemoteManualFullUrl: undefined,
  themeRemoteLightFullUrl: undefined,
  themeRemoteDarkFullUrl: undefined,
  themeChatSableWidgetsEnabled: false,
  themeChatAutoPreviewApprovedUrls: [],
  themeChatAutoPreviewAnyUrl: false,
};

vi.mock('$state/hooks/settings', () => ({
  useSetting: (_atom: unknown, key: keyof typeof settings) => [
    settings[key],
    vi.fn<(value: unknown) => void>(),
  ],
}));
vi.mock('$state/settings', () => ({
  settingsAtom: {},
  getSettings: () => ({
    iconCompactSizePx: 16,
    iconInlineSizePx: 20,
    iconToolbarSizePx: 24,
    iconEmptySizePx: 32,
  }),
}));
vi.mock('$hooks/useClientConfig', () => ({ useClientConfig: () => ({}) }));
vi.mock('$utils/share', () => ({
  shareText: vi.fn<(text: string) => Promise<boolean>>().mockResolvedValue(false),
}));
vi.mock('../../../theme/cache', () => ({
  getCachedThemeCss,
  putCachedThemeCss,
}));

import { ThemeCatalogSettings } from './ThemeCatalogSettings';

describe('ThemeCatalogSettings saved tweaks', () => {
  beforeEach(() => {
    getCachedThemeCss.mockRejectedValue(new Error('no cache'));
    putCachedThemeCss.mockRejectedValue(new Error('no cache'));
  });

  afterEach(() => {
    settings.themeRemoteTweakFavorites = [
      {
        fullUrl: 'sable-import://tweak/restored/full.sable.css',
        displayName: 'Fallback name',
        basename: 'restored',
        importedLocal: true,
        cssText: '/*\n@sable-tweak\nname: Restored tweak\n*/\n.restored {}',
      },
    ];
    getCachedThemeCss.mockReset().mockRejectedValue(new Error('no cache'));
    putCachedThemeCss.mockReset().mockRejectedValue(new Error('no cache'));
  });

  it('lists restored embedded local CSS when the cache is unavailable', async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ThemeCatalogSettings mode="local" />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByText('Tweaks (1)'));
    expect(await screen.findByText('Restored tweak')).toBeInTheDocument();
  });

  it('shows zero and migration guidance for a fresh body-less legacy tweak', async () => {
    settings.themeRemoteTweakFavorites = [
      {
        fullUrl: 'sable-import://tweak/legacy/full.sable.css',
        displayName: 'Legacy',
        basename: 'legacy',
        importedLocal: true,
      },
    ];
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ThemeCatalogSettings mode="local" />
      </QueryClientProvider>
    );
    expect(screen.getByText('Tweaks (0)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Tweaks (0)'));
    expect(await screen.findByText(/waiting to migrate/)).toBeInTheDocument();
  });

  it('counts a cache-resolved legacy tweak without migration guidance', async () => {
    settings.themeRemoteTweakFavorites = [
      {
        fullUrl: 'sable-import://tweak/legacy/full.sable.css',
        displayName: 'Legacy',
        basename: 'legacy',
        importedLocal: true,
      },
    ];
    getCachedThemeCss.mockResolvedValue('/*\n@sable-tweak\nname: Cached legacy\n*/\n.cached {}');
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ThemeCatalogSettings mode="local" />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByText('Tweaks (0)'));
    expect(await screen.findByText('Cached legacy')).toBeInTheDocument();
    expect(screen.getByText('Tweaks (1)')).toBeInTheDocument();
    expect(screen.queryByText(/waiting to migrate/)).not.toBeInTheDocument();
  });
});
