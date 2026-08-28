import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { configClass, varsClass } from 'folds';
import {
  DarkTheme,
  LightTheme,
  ThemeContextProvider,
  ThemeKind,
  useActiveTheme,
  useSystemThemeKind,
} from '$hooks/useTheme';
import { ArboriumThemeBridge } from '$plugins/arborium';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useOptionalClientConfig } from '$hooks/useClientConfig';
import { getCachedThemeCss, putCachedThemeCss, subscribeThemeCacheUpdates } from '../theme/cache';
import { applyCspNonce } from '$utils/cspNonce';
import { isLocalImportBundledUrl } from '../theme/localImportUrls';
import { getEmbeddedLocalTweakCss } from '../theme/syncedTweakCss';
import { themeCatalogListingBaseUrl } from '../theme/catalogDefaults';
import { fetch } from '$utils/fetch';
import {
  THEME_CATALOG_AUTO_UPDATE_INTERVAL_MS,
  updateInstalledCatalogPackages,
} from '../theme/catalogUpdater';

const REMOTE_STYLE_ID = 'sable-remote-theme-style';
const REMOTE_TWEAKS_STYLE_ID = 'sable-remote-tweaks-style';

async function loadRemoteThemeCssText(url: string): Promise<string | undefined> {
  try {
    const cached = await getCachedThemeCss(url);
    if (cached) return cached;
  } catch {
    /* IndexedDB unavailable */
  }
  if (isLocalImportBundledUrl(url)) {
    return undefined;
  }
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) return undefined;
  const text = await res.text();
  try {
    await putCachedThemeCss(url, text);
  } catch {
    /* cache optional */
  }
  return text;
}

function CatalogThemeAutoUpdater() {
  const clientConfig = useOptionalClientConfig();
  const [catalogEnabled] = useSetting(settingsAtom, 'themeRemoteCatalogEnabled');
  const [favorites] = useSetting(settingsAtom, 'themeRemoteFavorites');
  const [tweakFavorites] = useSetting(settingsAtom, 'themeRemoteTweakFavorites');
  const [manualUrl] = useSetting(settingsAtom, 'themeRemoteManualFullUrl');
  const [lightUrl] = useSetting(settingsAtom, 'themeRemoteLightFullUrl');
  const [darkUrl] = useSetting(settingsAtom, 'themeRemoteDarkFullUrl');
  const [enabledTweakUrls] = useSetting(settingsAtom, 'themeRemoteEnabledTweakFullUrls');
  const inFlightRef = useRef<Promise<unknown> | null>(null);

  const installedThemeUrls = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...(favorites ?? []).map((favorite) => favorite.fullUrl),
            manualUrl,
            lightUrl,
            darkUrl,
          ].filter((url): url is string => Boolean(url))
        )
      ),
    [darkUrl, favorites, lightUrl, manualUrl]
  );
  const installedTweakUrls = useMemo(
    () =>
      Array.from(
        new Set([
          ...(tweakFavorites ?? []).map((favorite) => favorite.fullUrl),
          ...(enabledTweakUrls ?? []),
        ])
      ),
    [enabledTweakUrls, tweakFavorites]
  );

  const checkForUpdates = useCallback(() => {
    if (!catalogEnabled || !clientConfig || inFlightRef.current) return;
    if (installedThemeUrls.length === 0 && installedTweakUrls.length === 0) return;
    const task = updateInstalledCatalogPackages({
      catalogBase: themeCatalogListingBaseUrl(clientConfig.themeCatalogBaseUrl?.trim()),
      manifestUrl: clientConfig.themeCatalogManifestUrl?.trim() || undefined,
      installedThemeUrls,
      installedTweakUrls,
      maxAgeMs: THEME_CATALOG_AUTO_UPDATE_INTERVAL_MS,
    })
      .catch(() => undefined)
      .finally(() => {
        if (inFlightRef.current === task) inFlightRef.current = null;
      });
    inFlightRef.current = task;
  }, [catalogEnabled, clientConfig, installedThemeUrls, installedTweakUrls]);

  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdates();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [checkForUpdates]);

  return null;
}

export function UnAuthRouteThemeManager() {
  const systemThemeKind = useSystemThemeKind();

  useEffect(() => {
    document.body.className = '';
    document.body.classList.add(configClass, varsClass);
    if (systemThemeKind === ThemeKind.Dark) {
      document.body.classList.add(...DarkTheme.classNames);
    }
    if (systemThemeKind === ThemeKind.Light) {
      document.body.classList.add(...LightTheme.classNames);
    }
  }, [systemThemeKind]);

  return <ArboriumThemeBridge kind={systemThemeKind} />;
}

