import { type ChangeEventHandler, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTimeoutToggle } from '$hooks/useTimeoutToggle';
import { downloadTextFile } from '$utils/dom';
import { shareText } from '$utils/share';
import { fetch } from '$utils/fetch';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  IconButton,
  Input,
  Scroll,
  Spinner,
  Switch,
  Text,
  config,
  toRem,
} from 'folds';
import { Check, Download, Link, menuIcon, Star } from '$components/icons/phosphor';
import { useClientConfig } from '$hooks/useClientConfig';
import { ThemeKind } from '$hooks/useTheme';
import { useSetting } from '$state/hooks/settings';
import {
  settingsAtom,
  type Settings,
  type ThemeRemoteFavorite,
  type ThemeRemoteTweakFavorite,
} from '$state/settings';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { SettingTile, SettingToggle } from '$components/setting-tile';
import { ThemePreviewCard } from '$components/theme/ThemePreviewCard';
import { usePatchSettings } from './themeSettingsPatch';
import { ThemeImportModal } from './ThemeImportModal';
import { getCachedThemeCss, putCachedThemeCss } from '../../../theme/cache';
import {
  fetchThemeCatalogBundle,
  type ThemePair,
  type TweakCatalogEntry,
} from '../../../theme/catalog';
import {
  isLocalImportBundledUrl,
  isLocalImportThemeUrl,
  isLocalImportTweakUrl,
} from '../../../theme/localImportUrls';
import { resolveSavedTweakCss } from '../../../theme/syncedTweakCss';
import { isThirdPartyThemeUrl } from '../../../theme/themeApproval';
import { themeCatalogListingBaseUrl } from '../../../theme/catalogDefaults';
import {
  extractFullThemeUrlFromPreview,
  parseSableThemeMetadata,
  parseSableTweakMetadata,
  type SableThemeContrast,
} from '../../../theme/metadata';
import { previewUrlFromFullThemeUrl } from '../../../theme/previewUrls';
import { updateInstalledCatalogPackages } from '../../../theme/catalogUpdater';
import {
  pruneThemeFavorites,
  pruneThemeTweakFavorites,
  themeSourceLabel,
  themeUrlHostLabel,
} from '../../../theme/themeLibrary';
import { CssViewerButton } from '$components/theme/CssViewerButton';
import * as css from './ThemeCatalogSettings.css';

type CatalogPreviewRow = ThemePair & {
  previewText: string;
  displayName: string;
  author?: string;
  kind: ThemeKind;
  contrast: SableThemeContrast;
  tags: string[];
  fullInstallUrl: string;
};

type LocalPreviewRow = ThemeRemoteFavorite & {
  previewUrl: string;
  previewText: string;
  fullCssText: string;
  displayName: string;
  author?: string;
  contrast: SableThemeContrast;
  tags: string[];
  importedLocal?: boolean;
};

type CatalogTweakRow = TweakCatalogEntry & {
  fullCssText: string;
  displayName: string;
  description?: string;
  author?: string;
  tags: string[];
};

type LocalTweakRow = ThemeRemoteTweakFavorite & {
  fullCssText: string;
  description?: string;
  author?: string;
  tags: string[];
};

type ThemeCatalogSettingsMode = 'local' | 'appearance';

type ThemeCatalogSettingsProps = {
  mode: ThemeCatalogSettingsMode;
  onBrowseOpenChange?: (open: boolean) => void;
};

type CatalogTweakCardProps = {
  displayName: string;
  description: string;
  copyUrl?: string;
  thirdPartyChip: boolean;
  isFavorited: boolean;
  onToggleFavorite: () => void | Promise<void>;
  isOn: boolean;
  onSetApplied: (v: boolean) => void;
  onExport?: () => void;
  cssText: string;
  sourceLabel: string;
};

