import { type ChangeEventHandler, useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Button, Chip, config, Input, Spinner, Switch, Text, toRem } from 'folds';
import { useStore } from 'jotai/react';

import { useClientConfig } from '$hooks/useClientConfig';
import { ThemeKind } from '$hooks/useTheme';
import { trimTrailingSlash } from '$utils/common';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom, type Settings } from '$state/settings';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { putCachedThemeCss } from '../../../theme/cache';
import { listThemePairsFromCatalog, type ThemePair } from '../../../theme/catalog';
import {
  buildPreviewStyleBlock,
  extractSafePreviewCustomProperties,
} from '../../../theme/previewCss';
import {
  extractFullThemeUrlFromPreview,
  parseSableThemeMetadata,
  type SableThemeContrast,
} from '../../../theme/metadata';

const DEFAULT_CATALOG_BASE = 'https://raw.githubusercontent.com/SableClient/themes/main/';

export type CatalogPreviewRow = ThemePair & {
  previewText: string;
  displayName: string;
  kind: ThemeKind;
  contrast: SableThemeContrast;
  tags: string[];
  fullInstallUrl: string;
};

function usePatchSettings() {
  const store = useStore();
  return useCallback(
    (partial: Partial<Settings>) => {
      const next = { ...store.get(settingsAtom), ...partial };
      store.set(settingsAtom, next);
    },
    [store]
  );
}

function ThemePreviewMini({ scopeClass, styleBlock }: { scopeClass: string; styleBlock: string }) {
  if (!styleBlock) {
    return (
      <Text size="T300" priority="300">
        No preview tokens
      </Text>
    );
  }
  return (
    <>
      <style>{styleBlock}</style>
      <Box
        className={scopeClass}
        direction="Column"
        gap="300"
        style={{
          padding: toRem(12),
          borderRadius: config.radii.R300,
          background: 'var(--sable-bg-container)',
          border: `${toRem(1)} solid var(--sable-surface-container-line)`,
          minHeight: toRem(88),
        }}
      >
        <Text size="T300" style={{ color: 'var(--sable-bg-on-container)' }}>
          Sample text
        </Text>
        <Box direction="Row" gap="200" wrap="Wrap">
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: `${toRem(4)} ${toRem(10)}`,
              borderRadius: config.radii.Pill,
              background: 'var(--sable-primary-main)',
              color: 'var(--sable-primary-on-main)',
              fontSize: toRem(12),
              fontWeight: 500,
            }}
          >
            Primary
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: `${toRem(4)} ${toRem(10)}`,
              borderRadius: config.radii.Pill,
              background: 'var(--sable-surface-container)',
              color: 'var(--sable-surface-on-container)',
              fontSize: toRem(12),
            }}
          >
            Surface
          </span>
        </Box>
      </Box>
    </>
  );
}