export function AuthRouteThemeManager({ children }: { children: ReactNode }) {
  const activeTheme = useActiveTheme();
  const [saturation] = useSetting(settingsAtom, 'saturationLevel');
  const [underlineLinks] = useSetting(settingsAtom, 'underlineLinks');
  const [reducedMotion] = useSetting(settingsAtom, 'reducedMotion');
  const [enabledTweakUrls] = useSetting(settingsAtom, 'themeRemoteEnabledTweakFullUrls');
  const [tweakFavorites] = useSetting(settingsAtom, 'themeRemoteTweakFavorites');

  useEffect(() => {
    document.body.className = '';
    document.body.classList.add(configClass, varsClass);
    document.body.classList.add(...activeTheme.classNames);

    if (underlineLinks) {
      document.body.classList.add('force-underline-links');
    } else {
      document.body.classList.remove('force-underline-links');
    }

    if (reducedMotion) {
      document.body.classList.add('reduced-motion');
    } else {
      document.body.classList.remove('reduced-motion');
    }

    if (saturation === 0) {
      document.body.style.filter = 'grayscale(1)';
    } else if (saturation && saturation < 100) {
      document.body.style.filter = `saturate(${saturation}%)`;
    } else {
      document.body.style.filter = '';
    }
  }, [activeTheme, saturation, underlineLinks, reducedMotion]);

  useEffect(() => {
    const url = activeTheme.remoteFullUrl?.trim();
    let cancelled = false;

    if (url) {
      const applyThemeCss = async () => {
        const text = await loadRemoteThemeCssText(url);
        if (cancelled) return;
        if (!text) {
          document.getElementById(REMOTE_STYLE_ID)?.remove();
          return;
        }
        let node = document.getElementById(REMOTE_STYLE_ID) as HTMLStyleElement | null;
        if (!node) {
          node = document.createElement('style');
          node.id = REMOTE_STYLE_ID;
          applyCspNonce(node);
          document.head.appendChild(node);
        }
        node.textContent = text;
      };
      applyThemeCss().catch(() => undefined);
      const unsubscribe = subscribeThemeCacheUpdates((update) => {
        if (update.url === url) applyThemeCss().catch(() => undefined);
      });
      return () => {
        cancelled = true;
        unsubscribe();
      };
    } else {
      document.getElementById(REMOTE_STYLE_ID)?.remove();
    }

    return () => {
      cancelled = true;
    };
  }, [activeTheme.remoteFullUrl]);

  useEffect(() => {
    const urls = (enabledTweakUrls ?? []).filter((u) => u.trim().length > 0);
    let cancelled = false;

    if (urls.length === 0) {
      document.getElementById(REMOTE_TWEAKS_STYLE_ID)?.remove();
      return undefined;
    }

    const applyTweakCss = async () => {
      const texts = await Promise.all(
        urls.map(async (url) => {
          const trimmedUrl = url.trim();
          const embeddedCss = getEmbeddedLocalTweakCss(
            tweakFavorites?.find((favorite) => favorite.fullUrl === trimmedUrl)
          );
          return embeddedCss ?? loadRemoteThemeCssText(trimmedUrl);
        })
      );
      if (cancelled) return;
      const chunks = texts.filter((text): text is string => Boolean(text));
      let node = document.getElementById(REMOTE_TWEAKS_STYLE_ID) as HTMLStyleElement | null;
      if (!node) {
        node = document.createElement('style');
        node.id = REMOTE_TWEAKS_STYLE_ID;
        applyCspNonce(node);
        document.head.appendChild(node);
      }
      node.textContent = chunks.join('\n\n');
    };
    applyTweakCss().catch(() => undefined);
    const activeUrls = new Set(urls.map((url) => url.trim()));
    const unsubscribe = subscribeThemeCacheUpdates((update) => {
      if (activeUrls.has(update.url)) applyTweakCss().catch(() => undefined);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabledTweakUrls, tweakFavorites]);

  return (
    <>
      <CatalogThemeAutoUpdater />
      <ArboriumThemeBridge kind={activeTheme.kind}>
        <ThemeContextProvider value={activeTheme}>{children}</ThemeContextProvider>
      </ArboriumThemeBridge>
    </>
  );
}