function CatalogTweakCard({
  displayName,
  description,
  copyUrl,
  thirdPartyChip,
  isFavorited,
  onToggleFavorite,
  isOn,
  onSetApplied,
  onExport,
  cssText,
  sourceLabel,
}: CatalogTweakCardProps) {
  const [copied, setCopied] = useTimeoutToggle();
  const handleCopy = useCallback(async () => {
    if (!copyUrl) return;
    if (await shareText(copyUrl)) setCopied();
  }, [copyUrl, setCopied]);

  return (
    <Box
      direction="Column"
      gap="200"
      style={{
        padding: toRem(12),
        borderRadius: config.radii.R300,
        border: `${toRem(1)} solid var(--sable-surface-container-line)`,
        background: 'var(--sable-surface-container)',
      }}
    >
      <Box direction="Row" alignItems="Start" justifyContent="SpaceBetween" gap="200">
        <Box direction="Column" gap="100" grow="Yes" style={{ minWidth: 0 }}>
          <Box direction="Row" justifyContent="SpaceBetween" alignContent="Center">
            <Text size="H6">{displayName}</Text>
            <Box direction="Row" gap="100" alignItems="Center" shrink="No">
              <CssViewerButton
                title={`${displayName} — CSS`}
                cssText={cssText}
                ariaLabel="View tweak CSS"
              />
              {copyUrl && (
                <IconButton
                  size="300"
                  variant="Secondary"
                  fill="Soft"
                  outlined
                  radii="300"
                  aria-label={copied ? 'Copied tweak link' : 'Copy tweak link'}
                  onClick={() => {
                    handleCopy().catch(() => undefined);
                  }}
                >
                  {menuIcon(copied ? Check : Link)}
                </IconButton>
              )}
              {onExport && (
                <IconButton
                  size="300"
                  variant="Secondary"
                  fill="Soft"
                  outlined
                  radii="300"
                  aria-label="Export tweak CSS"
                  onClick={() => {
                    onExport();
                  }}
                >
                  {menuIcon(Download)}
                </IconButton>
              )}
              <IconButton
                size="300"
                variant={isFavorited ? 'Primary' : 'Secondary'}
                fill="Soft"
                outlined
                radii="300"
                aria-label={isFavorited ? 'Remove tweak from saved' : 'Save tweak'}
                onClick={() => {
                  Promise.resolve(onToggleFavorite()).catch(() => undefined);
                }}
              >
                {menuIcon(Star, { weight: isFavorited ? 'fill' : 'regular' })}
              </IconButton>
              <Switch variant="Primary" value={isOn} onChange={onSetApplied} />
            </Box>
          </Box>
          <Text size="T200" priority="300" style={{ wordBreak: 'break-word' }}>
            {description}
          </Text>
          <Text size="T200" priority="300">
            Source: {sourceLabel}
          </Text>
        </Box>
        <Box direction="Column" gap="100" alignItems="End" shrink="No">
          {thirdPartyChip && (
            <Chip variant="Critical" outlined radii="Pill">
              <Text size="B300">Third-party URL</Text>
            </Chip>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export function ThemeCatalogSettings({ mode, onBrowseOpenChange }: ThemeCatalogSettingsProps) {
  const clientConfig = useClientConfig();
  const patchSettings = usePatchSettings();
  const queryClient = useQueryClient();
  const configBase = clientConfig.themeCatalogBaseUrl?.trim();
  const catalogBase = themeCatalogListingBaseUrl(configBase);
  const catalogManifestUrl = clientConfig.themeCatalogManifestUrl?.trim() || undefined;

  const isAppearanceMode = mode === 'appearance';
  const [browseOpen, setBrowseOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const appearanceCatalogBrowseWasOpenRef = useRef(false);
  const tweakFavoritesSnapshotAtAppearanceCatalogOpenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isAppearanceMode) {
      onBrowseOpenChange?.(browseOpen);
    }
  }, [browseOpen, isAppearanceMode, onBrowseOpenChange]);

  const isRemoteMode = isAppearanceMode && browseOpen;
  const isChatMode = isAppearanceMode && !browseOpen;
  const showAssignmentChrome = mode === 'local' || (isAppearanceMode && !browseOpen);
  const showSavedLibrary = !(isAppearanceMode && browseOpen);

  const [getFavorites] = useSetting(settingsAtom, 'themeRemoteFavorites');
  const [favorites, setFavorites] = useState(getFavorites ? getFavorites : []);
  const [tweakFavorites] = useSetting(settingsAtom, 'themeRemoteTweakFavorites');
  const [enabledTweakFullUrls] = useSetting(settingsAtom, 'themeRemoteEnabledTweakFullUrls');
  const [systemTheme, setSystemTheme] = useSetting(settingsAtom, 'useSystemTheme');
  const [manualRemoteFullUrl] = useSetting(settingsAtom, 'themeRemoteManualFullUrl');
  const [lightRemoteFullUrl] = useSetting(settingsAtom, 'themeRemoteLightFullUrl');
  const [darkRemoteFullUrl] = useSetting(settingsAtom, 'themeRemoteDarkFullUrl');
  const [sableChatWidgets, setSableChatWidgets] = useSetting(
    settingsAtom,
    'themeChatSableWidgetsEnabled'
  );
  const [autoPreviewApprovedUrls, setAutoPreviewApprovedUrls] = useSetting(
    settingsAtom,
    'themeChatAutoPreviewApprovedUrls'
  );
  const [autoPreviewAnyUrl, setAutoPreviewAnyUrl] = useSetting(
    settingsAtom,
    'themeChatAutoPreviewAnyUrl'
  );

  useEffect(() => {
    if (!isAppearanceMode) {
      appearanceCatalogBrowseWasOpenRef.current = false;
      return;
    }
    if (browseOpen && !appearanceCatalogBrowseWasOpenRef.current) {
      tweakFavoritesSnapshotAtAppearanceCatalogOpenRef.current = new Set(
        tweakFavorites.map((f) => f.fullUrl.trim()).filter(Boolean)
      );
    }
    appearanceCatalogBrowseWasOpenRef.current = browseOpen;
  }, [browseOpen, isAppearanceMode, tweakFavorites]);

  const [themeSearch, setThemeSearch] = useState('');
  const [tweakSearch, setTweakSearch] = useState('');
  const [savedSection, setSavedSection] = useState<'themes' | 'tweaks'>('themes');
  const [catalogSection, setCatalogSection] = useState<'themes' | 'tweaks'>('themes');
  const [kindFilter, setKindFilter] = useState<'all' | 'light' | 'dark'>('all');
  const [contrastFilter, setContrastFilter] = useState<'all' | SableThemeContrast>('all');
  const [tweakApplyFilter, setTweakApplyFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [catalogUpdateStatus, setCatalogUpdateStatus] = useState<
    'idle' | 'checking' | 'updated' | 'unchanged' | 'failed'
  >('idle');
  const [catalogUpdateMessage, setCatalogUpdateMessage] = useState(
    'Automatically checks installed catalog themes and tweaks for CSS changes.'
  );
  useEffect(() => setFavorites(getFavorites ? getFavorites : []), [getFavorites]);

  const onThemeSearchChange: ChangeEventHandler<HTMLInputElement> = (e) =>
    setThemeSearch(e.target.value);
  const onTweakSearchChange: ChangeEventHandler<HTMLInputElement> = (e) =>
    setTweakSearch(e.target.value);

  const activeUrls = useMemo(
    () =>
      [manualRemoteFullUrl, lightRemoteFullUrl, darkRemoteFullUrl].filter((u): u is string =>
        Boolean(u && u.trim().length > 0)
      ),
    [darkRemoteFullUrl, lightRemoteFullUrl, manualRemoteFullUrl]
  );

  const checkInstalledCatalogUpdates = useCallback(async () => {
    if (catalogUpdateStatus === 'checking') return;
    setCatalogUpdateStatus('checking');
    setCatalogUpdateMessage('Checking installed catalog themes and tweaks…');
    try {
      const summary = await updateInstalledCatalogPackages({
        catalogBase,
        manifestUrl: catalogManifestUrl,
        installedThemeUrls: Array.from(
          new Set([...favorites.map((favorite) => favorite.fullUrl), ...activeUrls])
        ),
        installedTweakUrls: Array.from(
          new Set([...tweakFavorites.map((favorite) => favorite.fullUrl), ...enabledTweakFullUrls])
        ),
        maxAgeMs: 0,
      });
      if (summary.updated > 0) {
        setCatalogUpdateStatus('updated');
        setCatalogUpdateMessage(
          `Updated ${summary.updated} catalog ${summary.updated === 1 ? 'package' : 'packages'}.`
        );
      } else if (summary.failed > 0) {
        setCatalogUpdateStatus('failed');
        setCatalogUpdateMessage(
          `Could not check ${summary.failed} ${summary.failed === 1 ? 'package' : 'packages'}. Cached CSS is still active.`
        );
      } else {
        setCatalogUpdateStatus('unchanged');
        setCatalogUpdateMessage(
          summary.checked === 0
            ? 'No installed themes or tweaks belong to the current catalog.'
            : 'Installed catalog themes and tweaks are up to date.'
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['theme-local-previews'] }),
        queryClient.invalidateQueries({ queryKey: ['theme-local-tweaks'] }),
      ]);
    } catch {
      setCatalogUpdateStatus('failed');
      setCatalogUpdateMessage('Could not check the catalog. Cached CSS is still active.');
    }
  }, [
    activeUrls,
    catalogBase,
    catalogManifestUrl,
    catalogUpdateStatus,
    enabledTweakFullUrls,
    favorites,
    queryClient,
    tweakFavorites,
  ]);

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

  const catalogQuery = useQuery({
    queryKey: ['theme-catalog-bundle', catalogBase, catalogManifestUrl ?? ''],
    queryFn: () => fetchThemeCatalogBundle(catalogBase, { manifestUrl: catalogManifestUrl }),
    enabled: isRemoteMode,
    staleTime: 5 * 60_000,
  });

  const previewsQuery = useQuery({
    queryKey: [
      'theme-catalog-previews',
      catalogBase,
      catalogQuery.data?.themes?.map((p) => p.previewUrl).join('|') ?? '',
    ],
    queryFn: async (): Promise<CatalogPreviewRow[]> => {
      const pairs = catalogQuery.data?.themes ?? [];
      const rows = await Promise.all(
        pairs.map(async (pair) => {
          const res = await fetch(pair.previewUrl, { mode: 'cors' });
          let previewText = res.ok ? await res.text() : '';
          if (!previewText) {
            try {
              const fullResponse = await fetch(pair.fullUrl, { mode: 'cors' });
              if (fullResponse.ok) previewText = await fullResponse.text();
            } catch {
              // Keep the catalog row visible even when neither CSS file is currently reachable.
            }
          }
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
    enabled: isRemoteMode && Boolean(catalogQuery.data?.themes?.length),
    staleTime: 10 * 60_000,
  });

  const tweakDetailsQuery = useQuery({
    queryKey: [
      'theme-catalog-tweak-details',
      catalogBase,
      catalogQuery.data?.tweaks?.map((t) => t.fullUrl).join('|') ?? '',
    ],
    queryFn: async (): Promise<CatalogTweakRow[]> => {
      const tweaks = catalogQuery.data?.tweaks ?? [];
      const rows = await Promise.all(
        tweaks.map(async (entry) => {
          try {
            let text: string;
            if (isLocalImportBundledUrl(entry.fullUrl)) {
              text = (await getCachedThemeCss(entry.fullUrl)) ?? '';
            } else {
              const res = await fetch(entry.fullUrl, { mode: 'cors' });
              text = res.ok ? await res.text() : '';
            }
            const meta = parseSableTweakMetadata(text);
            return {
              ...entry,
              fullCssText: text,
              displayName: meta.name?.trim() || entry.basename,
              description: meta.description?.trim() || undefined,
              author: meta.author?.trim() || undefined,
              tags: meta.tags ?? [],
            };
          } catch {
            return {
              ...entry,
              fullCssText: '',
              displayName: entry.basename,
              tags: [],
            };
          }
        })
      );
      return rows;
    },
    enabled: isRemoteMode && Boolean(catalogQuery.data?.tweaks?.length),
    staleTime: 10 * 60_000,
  });

  const filteredTweakRows = useMemo(() => {
    const rows = tweakDetailsQuery.data ?? [];
    const q = tweakSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay =
        `${row.displayName} ${row.basename} ${row.description ?? ''} ${row.tags.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [tweakDetailsQuery.data, tweakSearch]);

  const catalogTweaksAfterApplyFilter = useMemo(() => {
    if (tweakApplyFilter === 'all') return filteredTweakRows;
    if (tweakApplyFilter === 'enabled') {
      return filteredTweakRows.filter((r) => enabledTweakFullUrls.includes(r.fullUrl));
    }
    return filteredTweakRows.filter((r) => !enabledTweakFullUrls.includes(r.fullUrl));
  }, [filteredTweakRows, enabledTweakFullUrls, tweakApplyFilter]);

  const filteredRows = useMemo(() => {
    const rows = previewsQuery.data ?? [];
    const q = themeSearch.trim().toLowerCase();
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
  }, [previewsQuery.data, themeSearch, kindFilter, contrastFilter]);

  const localPreviewsQuery = useQuery({
    queryKey: ['theme-local-previews', favorites.map((f) => f.fullUrl).join('|')],
    enabled: showSavedLibrary && favorites.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<LocalPreviewRow[]> => {
      const rows = await Promise.all(
        favorites.map(async (fav) => {
          const previewUrl = previewUrlFromFullThemeUrl(fav.fullUrl) ?? fav.fullUrl;

          try {
            let fullCssText = (await getCachedThemeCss(fav.fullUrl)) ?? '';
            if (!isLocalImportBundledUrl(fav.fullUrl)) {
              try {
                const fullRes = await fetch(fav.fullUrl, { mode: 'cors' });
                if (fullRes.ok) fullCssText = await fullRes.text();
              } catch {
                // Cached full CSS keeps saved themes usable while offline.
              }
            }

            let previewText = '';
            if (previewUrl === fav.fullUrl) {
              previewText = fullCssText;
            } else if (isLocalImportThemeUrl(previewUrl)) {
              previewText = (await getCachedThemeCss(previewUrl)) ?? fullCssText;
            } else {
              try {
                const previewRes = await fetch(previewUrl, { mode: 'cors' });
                previewText = previewRes.ok ? await previewRes.text() : fullCssText;
              } catch {
                previewText = fullCssText;
              }
            }
            if (!previewText && !fullCssText) return undefined;
            const metadataCss = previewText || fullCssText;
            const meta = parseSableThemeMetadata(metadataCss);
            const displayName = meta.name?.trim() || fav.displayName || fav.basename;
            const contrast: SableThemeContrast = meta.contrast === 'high' ? 'high' : 'low';
            const authorTrim = meta.author?.trim();
            const row: LocalPreviewRow = {
              ...fav,
              previewUrl,
              previewText,
              fullCssText,
              displayName,
              contrast,
              tags: meta.tags ?? [],
              importedLocal: fav.importedLocal,
              ...(authorTrim ? { author: authorTrim } : {}),
            };
            return row;
          } catch {
            return undefined;
          }
        })
      );

      return rows.filter((r): r is LocalPreviewRow => Boolean(r));
    },
  });

  const localTweaksQuery = useQuery({
    queryKey: [
      'theme-local-tweaks',
      tweakFavorites.map((f) => `${f.fullUrl}:${f.cssText ?? ''}`).join('|'),
    ],
    enabled: showSavedLibrary && tweakFavorites.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<LocalTweakRow[]> => {
      const rows = await Promise.all(
        tweakFavorites.map(async (fav) => {
          try {
            let text = await resolveSavedTweakCss(fav);
            if (!isLocalImportBundledUrl(fav.fullUrl)) {
              try {
                const res = await fetch(fav.fullUrl, { mode: 'cors' });
                if (res.ok) text = await res.text();
              } catch {
                // Cached tweak CSS keeps the saved library available while offline.
              }
            }
            if (!text) return undefined;
            const meta = parseSableTweakMetadata(text);
            const authorTrim = meta.author?.trim();
            const row: LocalTweakRow = {
              ...fav,
              fullCssText: text,
              displayName: meta.name?.trim() || fav.displayName || fav.basename,
              description: meta.description?.trim() || undefined,
              tags: meta.tags ?? [],
              importedLocal: fav.importedLocal,
              ...(authorTrim ? { author: authorTrim } : {}),
            };
            return row;
          } catch {
            return undefined;
          }
        })
      );
      return rows.filter((r): r is LocalTweakRow => Boolean(r));
    },
  });
  const resolvedTweakUrls = new Set(
    localTweaksQuery.isSuccess ? localTweaksQuery.data.map((row) => row.fullUrl) : []
  );
  const provisionalTweakCount = tweakFavorites.filter(
    (favorite) => !isLocalImportTweakUrl(favorite.fullUrl) || Boolean(favorite.cssText)
  ).length;
  const savedTweakCount = localTweaksQuery.isSuccess
    ? resolvedTweakUrls.size
    : provisionalTweakCount;
  const unresolvedLegacyTweakCount = localTweaksQuery.isSuccess
    ? tweakFavorites.filter(
        (favorite) =>
          isLocalImportTweakUrl(favorite.fullUrl) &&
          !favorite.cssText &&
          !resolvedTweakUrls.has(favorite.fullUrl)
      ).length
    : 0;

  const removeFavorite = useCallback(
    (fullUrl: string) => {
      const nextFavorites = favorites.filter((f) => f.fullUrl !== fullUrl);
      const cleared = clearAssignmentsIfMatch(fullUrl);
      const nextActive = [manualRemoteFullUrl, lightRemoteFullUrl, darkRemoteFullUrl]
        .filter((u): u is string => Boolean(u && u.trim().length > 0))
        .filter((u) => u !== fullUrl);
      patchSettings({
        ...cleared,
        themeRemoteFavorites: pruneThemeFavorites(nextFavorites, nextActive),
      });
    },
    [
      clearAssignmentsIfMatch,
      darkRemoteFullUrl,
      favorites,
      lightRemoteFullUrl,
      manualRemoteFullUrl,
      patchSettings,
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
      if (isLocalImportBundledUrl(url)) {
        const cached = await getCachedThemeCss(url);
        return Boolean(cached);
      }
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) return false;
      const text = await res.text();
      await putCachedThemeCss(url, text);
      return true;
    } catch {
      return false;
    }
  }, []);

  const loadFullCssText = useCallback(async (url: string): Promise<string> => {
    const cached = await getCachedThemeCss(url);
    if (cached) return cached;
    if (isLocalImportBundledUrl(url)) throw new Error('Theme CSS is not cached.');
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`Theme CSS fetch failed: ${response.status}`);
    const text = await response.text();
    await putCachedThemeCss(url, text);
    return text;
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
          themeRemoteFavorites: pruneThemeFavorites(nextFavorites, nextActive),
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
    [activeUrls, clearAssignmentsIfMatch, favorites, patchSettings, prefetchFull]
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
        themeRemoteFavorites: pruneThemeFavorites(nextFavorites, nextActive),
      });
    },
    [darkRemoteFullUrl, favorites, manualRemoteFullUrl, patchSettings, prefetchFull]
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
        themeRemoteFavorites: pruneThemeFavorites(nextFavorites, nextActive),
      });
    },
    [favorites, lightRemoteFullUrl, manualRemoteFullUrl, patchSettings, prefetchFull]
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
        themeRemoteFavorites: pruneThemeFavorites(nextFavorites, nextActive),
      });
    },
    [darkRemoteFullUrl, favorites, lightRemoteFullUrl, patchSettings, prefetchFull]
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

  const setTweakApplied = useCallback(
    async (
      fullUrl: string,
      apply: boolean,
      hint?: {
        displayName?: string;
        basename?: string;
        pruneUnpinnedFavoriteOnDisable?: boolean;
      }
    ) => {
      const trimmed = fullUrl.trim();
      if (!trimmed) return;

      if (apply) {
        const ok = await prefetchFull(trimmed);
        if (!ok) return;
        const nextEnabled = enabledTweakFullUrls.includes(trimmed)
          ? [...enabledTweakFullUrls]
          : [...enabledTweakFullUrls, trimmed];
        const nextFavs = [...tweakFavorites];
        if (!nextFavs.some((f) => f.fullUrl === trimmed)) {
          const cached = (await getCachedThemeCss(trimmed)) ?? '';
          const meta = parseSableTweakMetadata(cached);
          const base =
            trimmed
              .replace(/\.sable\.css(\?.*)?$/i, '')
              .split('/')
              .pop() ?? 'tweak';
          nextFavs.push({
            fullUrl: trimmed,
            displayName: hint?.displayName ?? meta.name?.trim() ?? base,
            basename: hint?.basename ?? meta.id?.trim() ?? base,
            pinned: false,
          });
        }
        patchSettings({
          themeRemoteEnabledTweakFullUrls: nextEnabled,
          themeRemoteTweakFavorites: pruneThemeTweakFavorites(nextFavs, nextEnabled),
        });
      } else {
        const nextEnabled = enabledTweakFullUrls.filter((u) => u !== trimmed);
        if (hint?.pruneUnpinnedFavoriteOnDisable) {
          const enabledSet = new Set(nextEnabled);
          const inLibraryBeforeThisCatalogVisit =
            tweakFavoritesSnapshotAtAppearanceCatalogOpenRef.current;
          const nextTweakFavs = tweakFavorites.filter(
            (f) =>
              f.pinned === true ||
              enabledSet.has(f.fullUrl) ||
              inLibraryBeforeThisCatalogVisit.has(f.fullUrl.trim())
          );
          patchSettings({
            themeRemoteEnabledTweakFullUrls: nextEnabled,
            themeRemoteTweakFavorites: nextTweakFavs,
          });
        } else {
          patchSettings({
            themeRemoteEnabledTweakFullUrls: nextEnabled,
          });
        }
      }
    },
    [enabledTweakFullUrls, patchSettings, prefetchFull, tweakFavorites]
  );

  const toggleCatalogTweakFavorite = useCallback(
    async (row: CatalogTweakRow) => {
      const existing = tweakFavorites.find((f) => f.fullUrl === row.fullUrl);
      if (existing) {
        const nextFavs = tweakFavorites.filter((f) => f.fullUrl !== row.fullUrl);
        const nextEnabled = enabledTweakFullUrls.filter((u) => u !== row.fullUrl);
        patchSettings({
          themeRemoteTweakFavorites: pruneThemeTweakFavorites(nextFavs, nextEnabled),
          themeRemoteEnabledTweakFullUrls: nextEnabled,
        });
        return;
      }
      const ok = await prefetchFull(row.fullUrl);
      if (!ok) return;
      const next: ThemeRemoteTweakFavorite = {
        fullUrl: row.fullUrl,
        displayName: row.displayName,
        basename: row.basename,
        pinned: true,
      };
      patchSettings({
        themeRemoteTweakFavorites: pruneThemeTweakFavorites(
          [...tweakFavorites, next],
          enabledTweakFullUrls
        ),
      });
    },
    [enabledTweakFullUrls, patchSettings, prefetchFull, tweakFavorites]
  );

  const removeTweakFavorite = useCallback(
    (fullUrl: string) => {
      const nextFavs = tweakFavorites.filter((f) => f.fullUrl !== fullUrl);
      const nextEnabled = enabledTweakFullUrls.filter((u) => u !== fullUrl);
      patchSettings({
        themeRemoteTweakFavorites: pruneThemeTweakFavorites(nextFavs, nextEnabled),
        themeRemoteEnabledTweakFullUrls: nextEnabled,
      });
    },
    [enabledTweakFullUrls, patchSettings, tweakFavorites]
  );

  const downloadThemeFile = useCallback((row: LocalPreviewRow) => {
    const filename = `${row.basename || 'theme'}.sable.css`;
    downloadTextFile(row.fullCssText, filename);
  }, []);

  const downloadTweakFile = useCallback((row: LocalTweakRow) => {
    const filename = `${row.basename || 'tweak'}.sable.css`;
    downloadTextFile(row.fullCssText, filename);
  }, []);

  const catalogBundle = catalogQuery.data;
  const catalogThemeCount = catalogBundle?.themes.length ?? 0;
  const catalogTweakCount = catalogBundle?.tweaks.length ?? 0;
  const catalogHasEntries = catalogThemeCount + catalogTweakCount > 0;

  return (
    <Box direction="Column" gap="100">
      {showAssignmentChrome && (
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
                <Button
                  variant="Secondary"
                  fill="Soft"
                  outlined
                  size="300"
                  radii="300"
                  onClick={useBuiltinForLightSlot}
                >
                  <Text size="B300">Built-in (OS light)</Text>
                </Button>
                <Button
                  variant="Secondary"
                  fill="Soft"
                  outlined
                  size="300"
                  radii="300"
                  onClick={useBuiltinForDarkSlot}
                >
                  <Text size="B300">Built-in (OS dark)</Text>
                </Button>
              </Box>
            ) : (
              <Box direction="Row" gap="200" wrap="Wrap" alignItems="Center">
                <Button
                  variant="Secondary"
                  fill="Soft"
                  outlined
                  size="300"
                  radii="300"
                  onClick={useBuiltinForManualLight}
                >
                  <Text size="B300">Built-in Light</Text>
                </Button>
                <Button
                  variant="Secondary"
                  fill="Soft"
                  outlined
                  size="300"
                  radii="300"
                  onClick={useBuiltinForManualDark}
                >
                  <Text size="B300">Built-in Dark</Text>
                </Button>
              </Box>
            )}
          </SequenceCard>
        </>
      )}

      {showSavedLibrary && (
        <>
          <SequenceCard
            className={SequenceCardStyle}
            variant="SurfaceVariant"
            direction="Column"
            gap="400"
          >
            <Box
              direction="Row"
              gap="200"
              alignItems="Center"
              justifyContent="SpaceBetween"
              wrap="Wrap"
            >
              <Box direction="Row" gap="200" alignItems="Center" wrap="Wrap">
                <Text size="T300">Saved</Text>
                <Chip
                  type="button"
                  variant={savedSection === 'themes' ? 'Primary' : 'Secondary'}
                  outlined={savedSection === 'themes'}
                  radii="Pill"
                  onClick={() => setSavedSection('themes')}
                >
                  <Text size="B300">Themes ({favorites.length})</Text>
                </Chip>
                <Chip
                  type="button"
                  variant={savedSection === 'tweaks' ? 'Primary' : 'Secondary'}
                  outlined={savedSection === 'tweaks'}
                  radii="Pill"
                  onClick={() => setSavedSection('tweaks')}
                >
                  <Text size="B300">Tweaks ({savedTweakCount})</Text>
                </Chip>
              </Box>
              <Box direction="Row" gap="100" alignItems="Center">
                <Chip
                  type="button"
                  variant={catalogUpdateStatus === 'failed' ? 'Critical' : 'Secondary'}
                  radii="Pill"
                  disabled={catalogUpdateStatus === 'checking'}
                  onClick={() => {
                    checkInstalledCatalogUpdates().catch(() => undefined);
                  }}
                >
                  <Text size="B300">
                    {catalogUpdateStatus === 'checking' ? 'Checking…' : 'Check updates'}
                  </Text>
                </Chip>
                <Chip
                  type="button"
                  variant="Secondary"
                  radii="Pill"
                  disabled={activeUrls.length === 0}
                  onClick={clearRemote}
                >
                  <Text size="B300">Reset</Text>
                </Chip>
              </Box>
            </Box>

            {catalogUpdateStatus !== 'idle' && catalogUpdateStatus !== 'checking' && (
              <Text size="T200" priority="300">
                {catalogUpdateMessage}
              </Text>
            )}

            {savedSection === 'themes' && (
              <Box direction="Column" gap="300">
                {localPreviewsQuery.isPending && favorites.length > 0 && (
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
                        Could not load local previews. If this happens, the theme preview file may
                        be missing or not paired as `*.preview.sable.css`.
                      </Text>
                    ) : (
                      <Box
                        className={css.themeCardGrid}
                        style={{
                          maxHeight: 'min(68dvh, 44rem)',
                          overflowY: 'auto',
                          paddingRight: toRem(4),
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
                              fullCssText={row.fullCssText}
                              scopeSlug={`local-${slug}`}
                              sourceLabel={themeSourceLabel({
                                importedLocal: row.importedLocal,
                                official:
                                  !row.importedLocal &&
                                  !isThirdPartyThemeUrl(
                                    row.fullUrl,
                                    clientConfig.themeCatalogApprovedHostPrefixes
                                  ),
                                url: row.fullUrl,
                              })}
                              copyText={row.importedLocal ? undefined : row.previewUrl}
                              thirdParty={
                                !row.importedLocal &&
                                isThirdPartyThemeUrl(
                                  row.fullUrl,
                                  clientConfig.themeCatalogApprovedHostPrefixes
                                )
                              }
                              isFavorited
                              onToggleFavorite={() => removeFavorite(row.fullUrl)}
                              onExport={() => downloadThemeFile(row)}
                              systemTheme={systemTheme}
                              onApplyLight={
                                systemTheme ? () => applyFavoriteToLight(row) : undefined
                              }
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
              </Box>
            )}

            {savedSection === 'tweaks' && (
              <Box direction="Column" gap="300">
                {localTweaksQuery.isPending && tweakFavorites.length > 0 && (
                  <Box direction="Row" gap="200" alignItems="Center">
                    <Spinner variant="Primary" size="400" />
                    <Text size="T300">Loading tweaks…</Text>
                  </Box>
                )}
                {tweakFavorites.length === 0 && (
                  <Text size="T300" priority="300">
                    No saved tweaks. Favorite tweaks in the catalog to keep them here, or enable a
                    tweak to cache it automatically.
                  </Text>
                )}
                {localTweaksQuery.isSuccess && tweakFavorites.length > 0 && (
                  <Box
                    direction="Column"
                    gap="200"
                    style={{
                      maxHeight: 'min(68dvh, 44rem)',
                      overflowY: 'auto',
                      paddingRight: toRem(4),
                    }}
                  >
                    {localTweaksQuery.data.length > 0 && unresolvedLegacyTweakCount > 0 && (
                      <Text size="T300" priority="300">
                        {unresolvedLegacyTweakCount} saved local tweak
                        {unresolvedLegacyTweakCount === 1 ? ' is' : 's are'} waiting to migrate.
                      </Text>
                    )}
                    {localTweaksQuery.data.length === 0 ? (
                      <Text size="T300" priority="300">
                        {unresolvedLegacyTweakCount === tweakFavorites.length
                          ? 'Some saved local tweaks are waiting to migrate. Open Sable on a device that still has them to finish syncing.'
                          : 'Could not load tweak CSS. Check the URL or your connection.'}
                      </Text>
                    ) : (
                      localTweaksQuery.data.map((row) => {
                        const isOn = enabledTweakFullUrls.includes(row.fullUrl);
                        const descParts = [
                          row.description,
                          row.author ? `by ${row.author}` : '',
                          row.tags.length > 0 ? row.tags.join(', ') : '',
                        ].filter(Boolean);
                        const desc =
                          descParts.join(' · ') ||
                          'Applies on top of your current theme after it loads.';
                        return (
                          <CatalogTweakCard
                            key={row.fullUrl}
                            displayName={row.displayName}
                            description={desc}
                            copyUrl={row.importedLocal ? undefined : row.fullUrl}
                            thirdPartyChip={
                              !row.importedLocal &&
                              isThirdPartyThemeUrl(
                                row.fullUrl,
                                clientConfig.themeCatalogApprovedHostPrefixes
                              )
                            }
                            isFavorited
                            onToggleFavorite={() => removeTweakFavorite(row.fullUrl)}
                            onExport={() => downloadTweakFile(row)}
                            cssText={row.fullCssText}
                            sourceLabel={themeSourceLabel({
                              importedLocal: row.importedLocal,
                              official:
                                !row.importedLocal &&
                                !isThirdPartyThemeUrl(
                                  row.fullUrl,
                                  clientConfig.themeCatalogApprovedHostPrefixes
                                ),
                              url: row.fullUrl,
                            })}
                            isOn={isOn}
                            onSetApplied={(v) =>
                              setTweakApplied(row.fullUrl, v, {
                                displayName: row.displayName,
                                basename: row.basename,
                              })
                            }
                          />
                        );
                      })
                    )}
                  </Box>
                )}
              </Box>
            )}
          </SequenceCard>
        </>
      )}

      {isAppearanceMode && !browseOpen && (
        <>
          <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
            <SettingTile
              title="Browse catalog"
              focusId="theme-browse-remote"
              description="Download themes and tweaks from the official catalog."
              after={
                <Button
                  variant="Secondary"
                  fill="Soft"
                  outlined
                  size="300"
                  radii="300"
                  onClick={() => setBrowseOpen(true)}
                >
                  <Text size="B300">Browse catalog…</Text>
                </Button>
              }
            />
          </SequenceCard>
          <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
            <SettingTile
              title="Import a theme or tweak"
              focusId="theme-import-open"
              description="Add a theme or @sable-tweak overlay from a link or a CSS file on your device."
              after={
                <Button
                  variant="Secondary"
                  fill="Soft"
                  outlined
                  size="300"
                  radii="300"
                  onClick={() => setImportModalOpen(true)}
                >
                  <Text size="B300">Import…</Text>
                </Button>
              }
            />
          </SequenceCard>

          <ThemeImportModal open={importModalOpen} onClose={() => setImportModalOpen(false)} />
        </>
      )}

      {isRemoteMode && (
        <>
          {!isAppearanceMode && <Text size="L400">Browse catalog</Text>}

          {(isAppearanceMode && browseOpen) ||
          catalogQuery.isPending ||
          catalogQuery.isError ||
          (catalogQuery.isSuccess &&
            ((catalogThemeCount > 0 && previewsQuery.isPending) ||
              (catalogTweakCount > 0 && tweakDetailsQuery.isPending))) ? (
            <SequenceCard
              className={SequenceCardStyle}
              variant="SurfaceVariant"
              direction="Column"
              gap="400"
              style={{ overflowX: 'hidden', minWidth: 0 }}
            >
              {isAppearanceMode && browseOpen && (
                <Box direction="Column" gap="300">
                  <Box alignItems="Center" justifyContent="SpaceBetween" gap="200">
                    <Box direction="Column" gap="100">
                      <Text size="T300">Browse catalog</Text>
                      <Text size="T200" priority="300">
                        Find, preview, and save catalog CSS.
                      </Text>
                    </Box>
                    <Box direction="Row" gap="100" alignItems="Center" shrink="No">
                      <Button
                        variant="Secondary"
                        fill="Soft"
                        outlined
                        size="300"
                        radii="300"
                        onClick={() =>
                          queryClient.invalidateQueries({ queryKey: ['theme-catalog-bundle'] })
                        }
                      >
                        <Text size="B300">Refresh</Text>
                      </Button>
                      <Button
                        variant="Secondary"
                        fill="Soft"
                        outlined
                        size="300"
                        radii="300"
                        onClick={() => setBrowseOpen(false)}
                      >
                        <Text size="B300">Back</Text>
                      </Button>
                    </Box>
                  </Box>
                  <Box direction="Row" gap="200">
                    <Chip
                      type="button"
                      variant={catalogSection === 'themes' ? 'Primary' : 'Secondary'}
                      outlined={catalogSection === 'themes'}
                      radii="Pill"
                      onClick={() => setCatalogSection('themes')}
                    >
                      <Text size="B300">Themes ({catalogThemeCount})</Text>
                    </Chip>
                    <Chip
                      type="button"
                      variant={catalogSection === 'tweaks' ? 'Primary' : 'Secondary'}
                      outlined={catalogSection === 'tweaks'}
                      radii="Pill"
                      onClick={() => setCatalogSection('tweaks')}
                    >
                      <Text size="B300">Tweaks ({catalogTweakCount})</Text>
                    </Chip>
                  </Box>
                </Box>
              )}

              {(catalogQuery.isPending || catalogQuery.isError) && (
                <Box direction="Column" gap="200">
                  {catalogQuery.isPending && (
                    <Box direction="Row" gap="200" alignItems="Center">
                      <Spinner variant="Primary" size="400" />
                      <Text size="T300">Loading catalog…</Text>
                    </Box>
                  )}
                  {catalogQuery.isError && (
                    <Text size="T300" style={{ color: 'var(--sable-crit-main)' }}>
                      {catalogQuery.error?.message ?? 'Failed to load catalog'}
                    </Text>
                  )}
                </Box>
              )}

              {catalogQuery.isSuccess && catalogThemeCount > 0 && previewsQuery.isPending && (
                <Box direction="Row" gap="200" alignItems="Center">
                  <Spinner variant="Primary" size="400" />
                  <Text size="T300">Loading previews…</Text>
                </Box>
              )}

              {catalogQuery.isSuccess && catalogTweakCount > 0 && tweakDetailsQuery.isPending && (
                <Box direction="Row" gap="200" alignItems="Center">
                  <Spinner variant="Primary" size="400" />
                  <Text size="T300">Loading tweaks…</Text>
                </Box>
              )}
            </SequenceCard>
          ) : null}

          {catalogQuery.isSuccess &&
            catalogHasEntries &&
            catalogThemeCount > 0 &&
            (!isAppearanceMode || catalogSection === 'themes') &&
            previewsQuery.isSuccess && (
              <SequenceCard
                className={SequenceCardStyle}
                variant="SurfaceVariant"
                direction="Column"
                gap="300"
              >
                {!isAppearanceMode && <SettingTile title="Themes" focusId="catalog-themes" />}
                <Input
                  size="300"
                  radii="300"
                  outlined
                  placeholder="Search themes…"
                  value={themeSearch}
                  onChange={onThemeSearchChange}
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
                <Scroll
                  direction="Vertical"
                  size="300"
                  hideTrack
                  visibility="Hover"
                  style={{
                    height: 'min(68dvh, 44rem)',
                    minHeight: 0,
                    maxWidth: '100%',
                  }}
                >
                  <Box direction="Column" gap="400">
                    <Box className={css.themeCardGrid}>
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
                            loadFullCssText={() => loadFullCssText(row.fullInstallUrl)}
                            scopeSlug={`catalog-${slug}`}
                            sourceLabel={
                              isThirdPartyThemeUrl(
                                row.previewUrl,
                                clientConfig.themeCatalogApprovedHostPrefixes
                              )
                                ? themeUrlHostLabel(row.previewUrl)
                                : 'Official catalog'
                            }
                            copyText={row.previewUrl}
                            thirdParty={isThirdPartyThemeUrl(
                              row.previewUrl,
                              clientConfig.themeCatalogApprovedHostPrefixes
                            )}
                            isFavorited={isFav}
                            onToggleFavorite={() => toggleFavorite(row)}
                            systemTheme={systemTheme}
                            onApplyLight={
                              systemTheme ? () => installFromCatalogLight(row) : undefined
                            }
                            onApplyDark={
                              systemTheme ? () => installFromCatalogDark(row) : undefined
                            }
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
                  </Box>
                </Scroll>
              </SequenceCard>
            )}

          {catalogQuery.isSuccess &&
            catalogHasEntries &&
            catalogTweakCount > 0 &&
            (!isAppearanceMode || catalogSection === 'tweaks') &&
            tweakDetailsQuery.isSuccess && (
              <SequenceCard
                className={SequenceCardStyle}
                variant="SurfaceVariant"
                direction="Column"
                gap="300"
              >
                {!isAppearanceMode && <SettingTile title="Tweaks" focusId="catalog-tweaks" />}
                <Input
                  size="300"
                  radii="300"
                  outlined
                  placeholder="Search tweaks…"
                  value={tweakSearch}
                  onChange={onTweakSearchChange}
                />
                <Box direction="Row" gap="200" wrap="Wrap" alignItems="Center">
                  <Text size="T300">Status:</Text>
                  {(['all', 'enabled', 'disabled'] as const).map((f) => (
                    <Chip
                      key={f}
                      type="button"
                      variant={tweakApplyFilter === f ? 'Primary' : 'Secondary'}
                      outlined={tweakApplyFilter === f}
                      radii="Pill"
                      onClick={() => setTweakApplyFilter(f)}
                    >
                      <Text size="B300">
                        {
                          {
                            all: 'All',
                            enabled: 'Enabled',
                            disabled: 'Disabled',
                          }[f]
                        }
                      </Text>
                    </Chip>
                  ))}
                </Box>
                <Scroll
                  direction="Vertical"
                  size="300"
                  hideTrack
                  visibility="Hover"
                  style={{
                    height: 'min(68dvh, 44rem)',
                    minHeight: 0,
                    maxWidth: '100%',
                  }}
                >
                  <Box direction="Column" gap="200">
                    {catalogTweaksAfterApplyFilter.map((row) => {
                      const isFav = tweakFavorites.some((f) => f.fullUrl === row.fullUrl);
                      const isOn = enabledTweakFullUrls.includes(row.fullUrl);
                      const descParts = [
                        row.description,
                        row.author ? `by ${row.author}` : '',
                        row.tags.length > 0 ? row.tags.join(', ') : '',
                      ].filter(Boolean);
                      const desc =
                        descParts.join(' · ') ||
                        'Applies on top of your current theme after it loads.';
                      return (
                        <CatalogTweakCard
                          key={row.fullUrl}
                          displayName={row.displayName}
                          description={desc}
                          copyUrl={row.fullUrl}
                          thirdPartyChip={isThirdPartyThemeUrl(
                            row.fullUrl,
                            clientConfig.themeCatalogApprovedHostPrefixes
                          )}
                          isFavorited={isFav}
                          onToggleFavorite={() => toggleCatalogTweakFavorite(row)}
                          isOn={isOn}
                          onSetApplied={(v) =>
                            setTweakApplied(row.fullUrl, v, {
                              displayName: row.displayName,
                              basename: row.basename,
                              pruneUnpinnedFavoriteOnDisable: true,
                            })
                          }
                          cssText={row.fullCssText}
                          sourceLabel={
                            isThirdPartyThemeUrl(
                              row.fullUrl,
                              clientConfig.themeCatalogApprovedHostPrefixes
                            )
                              ? themeUrlHostLabel(row.fullUrl)
                              : 'Official catalog'
                          }
                        />
                      );
                    })}
                    {filteredTweakRows.length === 0 && (
                      <Text size="T300" priority="300">
                        No tweaks match your search.
                      </Text>
                    )}
                    {filteredTweakRows.length > 0 && catalogTweaksAfterApplyFilter.length === 0 && (
                      <Text size="T300" priority="300">
                        No tweaks match this status filter.
                      </Text>
                    )}
                  </Box>
                </Scroll>
              </SequenceCard>
            )}
        </>
      )}

      {isChatMode && (
        <>
          <SettingToggle
            title="Theme & tweak cards"
            focusId="theme-chat-sable-widgets"
            description="Show interactive Sable CSS cards instead of plain links."
            value={sableChatWidgets}
            onChange={setSableChatWidgets}
          />
          <SettingToggle
            title="Auto-load approved URLs"
            focusId="theme-chat-auto-approved"
            description="Automatically fetch previews from approved catalog hosts."
            value={autoPreviewApprovedUrls}
            onChange={setAutoPreviewApprovedUrls}
            disabled={!sableChatWidgets}
          />
          <SettingToggle
            title="Auto-load any URL"
            focusId="theme-chat-auto-any"
            description="Not recommended. Automatically fetch potentially unsafe third-party links."
            value={autoPreviewAnyUrl}
            onChange={setAutoPreviewAnyUrl}
            disabled={!sableChatWidgets}
          />
        </>
      )}
    </Box>
  );
}