export function ThemeCatalogSettings() {
  const clientConfig = useClientConfig();
  const patchSettings = usePatchSettings();
  const configBase = clientConfig.themeCatalogBaseUrl?.trim();
  const catalogBase = `${trimTrailingSlash(configBase && configBase.length > 0 ? configBase : DEFAULT_CATALOG_BASE)}/`;

  const [catalogEnabled, setCatalogEnabled] = useSetting(settingsAtom, 'themeRemoteCatalogEnabled');
  const [chatAny, setChatAny] = useSetting(settingsAtom, 'themeChatPreviewAnyUrl');
  const [chatApprovedOnly, setChatApprovedOnly] = useSetting(
    settingsAtom,
    'themeChatPreviewApprovedCatalogOnly'
  );
  const [systemTheme] = useSetting(settingsAtom, 'useSystemTheme');

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'light' | 'dark'>('all');
  const [contrastFilter, setContrastFilter] = useState<'all' | SableThemeContrast>('all');

  const onSearchChange: ChangeEventHandler<HTMLInputElement> = (e) => setSearch(e.target.value);

  const pairsQuery = useQuery({
    queryKey: ['theme-catalog-pairs', catalogBase],
    queryFn: () => listThemePairsFromCatalog(catalogBase),
    enabled: catalogEnabled,
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
            kind,
            contrast,
            tags: meta.tags ?? [],
            fullInstallUrl,
          };
        })
      );
      return rows;
    },
    enabled: catalogEnabled && Boolean(pairsQuery.data?.length),
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

  const prefetchFull = useCallback((url: string) => {
    const run = async () => {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) return;
        const text = await res.text();
        await putCachedThemeCss(url, text);
      } catch {
        /* ignore */
      }
    };
    run();
  }, []);

  const installManual = useCallback(
    (row: CatalogPreviewRow) => {
      const kind: 'light' | 'dark' = row.kind === ThemeKind.Dark ? 'dark' : 'light';
      patchSettings({
        themeRemoteManualFullUrl: row.fullInstallUrl,
        themeRemoteManualKind: kind,
      });
      prefetchFull(row.fullInstallUrl);
    },
    [patchSettings, prefetchFull]
  );

  const installLightSlot = useCallback(
    (row: CatalogPreviewRow) => {
      const kind: 'light' | 'dark' = row.kind === ThemeKind.Dark ? 'dark' : 'light';
      patchSettings({
        themeRemoteLightFullUrl: row.fullInstallUrl,
        themeRemoteLightKind: kind,
      });
      prefetchFull(row.fullInstallUrl);
    },
    [patchSettings, prefetchFull]
  );

  const installDarkSlot = useCallback(
    (row: CatalogPreviewRow) => {
      const kind: 'light' | 'dark' = row.kind === ThemeKind.Dark ? 'dark' : 'light';
      patchSettings({
        themeRemoteDarkFullUrl: row.fullInstallUrl,
        themeRemoteDarkKind: kind,
      });
      prefetchFull(row.fullInstallUrl);
    },
    [patchSettings, prefetchFull]
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
      <Text size="L400">Theme catalog</Text>

      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Load themes from catalog"
          focusId="theme-catalog-enabled"
          description="Fetches the public theme list from the configured GitHub raw URL (see config). Required before browsing or installing remote themes."
          after={<Switch variant="Primary" value={catalogEnabled} onChange={setCatalogEnabled} />}
        />
      </SequenceCard>

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

      {catalogEnabled && (
        <>
          <SequenceCard
            className={SequenceCardStyle}
            variant="SurfaceVariant"
            direction="Column"
            gap="400"
          >
            <Box direction="Column" gap="200">
              <Text size="T300" priority="300">
                {configBase && configBase.length > 0
                  ? 'Catalog URL (from config): '
                  : 'Catalog URL (default; set themeCatalogBaseUrl in config to override): '}
                {catalogBase}
              </Text>
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
              {pairsQuery.isSuccess && pairsQuery.data.length === 0 && (
                <Text size="T300" priority="300">
                  No paired theme files found (expect *.preview.sable.css + matching *.sable.css).
                </Text>
              )}
            </Box>
          </SequenceCard>

          <SequenceCard
            className={SequenceCardStyle}
            variant="SurfaceVariant"
            direction="Column"
            gap="400"
          >
            <SettingTile
              title="Clear installed remote themes"
              focusId="theme-catalog-clear-remote"
              description="Removes remote full-theme URLs so built-in Light/Dark apply again."
              after={
                <Button variant="Secondary" size="300" radii="300" onClick={clearRemote}>
                  <Text size="B300">Clear</Text>
                </Button>
              }
            />
          </SequenceCard>

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
                      const vars = extractSafePreviewCustomProperties(row.previewText);
                      const slug = row.basename.replace(/[^a-zA-Z0-9_-]/g, '-') || 'theme';
                      const scopeClass = `sable-theme-preview--${slug}`;
                      const styleBlock = buildPreviewStyleBlock(vars, scopeClass);
                      const kindLabel = row.kind === ThemeKind.Dark ? 'Dark' : 'Light';
                      return (
                        <Box
                          key={row.basename}
                          direction="Column"
                          gap="300"
                          style={{
                            padding: toRem(12),
                            borderRadius: config.radii.R300,
                            border: `${toRem(1)} solid var(--sable-surface-container-line)`,
                            background: 'var(--sable-surface-container)',
                          }}
                        >
                          <Text size="H6">{row.displayName}</Text>
                          <Text size="T200" priority="300">
                            {kindLabel} · {row.contrast} contrast
                            {row.tags.length > 0 ? ` · ${row.tags.join(', ')}` : ''}
                          </Text>
                          <ThemePreviewMini scopeClass={scopeClass} styleBlock={styleBlock} />
                          {systemTheme ? (
                            <Box direction="Column" gap="200">
                              <Button
                                variant="Secondary"
                                size="300"
                                radii="300"
                                onClick={() => installLightSlot(row)}
                              >
                                <Text size="B300">Use when OS light</Text>
                              </Button>
                              <Button
                                variant="Secondary"
                                size="300"
                                radii="300"
                                onClick={() => installDarkSlot(row)}
                              >
                                <Text size="B300">Use when OS dark</Text>
                              </Button>
                            </Box>
                          ) : (
                            <Button
                              variant="Primary"
                              size="300"
                              radii="300"
                              onClick={() => installManual(row)}
                            >
                              <Text size="B300">Install</Text>
                            </Button>
                          )}
                        </Box>
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
    </Box>
  );
}
