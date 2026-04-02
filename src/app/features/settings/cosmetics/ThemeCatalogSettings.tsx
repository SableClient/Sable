import { type ChangeEventHandler, useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Button, Chip, Input, Spinner, Switch, Text, toRem } from 'folds';
import { useStore } from 'jotai/react';

import { useClientConfig } from '$hooks/useClientConfig';
import { ThemeKind } from '$hooks/useTheme';
import { trimTrailingSlash } from '$utils/common';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom, type Settings, type ThemeRemoteFavorite } from '$state/settings';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { ThemePreviewCard } from '$components/theme/ThemePreviewCard';
import { putCachedThemeCss } from '../../../theme/cache';
import { listThemePairsFromCatalog, type ThemePair } from '../../../theme/catalog';
import {
  extractFullThemeUrlFromPreview,
  parseSableThemeMetadata,
  type SableThemeContrast,
} from '../../../theme/metadata';

const DEFAULT_CATALOG_BASE = 'https://raw.githubusercontent.com/SableClient/themes/main/';

export type CatalogPreviewRow = ThemePair & {
  previewText: string;
  displayName: string;
  author?: string;
  kind: ThemeKind;
  contrast: SableThemeContrast;
  tags: string[];
  fullInstallUrl: string;
};

export type LocalPreviewRow = ThemeRemoteFavorite & {
  previewUrl: string;
  previewText: string;
  displayName: string;
  author?: string;
  contrast: SableThemeContrast;
  tags: string[];
};

function previewUrlFromFullThemeUrl(fullUrl: string): string | undefined {
  if (!/\.sable\.css$/i.test(fullUrl)) return undefined;
  return fullUrl.replace(/\.sable\.css$/i, '.preview.sable.css');
}

export function usePatchSettings() {
  const store = useStore();
  return useCallback(
    (partial: Partial<Settings>) => {
      const next = { ...store.get(settingsAtom), ...partial };
      store.set(settingsAtom, next);
    },
    [store]
  );
}

export type ThemeCatalogSettingsMode = 'full' | 'local' | 'chat' | 'remote';

