import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Text } from 'folds';
import { useStore } from 'jotai/react';

import { useClientConfig } from '$hooks/useClientConfig';
import { ThemeKind } from '$hooks/useTheme';
import { usePatchSettings } from '$features/settings/cosmetics/themeSettingsPatch';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom, type Settings, type ThemeRemoteFavorite } from '$state/settings';
import {
  extractFullThemeUrlFromPreview,
  parseSableThemeMetadata,
  type SableThemeContrast,
} from '../../theme/metadata';
import { putCachedThemeCss } from '../../theme/cache';
import { fullUrlFromPreviewUrl } from '../../theme/previewUrls';
import { isApprovedCatalogHostUrl } from '../../theme/themeApproval';
import { ThemePreviewCard } from '../theme/ThemePreviewCard';
import { SableChatPreviewPlaceholder } from './SableChatPreviewPlaceholder';
import { ThemeThirdPartyBanner } from './ThemeThirdPartyBanner';

function isHttps(url: string): boolean {
  return /^https:\/\//i.test(url);
}

function isPreviewThemeUrl(url: string): boolean {
  return /\.preview\.sable\.css(\?|#|$)/i.test(url);
}

function basenameFromUrl(url: string): string {
  const tail = url.split('/').pop() ?? url;
  return tail.replace(/\.preview\.sable\.css(\?|#|$)/i, '').replace(/\.sable\.css(\?|#|$)/i, '');
}

function baseLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return 'Unofficial theme';
  }
}

export function ThemePreviewUrlCard({ url }: { url: string }) {
  const clientConfig = useClientConfig();
  const store = useStore();
  const patchSettings = usePatchSettings();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [autoPreviewApproved] = useSetting(settingsAtom, 'themeChatAutoPreviewApprovedUrls');
  const [autoPreviewAny] = useSetting(settingsAtom, 'themeChatAutoPreviewAnyUrl');
  const [favorites] = useSetting(settingsAtom, 'themeRemoteFavorites');
  const [systemTheme] = useSetting(settingsAtom, 'useSystemTheme');
  const [manualRemoteFullUrl] = useSetting(settingsAtom, 'themeRemoteManualFullUrl');
  const [lightRemoteFullUrl] = useSetting(settingsAtom, 'themeRemoteLightFullUrl');
  const [darkRemoteFullUrl] = useSetting(settingsAtom, 'themeRemoteDarkFullUrl');

  const isEligibleUrl = useMemo(() => isHttps(url) && isPreviewThemeUrl(url), [url]);

  const prefixes = clientConfig.themeCatalogApprovedHostPrefixes;

  const isOfficial = useMemo(() => isApprovedCatalogHostUrl(url, prefixes), [prefixes, url]);

  const shouldAutoFetch = useMemo(
    () => (isOfficial && autoPreviewApproved) || (!isOfficial && autoPreviewAny),
    [isOfficial, autoPreviewApproved, autoPreviewAny]
  );

  const [userTriggeredLoad, setUserTriggeredLoad] = useState(false);

  useEffect(() => {
    setUserTriggeredLoad(false);
  }, [url]);

  const fetchEnabled = useMemo(
    () => isEligibleUrl && (shouldAutoFetch || userTriggeredLoad),
    [isEligibleUrl, shouldAutoFetch, userTriggeredLoad]
  );

  const showThirdPartyBanner = useMemo(
    () => !isApprovedCatalogHostUrl(url, prefixes),
    [prefixes, url]
  );

  const previewQuery = useQuery({
    queryKey: ['theme-preview-embed', url],
    enabled: fetchEnabled,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`theme preview fetch failed: ${res.status}`);
      const previewText = await res.text();
      const meta = parseSableThemeMetadata(previewText);
      const fullFromMeta = extractFullThemeUrlFromPreview(previewText);
      const fullUrl = fullUrlFromPreviewUrl(url, fullFromMeta);
      const kind = meta.kind ?? ThemeKind.Light;
      const displayName = meta.name?.trim() || basenameFromUrl(url);
      const author = meta.author?.trim() || undefined;
      const contrast: SableThemeContrast = meta.contrast === 'high' ? 'high' : 'low';
      const tags = meta.tags ?? [];
      return { previewText, fullUrl, kind, displayName, author, contrast, tags };
    },
  });

  const revertRef = useRef<Partial<Settings> | null>(null);
  const lastAutoSavedUrlRef = useRef<string | null>(null);
  const [canRevert, setCanRevert] = useState(false);
  const [favoriteTouched, setFavoriteTouched] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  const appliedHere = useMemo(() => {
    const u = previewQuery.data?.fullUrl;
    if (!u) return false;
    if (systemTheme) {
      return lightRemoteFullUrl === u || darkRemoteFullUrl === u;
    }
    return manualRemoteFullUrl === u;
  }, [
    previewQuery.data?.fullUrl,
    systemTheme,
    lightRemoteFullUrl,
    darkRemoteFullUrl,
    manualRemoteFullUrl,
  ]);

  const canRevertUi = useMemo(() => canRevert || appliedHere, [canRevert, appliedHere]);

  const isFav = useMemo(
    () => favorites.some((f) => f.fullUrl === previewQuery.data?.fullUrl),
    [favorites, previewQuery.data?.fullUrl]
  );

  const pruneFavorites = useCallback(
    (nextFavorites: ThemeRemoteFavorite[], nextActive: string[]) => {
      const active = new Set(nextActive);
      return nextFavorites.filter((f) => f.pinned === true || active.has(f.fullUrl));
    },
    []
  );

  const toggleFavorite = useCallback(async () => {
    const fullUrl = previewQuery.data?.fullUrl;
    if (!fullUrl) return;

    setFavoriteError(null);

    const existing = favorites.find((f) => f.fullUrl === fullUrl);
    if (existing) {
      setFavoriteTouched(false);
      const cleared: Partial<Settings> = {};
      if (lightRemoteFullUrl === fullUrl) {
        cleared.themeRemoteLightFullUrl = undefined;
        cleared.themeRemoteLightKind = undefined;
      }
      if (darkRemoteFullUrl === fullUrl) {
        cleared.themeRemoteDarkFullUrl = undefined;
        cleared.themeRemoteDarkKind = undefined;
      }
      if (manualRemoteFullUrl === fullUrl) {
        cleared.themeRemoteManualFullUrl = undefined;
        cleared.themeRemoteManualKind = undefined;
      }

      const nextFavs = favorites.filter((f) => f.fullUrl !== fullUrl);
      const nextActive = [manualRemoteFullUrl, lightRemoteFullUrl, darkRemoteFullUrl]
        .filter((u): u is string => Boolean(u && u.trim().length > 0))
        .filter((u) => u !== fullUrl);
      patchSettings({ ...cleared, themeRemoteFavorites: pruneFavorites(nextFavs, nextActive) });
      return;
    }

    setFavoriteTouched(true);
    const res = await fetch(fullUrl, { mode: 'cors' });
    if (!mountedRef.current) return;
    if (!res.ok) {
      setFavoriteError(`Theme CSS not found (${res.status})`);
      return;
    }
    const cssText = await res.text();
    if (!mountedRef.current) return;
    await putCachedThemeCss(fullUrl, cssText);
    if (!mountedRef.current) return;

    const next: ThemeRemoteFavorite = {
      fullUrl,
      displayName: previewQuery.data?.displayName ?? basenameFromUrl(fullUrl),
      basename: basenameFromUrl(fullUrl),
      kind: previewQuery.data?.kind === ThemeKind.Dark ? 'dark' : 'light',
      pinned: true,
    };

    patchSettings({ themeRemoteFavorites: [...favorites, next] });
  }, [
    darkRemoteFullUrl,
    favorites,
    lightRemoteFullUrl,
    manualRemoteFullUrl,
    patchSettings,
    previewQuery.data,
    pruneFavorites,
  ]);

  const applyManual = useCallback(() => {
    const fullUrl = previewQuery.data?.fullUrl;
    if (!fullUrl) return;
    const kind = previewQuery.data?.kind === ThemeKind.Dark ? 'dark' : 'light';
    patchSettings({ themeRemoteManualFullUrl: fullUrl, themeRemoteManualKind: kind });
  }, [patchSettings, previewQuery.data]);

  const applyLightSlot = useCallback(() => {
    const fullUrl = previewQuery.data?.fullUrl;
    if (!fullUrl) return;
    const kind = previewQuery.data?.kind === ThemeKind.Dark ? 'dark' : 'light';
    patchSettings({ themeRemoteLightFullUrl: fullUrl, themeRemoteLightKind: kind });
  }, [patchSettings, previewQuery.data]);

  const applyDarkSlot = useCallback(() => {
    const fullUrl = previewQuery.data?.fullUrl;
    if (!fullUrl) return;
    const kind = previewQuery.data?.kind === ThemeKind.Dark ? 'dark' : 'light';
    patchSettings({ themeRemoteDarkFullUrl: fullUrl, themeRemoteDarkKind: kind });
  }, [patchSettings, previewQuery.data]);

  const ensureFavorited = useCallback(async (): Promise<boolean> => {
    const fullUrl = previewQuery.data?.fullUrl;
    if (!fullUrl) return false;
    if (favorites.some((f) => f.fullUrl === fullUrl)) return false;

    const res = await fetch(fullUrl, { mode: 'cors' });
    if (!mountedRef.current) return false;
    if (!res.ok) return false;
    const cssText = await res.text();
    if (!mountedRef.current) return false;
    await putCachedThemeCss(fullUrl, cssText);
    if (!mountedRef.current) return false;

    const next: ThemeRemoteFavorite = {
      fullUrl,
      displayName: previewQuery.data!.displayName,
      basename: basenameFromUrl(fullUrl),
      kind: previewQuery.data!.kind === ThemeKind.Dark ? 'dark' : 'light',
      pinned: false,
    };

    patchSettings({ themeRemoteFavorites: [...favorites, next] });
    return true;
  }, [favorites, patchSettings, previewQuery.data]);

  const snapshotAnd = useCallback(
    async (fn: () => void, nextApplied: Partial<Settings>) => {
      const current = store.get(settingsAtom);
      if (
        nextApplied.themeRemoteManualFullUrl &&
        current.themeRemoteManualFullUrl === nextApplied.themeRemoteManualFullUrl
      ) {
        return;
      }
      if (
        nextApplied.themeRemoteLightFullUrl &&
        current.themeRemoteLightFullUrl === nextApplied.themeRemoteLightFullUrl
      ) {
        return;
      }
      if (
        nextApplied.themeRemoteDarkFullUrl &&
        current.themeRemoteDarkFullUrl === nextApplied.themeRemoteDarkFullUrl
      ) {
        return;
      }
      revertRef.current = {
        themeId: current.themeId,
        themeRemoteManualFullUrl: current.themeRemoteManualFullUrl,
        themeRemoteManualKind: current.themeRemoteManualKind,
        themeRemoteLightFullUrl: current.themeRemoteLightFullUrl,
        themeRemoteLightKind: current.themeRemoteLightKind,
        themeRemoteDarkFullUrl: current.themeRemoteDarkFullUrl,
        themeRemoteDarkKind: current.themeRemoteDarkKind,
      } satisfies Partial<Settings>;
      setCanRevert(true);

      if (!favoriteTouched) {
        const added = await ensureFavorited();
        if (!mountedRef.current) return;
        lastAutoSavedUrlRef.current = added ? (previewQuery.data?.fullUrl ?? null) : null;
      } else {
        lastAutoSavedUrlRef.current = null;
      }

      fn();
      if (!mountedRef.current) return;

      const nextActive = [
        nextApplied.themeRemoteManualFullUrl ?? manualRemoteFullUrl,
        nextApplied.themeRemoteLightFullUrl ?? lightRemoteFullUrl,
        nextApplied.themeRemoteDarkFullUrl ?? darkRemoteFullUrl,
      ].filter((u): u is string => Boolean(u && u.trim().length > 0));

      patchSettings({
        themeRemoteFavorites: pruneFavorites(
          store.get(settingsAtom).themeRemoteFavorites,
          nextActive
        ),
      });
    },
    [
      ensureFavorited,
      favoriteTouched,
      lightRemoteFullUrl,
      darkRemoteFullUrl,
      manualRemoteFullUrl,
      patchSettings,
      previewQuery.data?.fullUrl,
      pruneFavorites,
      store,
    ]
  );

  const revert = useCallback(() => {
    const syncFavoritesAfterRevert = (removeAutoSavedFullUrl: string | null) => {
      const after = store.get(settingsAtom);
      let favs = after.themeRemoteFavorites;
      if (removeAutoSavedFullUrl) {
        favs = favs.filter((f) => f.fullUrl !== removeAutoSavedFullUrl);
      }
      const nextActive = [
        after.themeRemoteManualFullUrl,
        after.themeRemoteLightFullUrl,
        after.themeRemoteDarkFullUrl,
      ].filter((u): u is string => Boolean(u && u.trim().length > 0));
      patchSettings({
        themeRemoteFavorites: pruneFavorites(favs, nextActive),
      });
    };

    const snap = revertRef.current;
    if (snap) {
      patchSettings(snap);
      syncFavoritesAfterRevert(lastAutoSavedUrlRef.current);

      revertRef.current = null;
      lastAutoSavedUrlRef.current = null;
      setCanRevert(false);
      return;
    }

    const u = previewQuery.data?.fullUrl;
    if (!u) return;
    const partial: Partial<Settings> = {};
    if (lightRemoteFullUrl === u) {
      partial.themeRemoteLightFullUrl = undefined;
      partial.themeRemoteLightKind = undefined;
    }
    if (darkRemoteFullUrl === u) {
      partial.themeRemoteDarkFullUrl = undefined;
      partial.themeRemoteDarkKind = undefined;
    }
    if (manualRemoteFullUrl === u) {
      partial.themeRemoteManualFullUrl = undefined;
      partial.themeRemoteManualKind = undefined;
      partial.themeId = previewQuery.data?.kind === ThemeKind.Dark ? 'dark-theme' : 'light-theme';
    }
    if (Object.keys(partial).length === 0) return;
    patchSettings(partial);
    syncFavoritesAfterRevert(null);
  }, [
    darkRemoteFullUrl,
    lightRemoteFullUrl,
    manualRemoteFullUrl,
    patchSettings,
    previewQuery.data?.fullUrl,
    previewQuery.data?.kind,
    pruneFavorites,
    store,
  ]);

  if (!isEligibleUrl) return null;

  if (!shouldAutoFetch && !userTriggeredLoad) {
    return (
      <SableChatPreviewPlaceholder
        kind="theme"
        url={url}
        hostLabel={baseLabel(url)}
        isApprovedHost={isOfficial}
        onLoadPreview={() => {
          setUserTriggeredLoad(true);
        }}
      />
    );
  }

  const title = previewQuery.data?.displayName ?? 'Theme preview';
  let kindLabel = 'Theme';
  if (previewQuery.data?.kind === ThemeKind.Dark) kindLabel = 'Dark';
  else if (previewQuery.data?.kind === ThemeKind.Light) kindLabel = 'Light';
  const contrastLabel = previewQuery.data?.contrast ? `${previewQuery.data.contrast} contrast` : '';
  const authorLabel = previewQuery.data?.author ? `by ${previewQuery.data.author}` : '';
  const tagsLabel =
    previewQuery.data?.tags && previewQuery.data.tags.length > 0
      ? previewQuery.data.tags.join(', ')
      : '';
  const sourceLabel = isOfficial ? 'Official theme' : baseLabel(url);
  const subtitleLine1 = [kindLabel, contrastLabel].filter(Boolean).join(' · ');
  const subtitleLine2 = [authorLabel, tagsLabel].filter(Boolean).join(' · ');
  const subtitleLine3 = sourceLabel;
  const subtitle = (
    <>
      {subtitleLine1}
      {subtitleLine2 ? (
        <>
          <br />
          {subtitleLine2}
        </>
      ) : null}
      <br />
      {subtitleLine3}
    </>
  );
  const fullUrl = previewQuery.data?.fullUrl;

  return (
    <Box
      direction="Column"
      gap="300"
      style={{
        width: '400px',
        maxWidth: '100%',
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      <ThemePreviewCard
        title={title}
        subtitle={subtitle}
        beforePreview={
          showThirdPartyBanner ? <ThemeThirdPartyBanner hostLabel={baseLabel(url)} /> : undefined
        }
        previewCssText={previewQuery.data?.previewText ?? ''}
        scopeSlug={`chat-${basenameFromUrl(url)}`}
        copyText={url}
        isFavorited={fullUrl ? isFav : false}
        onToggleFavorite={fullUrl ? () => toggleFavorite() : undefined}
        systemTheme={systemTheme}
        onApplyLight={
          systemTheme && fullUrl
            ? () => snapshotAnd(() => applyLightSlot(), { themeRemoteLightFullUrl: fullUrl })
            : undefined
        }
        onApplyDark={
          systemTheme && fullUrl
            ? () => snapshotAnd(() => applyDarkSlot(), { themeRemoteDarkFullUrl: fullUrl })
            : undefined
        }
        onApplyManual={
          !systemTheme && fullUrl
            ? () => snapshotAnd(() => applyManual(), { themeRemoteManualFullUrl: fullUrl })
            : undefined
        }
        isAppliedLight={fullUrl ? lightRemoteFullUrl === fullUrl : false}
        isAppliedDark={fullUrl ? darkRemoteFullUrl === fullUrl : false}
        isAppliedManual={fullUrl ? manualRemoteFullUrl === fullUrl : false}
        canRevert={canRevertUi}
        onRevert={revert}
      />
      {previewQuery.isPending && (
        <Text size="T200" priority="300">
          Loading preview…
        </Text>
      )}
      {favoriteError && (
        <Text size="T200" priority="300">
          {favoriteError}
        </Text>
      )}
    </Box>
  );
}