export function ThemeCatalogSettings({ mode = 'full' }: { mode?: ThemeCatalogSettingsMode }) {
  const clientConfig = useClientConfig();
  const patchSettings = usePatchSettings();
  const configBase = clientConfig.themeCatalogBaseUrl?.trim();
  const catalogBase = `${trimTrailingSlash(configBase && configBase.length > 0 ? configBase : DEFAULT_CATALOG_BASE)}/`;

  const isRemoteMode = mode === 'remote' || mode === 'full';
  const isChatMode = mode === 'chat' || mode === 'full';
  const isLocalMode = mode === 'local' || mode === 'full';

  const [favorites] = useSetting(settingsAtom, 'themeRemoteFavorites');
  const [systemTheme, setSystemTheme] = useSetting(settingsAtom, 'useSystemTheme');
  const [manualRemoteFullUrl] = useSetting(settingsAtom, 'themeRemoteManualFullUrl');
  const [lightRemoteFullUrl] = useSetting(settingsAtom, 'themeRemoteLightFullUrl');
  const [darkRemoteFullUrl] = useSetting(settingsAtom, 'themeRemoteDarkFullUrl');
  const [chatAny, setChatAny] = useSetting(settingsAtom, 'themeChatPreviewAnyUrl');
  const [chatApprovedOnly, setChatApprovedOnly] = useSetting(
    settingsAtom,
    'themeChatPreviewApprovedCatalogOnly'
  );

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'light' | 'dark'>('all');
  const [contrastFilter, setContrastFilter] = useState<'all' | SableThemeContrast>('all');

  const onSearchChange: ChangeEventHandler<HTMLInputElement> = (e) => setSearch(e.target.value);

  const activeUrls = useMemo(
    () =>
      [manualRemoteFullUrl, lightRemoteFullUrl, darkRemoteFullUrl].filter((u): u is string =>
        Boolean(u && u.trim().length > 0)
      ),
    [darkRemoteFullUrl, lightRemoteFullUrl, manualRemoteFullUrl]
  );

  const pruneFavorites = useCallback(
    (nextFavorites: ThemeRemoteFavorite[], nextActiveUrls: string[]) => {
      const active = new Set(nextActiveUrls);
      return nextFavorites.filter((f) => f.pinned === true || active.has(f.fullUrl));
    },
    []
  );

  const clearAssignmentsIfMatch = useCallback(
    (fullUrl: string) => {
      const partial: Partial<Settings> = {};
      if (lightRemoteFullUrl === fullUrl) {
        partial.themeRemoteLightFullUrl = undefined;
        partial.themeRemoteLightKind = undefined;
      }
      if (darkRemoteFullUrl === fullUrl) {
        partial.themeRemoteDarkFullUrl = undefined;
        partial.themeRemoteDarkKind = undefined;
      }
      if (manualRemoteFullUrl === fullUrl) {
        partial.themeRemoteManualFullUrl = undefined;
        partial.themeRemoteManualKind = undefined;
      }
      return partial;
    },
    [darkRemoteFullUrl, lightRemoteFullUrl, manualRemoteFullUrl]
  );

  const pairsQuery = useQuery({
    queryKey: ['theme-catalog-pairs', catalogBase],
    queryFn: () => listThemePairsFromCatalog(catalogBase),
    enabled: isRemoteMode,
    staleTime: 5 * 60_000,
  });

  const previewsQuery = useQuery({
    queryKey: [
      'theme-catalog-previews',
      catalogBase,
      pairsQuery.data?.map((p) => p.previewUrl).join('|') ?? '',
    ],
    queryFn: async (): Promise<CatalogPreviewRow[]> => {
      const pairs = pairsQuery.data ?? [];
      const rows = await Promise.all(
        pairs.map(async (pair) => {
          const res = await fetch(pair.previewUrl, { mode: 'cors' });
          const previewText = res.ok ? await res.text() : '';
          const meta = parseSableThemeMetadata(previewText);
          const fullFromMeta = extractFullThemeUrlFromPreview(previewText);
          const fullInstallUrl =
            fullFromMeta && /^https:\/\//i.test(fullFromMeta) ? fullFromMeta : pair.fullUrl;
          const kind = meta.kind ?? ThemeKind.Light;
          const contrast: SableThemeContrast = meta.contrast === 'high' ? 'high' : 'low';
          return {
            ...pair,
            previewText,
            displayName: meta.name?.trim() || pair.basename,
            author: meta.author?.trim() || undefined,
            kind,
            contrast,
            tags: meta.tags ?? [],
            fullInstallUrl,
          };
        })
      );
      return rows;
    },
    enabled: isRemoteMode && Boolean(pairsQuery.data?.length),
    staleTime: 10 * 60_000,
  });

  const filteredRows = useMemo(() => {
    const rows = previewsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (kindFilter !== 'all') {
        const want = kindFilter === 'dark' ? ThemeKind.Dark : ThemeKind.Light;
        if (row.kind !== want) return false;
      }
      if (contrastFilter !== 'all' && row.contrast !== contrastFilter) return false;
      if (q) {
        const hay = `${row.displayName} ${row.basename} ${row.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [previewsQuery.data, search, kindFilter, contrastFilter]);

  const localPreviewsQuery = useQuery({
    queryKey: ['theme-local-previews', favorites.map((f) => f.fullUrl).join('|')],
    enabled: isLocalMode && favorites.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<LocalPreviewRow[]> => {
      const rows = await Promise.all(
        favorites.map(async (fav) => {
          const previewUrl = previewUrlFromFullThemeUrl(fav.fullUrl);
          if (!previewUrl) return undefined;

          try {
            const res = await fetch(previewUrl, { mode: 'cors' });
            if (!res.ok) return undefined;
            const previewText = await res.text();
            const meta = parseSableThemeMetadata(previewText);
            const displayName = meta.name?.trim() || fav.displayName || fav.basename;
            const contrast: SableThemeContrast = meta.contrast === 'high' ? 'high' : 'low';
            return {
              ...fav,
              previewUrl,
              previewText,
              displayName,
              author: meta.author?.trim() || undefined,
              contrast,
              tags: meta.tags ?? [],
            };
          } catch {
            return undefined;
          }
        })
      );

      return rows.filter((r): r is LocalPreviewRow => Boolean(r));
    },
  });

  const removeFavorite = useCallback(
    (fullUrl: string) => {
      const nextFavorites = favorites.filter((f) => f.fullUrl !== fullUrl);
      const cleared = clearAssignmentsIfMatch(fullUrl);
      const nextActive = [manualRemoteFullUrl, lightRemoteFullUrl, darkRemoteFullUrl]
        .filter((u): u is string => Boolean(u && u.trim().length > 0))
        .filter((u) => u !== fullUrl);
      patchSettings({
        ...cleared,
        themeRemoteFavorites: pruneFavorites(nextFavorites, nextActive),
      });
    },
    [
      clearAssignmentsIfMatch,
      darkRemoteFullUrl,
      favorites,
      lightRemoteFullUrl,
      manualRemoteFullUrl,
      patchSettings,
      pruneFavorites,
    ]
  );

  const applyFavoriteToLight = useCallback(
    (row: LocalPreviewRow) => {
      patchSettings({
        themeRemoteLightFullUrl: row.fullUrl,
        themeRemoteLightKind: row.kind,
      });
    },
    [patchSettings]
  );

  const applyFavoriteToDark = useCallback(
    (row: LocalPreviewRow) => {
      patchSettings({
        themeRemoteDarkFullUrl: row.fullUrl,
        themeRemoteDarkKind: row.kind,
      });
    },
    [patchSettings]
  );

  const applyFavoriteToManual = useCallback(
    (row: LocalPreviewRow) => {
      patchSettings({
        themeRemoteManualFullUrl: row.fullUrl,
        themeRemoteManualKind: row.kind,
      });
    },
    [patchSettings]
  );

  const useBuiltinForLightSlot = useCallback(
    () =>
      patchSettings({
        themeRemoteLightFullUrl: undefined,
        themeRemoteLightKind: undefined,
      }),
    [patchSettings]
  );

  const useBuiltinForDarkSlot = useCallback(
    () =>
      patchSettings({
        themeRemoteDarkFullUrl: undefined,
        themeRemoteDarkKind: undefined,
      }),
    [patchSettings]
  );

  const useBuiltinForManualLight = useCallback(
    () =>
      patchSettings({
        themeRemoteManualFullUrl: undefined,
        themeRemoteManualKind: undefined,
        themeId: 'light-theme',
      }),
    [patchSettings]
  );

  const useBuiltinForManualDark = useCallback(
    () =>
      patchSettings({
        themeRemoteManualFullUrl: undefined,
        themeRemoteManualKind: undefined,
        themeId: 'dark-theme',
      }),
    [patchSettings]
  );

  const prefetchFull = useCallback(async (url: string): Promise<boolean> => {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) return false;
      const text = await res.text();
      await putCachedThemeCss(url, text);
      return true;
    } catch {
      return false;
    }
  }, []);

  const toggleFavorite = useCallback(
    async (row: CatalogPreviewRow) => {
      const existing = favorites.find((f: ThemeRemoteFavorite) => f.fullUrl === row.fullInstallUrl);
      if (existing) {
        const nextFavorites = favorites.filter((f) => f.fullUrl !== row.fullInstallUrl);
        const cleared = clearAssignmentsIfMatch(row.fullInstallUrl);
        const nextActive = activeUrls.filter((u) => u !== row.fullInstallUrl);
        patchSettings({
          ...cleared,
          themeRemoteFavorites: pruneFavorites(nextFavorites, nextActive),
        });
        return;
      }
      const ok = await prefetchFull(row.fullInstallUrl);
      if (!ok) return;
      const kind: 'light' | 'dark' = row.kind === ThemeKind.Dark ? 'dark' : 'light';
      const next: ThemeRemoteFavorite = {
        fullUrl: row.fullInstallUrl,
        displayName: row.displayName,
        basename: row.basename,
        kind,
        pinned: true,
      };
      patchSettings({
        themeRemoteFavorites: [...favorites, next],
      });
    },
    [activeUrls, clearAssignmentsIfMatch, favorites, patchSettings, prefetchFull, pruneFavorites]
  );

  const installFromCatalogLight = useCallback(
    async (row: CatalogPreviewRow) => {
      const kind: 'light' | 'dark' = row.kind === ThemeKind.Dark ? 'dark' : 'light';
      const nextActive = Array.from(
        new Set(
          [manualRemoteFullUrl, darkRemoteFullUrl, row.fullInstallUrl].filter(Boolean) as string[]
        )
      );

      let nextFavorites = favorites;
      const existing = favorites.find((f) => f.fullUrl === row.fullInstallUrl);
      if (!existing) {
        const ok = await prefetchFull(row.fullInstallUrl);
        if (!ok) return;
        nextFavorites = [
          ...favorites,
          {
            fullUrl: row.fullInstallUrl,
            displayName: row.displayName,
            basename: row.basename,
            kind,
            pinned: false,
          },
        ];
      }

      patchSettings({
        themeRemoteLightFullUrl: row.fullInstallUrl,
        themeRemoteLightKind: kind,
        themeRemoteFavorites: pruneFavorites(nextFavorites, nextActive),
      });
    },
    [darkRemoteFullUrl, favorites, manualRemoteFullUrl, patchSettings, prefetchFull, pruneFavorites]
  );

  const installFromCatalogDark = useCallback(
    async (row: CatalogPreviewRow) => {
      const kind: 'light' | 'dark' = row.kind === ThemeKind.Dark ? 'dark' : 'light';
      const nextActive = Array.from(
        new Set(
          [manualRemoteFullUrl, lightRemoteFullUrl, row.fullInstallUrl].filter(Boolean) as string[]
        )
      );

      let nextFavorites = favorites;
      const existing = favorites.find((f) => f.fullUrl === row.fullInstallUrl);
      if (!existing) {
        const ok = await prefetchFull(row.fullInstallUrl);
        if (!ok) return;
        nextFavorites = [
          ...favorites,
          {
            fullUrl: row.fullInstallUrl,
            displayName: row.displayName,
            basename: row.basename,
            kind,
            pinned: false,
          },
        ];
      }

      patchSettings({
        themeRemoteDarkFullUrl: row.fullInstallUrl,
        themeRemoteDarkKind: kind,
        themeRemoteFavorites: pruneFavorites(nextFavorites, nextActive),
      });
    },
    [
      favorites,
      lightRemoteFullUrl,
      manualRemoteFullUrl,
      patchSettings,
      prefetchFull,
      pruneFavorites,
    ]
  );

  const installFromCatalogManual = useCallback(
    async (row: CatalogPreviewRow) => {
      const kind: 'light' | 'dark' = row.kind === ThemeKind.Dark ? 'dark' : 'light';
      const nextActive = Array.from(
        new Set(
          [lightRemoteFullUrl, darkRemoteFullUrl, row.fullInstallUrl].filter(Boolean) as string[]
        )
      );

      let nextFavorites = favorites;
      const existing = favorites.find((f) => f.fullUrl === row.fullInstallUrl);
      if (!existing) {
        const ok = await prefetchFull(row.fullInstallUrl);
        if (!ok) return;
        nextFavorites = [
          ...favorites,
          {
            fullUrl: row.fullInstallUrl,
            displayName: row.displayName,
            basename: row.basename,
            kind,
            pinned: false,
          },
        ];
      }

      patchSettings({
        themeRemoteManualFullUrl: row.fullInstallUrl,
        themeRemoteManualKind: kind,
        themeRemoteFavorites: pruneFavorites(nextFavorites, nextActive),
      });
    },
    [darkRemoteFullUrl, favorites, lightRemoteFullUrl, patchSettings, prefetchFull, pruneFavorites]
  );

  const clearRemote = useCallback(() => {
    patchSettings({
      themeRemoteManualFullUrl: undefined,
      themeRemoteManualKind: undefined,
      themeRemoteLightFullUrl: undefined,
      themeRemoteLightKind: undefined,
      themeRemoteDarkFullUrl: undefined,
      themeRemoteDarkKind: undefined,
    });
  }, [patchSettings]);

  return (
    <Box direction="Column" gap="100">
      {isChatMode && (
        <>
          <Text size="L400">Chat previews</Text>

          <SequenceCard
            className={SequenceCardStyle}
            variant="SurfaceVariant"
            direction="Column"
            gap="400"
          >
            <SettingTile
              title="Chat: theme previews from any HTTPS URL"
              focusId="theme-chat-preview-any"
              description="When enabled, messages linking to .preview.sable.css may fetch and show a small preview (parsed for safety)."
              after={<Switch variant="Primary" value={chatAny} onChange={setChatAny} />}
            />
          </SequenceCard>

          <SequenceCard
            className={SequenceCardStyle}
            variant="SurfaceVariant"
            direction="Column"
            gap="400"
          >
            <SettingTile
              title="Chat: only approved catalog URLs"
              focusId="theme-chat-preview-approved"
              description="Restricts chat theme embeds to URLs under approved prefixes from config."
              after={
                <Switch variant="Primary" value={chatApprovedOnly} onChange={setChatApprovedOnly} />
              }
            />
          </SequenceCard>
        </>
      )}

      {isRemoteMode && (
        <>
          <Text size="L400">Browse catalog</Text>

          {(pairsQuery.isPending || pairsQuery.isError) && (
            <SequenceCard
              className={SequenceCardStyle}
              variant="SurfaceVariant"
              direction="Column"
              gap="400"
            >
              <Box direction="Column" gap="200">
                {pairsQuery.isPending && (
                  <Box direction="Row" gap="200" alignItems="Center">
                    <Spinner variant="Primary" size="400" />
                    <Text size="T300">Loading catalog…</Text>
                  </Box>
                )}
                {pairsQuery.isError && (
                  <Text size="T300" style={{ color: 'var(--sable-crit-main)' }}>
                    {pairsQuery.error?.message ?? 'Failed to load catalog'}
                  </Text>
                )}
              </Box>
            </SequenceCard>
          )}

          {pairsQuery.isSuccess && pairsQuery.data.length > 0 && (
            <SequenceCard
              className={SequenceCardStyle}
              variant="SurfaceVariant"
              direction="Column"
              gap="400"
            >
              {previewsQuery.isPending && (
                <Box direction="Row" gap="200" alignItems="Center">
                  <Spinner variant="Primary" size="400" />
                  <Text size="T300">Loading previews…</Text>
                </Box>
              )}

              {previewsQuery.isSuccess && (
                <>
                  <Input
                    size="300"
                    radii="300"
                    outlined
                    placeholder="Search name or tag…"
                    value={search}
                    onChange={onSearchChange}
                  />
                  <Box direction="Row" gap="200" wrap="Wrap" alignItems="Center">
                    <Text size="T300">Kind:</Text>
                    {(['all', 'light', 'dark'] as const).map((k) => (
                      <Chip
                        key={k}
                        type="button"
                        variant={kindFilter === k ? 'Primary' : 'Secondary'}
                        outlined={kindFilter === k}
                        radii="Pill"
                        onClick={() => setKindFilter(k)}
                      >
                        <Text size="B300">{k === 'all' ? 'All' : k}</Text>
                      </Chip>
                    ))}
                    <Text size="T300">Contrast:</Text>
                    {(['all', 'low', 'high'] as const).map((c) => (
                      <Chip
                        key={c}
                        type="button"
                        variant={contrastFilter === c ? 'Primary' : 'Secondary'}
                        outlined={contrastFilter === c}
                        radii="Pill"
                        onClick={() => setContrastFilter(c)}
                      >
                        <Text size="B300">{c === 'all' ? 'All' : c}</Text>
                      </Chip>
                    ))}
                  </Box>

                  <Box
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                      gap: toRem(16),
                    }}
                  >
                    {filteredRows.map((row) => {
                      const slug = row.basename.replace(/[^a-zA-Z0-9_-]/g, '-') || 'theme';
                      const kindLabel = row.kind === ThemeKind.Dark ? 'Dark' : 'Light';
                      const isFav = favorites.some((f) => f.fullUrl === row.fullInstallUrl);
                      const line1 = `${kindLabel} · ${row.contrast} contrast`;
                      const line2 = `${row.author ? `by ${row.author}` : ''}${
                        row.tags.length > 0
                          ? `${row.author ? ' · ' : ''}${row.tags.join(', ')}`
                          : ''
                      }`.trim();
                      const subtitle = (
                        <>
                          {line1}
                          {line2 ? (
                            <>
                              <br />
                              {line2}
                            </>
                          ) : null}
                        </>
                      );
                      return (
                        <ThemePreviewCard
                          key={row.basename}
                          title={row.displayName}
                          subtitle={subtitle}
                          previewCssText={row.previewText}
                          scopeSlug={`catalog-${slug}`}
                          copyText={row.previewUrl}
                          isFavorited={isFav}
                          onToggleFavorite={() => toggleFavorite(row)}
                          systemTheme={systemTheme}
                          onApplyLight={
                            systemTheme ? () => installFromCatalogLight(row) : undefined
                          }
                          onApplyDark={systemTheme ? () => installFromCatalogDark(row) : undefined}
                          onApplyManual={
                            !systemTheme ? () => installFromCatalogManual(row) : undefined
                          }
                          isAppliedLight={lightRemoteFullUrl === row.fullInstallUrl}
                          isAppliedDark={darkRemoteFullUrl === row.fullInstallUrl}
                          isAppliedManual={manualRemoteFullUrl === row.fullInstallUrl}
                        />
                      );
                    })}
                  </Box>

                  {filteredRows.length === 0 && (
                    <Text size="T300" priority="300">
                      No themes match filters.
                    </Text>
                  )}
                </>
              )}
            </SequenceCard>
          )}
        </>
      )}

      {isLocalMode && (
        <>
          <SequenceCard
            className={SequenceCardStyle}
            variant="SurfaceVariant"
            direction="Column"
            gap="400"
          >
            <SettingTile
              title="Sync with system theme"
              focusId="theme-local-sync-system"
              description="When enabled, use different themes for OS light vs dark mode. When disabled, one manual theme is used."
              after={<Switch variant="Primary" value={systemTheme} onChange={setSystemTheme} />}
            />

            {systemTheme ? (
              <Box direction="Row" gap="200" wrap="Wrap" alignItems="Center">
                <Button variant="Secondary" size="300" radii="300" onClick={useBuiltinForLightSlot}>
                  <Text size="B300">Built-in (OS light)</Text>
                </Button>
                <Button variant="Secondary" size="300" radii="300" onClick={useBuiltinForDarkSlot}>
                  <Text size="B300">Built-in (OS dark)</Text>
                </Button>
              </Box>
            ) : (
              <Box direction="Row" gap="200" wrap="Wrap" alignItems="Center">
                <Button
                  variant="Secondary"
                  size="300"
                  radii="300"
                  onClick={useBuiltinForManualLight}
                >
                  <Text size="B300">Built-in Light</Text>
                </Button>
                <Button
                  variant="Secondary"
                  size="300"
                  radii="300"
                  onClick={useBuiltinForManualDark}
                >
                  <Text size="B300">Built-in Dark</Text>
                </Button>
              </Box>
            )}
          </SequenceCard>

          <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
            <SettingTile
              title="Clear theme assignments"
              focusId="theme-catalog-clear-remote"
              description="Clears which saved themes apply to light/dark or manual mode. Saved stars stay available."
              after={
                <Button variant="Secondary" size="300" radii="300" onClick={clearRemote}>
                  <Text size="B300">Clear</Text>
                </Button>
              }
            />
          </SequenceCard>

          <SequenceCard
            className={SequenceCardStyle}
            variant="SurfaceVariant"
            direction="Column"
            gap="400"
          >
            {localPreviewsQuery.isPending && (
              <Box direction="Row" gap="200" alignItems="Center">
                <Spinner variant="Primary" size="400" />
                <Text size="T300">Loading local previews…</Text>
              </Box>
            )}

            {favorites.length === 0 && (
              <Text size="T300" priority="300">
                No saved themes yet. Star themes in the catalog to download them locally.
              </Text>
            )}

            {localPreviewsQuery.isSuccess && favorites.length > 0 && (
              <>
                {localPreviewsQuery.data.length === 0 ? (
                  <Text size="T300" priority="300">
                    Could not load local previews. If this happens, the theme preview file may be
                    missing or not paired as `*.preview.sable.css`.
                  </Text>
                ) : (
                  <Box
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                      gap: toRem(16),
                    }}
                  >
                    {localPreviewsQuery.data.map((row) => {
                      const slug = row.basename.replace(/[^a-zA-Z0-9_-]/g, '-') || 'theme';
                      const kindLabel = row.kind === 'dark' ? 'Dark' : 'Light';
                      const line1 = `${kindLabel} · ${row.contrast} contrast`;
                      const line2 = `${row.author ? `by ${row.author}` : ''}${
                        row.tags.length > 0
                          ? `${row.author ? ' · ' : ''}${row.tags.join(', ')}`
                          : ''
                      }`.trim();
                      const subtitle = (
                        <>
                          {line1}
                          {line2 ? (
                            <>
                              <br />
                              {line2}
                            </>
                          ) : null}
                        </>
                      );
                      return (
                        <ThemePreviewCard
                          key={row.fullUrl}
                          title={row.displayName}
                          subtitle={subtitle}
                          previewCssText={row.previewText}
                          scopeSlug={`local-${slug}`}
                          copyText={row.previewUrl}
                          isFavorited
                          onToggleFavorite={() => removeFavorite(row.fullUrl)}
                          systemTheme={systemTheme}
                          onApplyLight={systemTheme ? () => applyFavoriteToLight(row) : undefined}
                          onApplyDark={systemTheme ? () => applyFavoriteToDark(row) : undefined}
                          onApplyManual={
                            !systemTheme ? () => applyFavoriteToManual(row) : undefined
                          }
                          isAppliedLight={lightRemoteFullUrl === row.fullUrl}
                          isAppliedDark={darkRemoteFullUrl === row.fullUrl}
                          isAppliedManual={manualRemoteFullUrl === row.fullUrl}
                        />
                      );
                    })}
                  </Box>
                )}
              </>
            )}
          </SequenceCard>
        </>
      )}
    </Box>
  );
}
