import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect } from 'react';
import { useAtomValue } from 'jotai';
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
import { settingsAtom, settingsInitializedAtom } from '$state/settings';
import {
  clearStoredAppliedThemeCss,
  clearStoredAppliedTweakCss,
  getCachedThemeCss,
  getStoredAppliedThemeCss,
  getStoredAppliedTweakCss,
  putCachedThemeCss,
  putStoredAppliedThemeCss,
  putStoredAppliedTweakCss,
} from '$app/theme/cache';
import { isLocalImportBundledUrl } from '$app/theme/localImportUrls';

const REMOTE_STYLE_ID = 'sable-remote-theme-style';
const REMOTE_TWEAKS_STYLE_ID = 'sable-remote-tweaks-style';
const LIGHT_THEME_COLOR = '#ffffff';
const DARK_THEME_COLOR = '#1b1a21';

function syncDocumentThemeMetadata(kind: ThemeKind): void {
  const bootTheme = kind === ThemeKind.Dark ? 'dark' : 'light';
  const themeColor = kind === ThemeKind.Dark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
  document.documentElement.dataset.sableBootTheme = bootTheme;
  document.documentElement.style.backgroundColor = themeColor;

  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = themeColor;
  });
}

function setInlineStyleText(id: string, text: string | undefined): void {
  if (!text) {
    document.getElementById(id)?.remove();
    return;
  }
  let node = document.getElementById(id) as HTMLStyleElement | null;
  if (!node) {
    node = document.createElement('style');
    node.id = id;
  }
  document.head.appendChild(node);
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

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
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return undefined;
    const text = await res.text();
    try {
      await putCachedThemeCss(url, text);
    } catch {
      /* cache optional */
    }
    return text;
  } catch {
    return undefined;
  }
}

export function UnAuthRouteThemeManager() {
  const systemThemeKind = useSystemThemeKind();

  useLayoutEffect(() => {
    setInlineStyleText(REMOTE_STYLE_ID, undefined);
    setInlineStyleText(REMOTE_TWEAKS_STYLE_ID, undefined);
    syncDocumentThemeMetadata(systemThemeKind);
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
  const settingsInitialized = useAtomValue(settingsInitializedAtom);
  const [saturation] = useSetting(settingsAtom, 'saturationLevel');
  const [underlineLinks] = useSetting(settingsAtom, 'underlineLinks');
  const [reducedMotion] = useSetting(settingsAtom, 'reducedMotion');
  const [enabledTweakUrls] = useSetting(settingsAtom, 'themeRemoteEnabledTweakFullUrls');

  useLayoutEffect(() => {
    // Apply the locally resolved theme immediately so the React app matches the
    // pre-paint boot theme. Account-data settings can still override it once
    // settings sync initializes.
    syncDocumentThemeMetadata(activeTheme.kind);
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

  useLayoutEffect(() => {
    if (!settingsInitialized) return;

    const url = activeTheme.remoteFullUrl?.trim();
    if (!url) {
      setInlineStyleText(REMOTE_STYLE_ID, undefined);
      clearStoredAppliedThemeCss();
      return;
    }
    setInlineStyleText(REMOTE_STYLE_ID, getStoredAppliedThemeCss(url));
  }, [settingsInitialized, activeTheme.remoteFullUrl]);

  useLayoutEffect(() => {
    if (!settingsInitialized) return;

    const urls = (enabledTweakUrls ?? []).map((url) => url.trim()).filter(Boolean);
    if (urls.length === 0) {
      setInlineStyleText(REMOTE_TWEAKS_STYLE_ID, undefined);
      clearStoredAppliedTweakCss();
      return;
    }
    setInlineStyleText(REMOTE_TWEAKS_STYLE_ID, getStoredAppliedTweakCss(urls));
  }, [settingsInitialized, enabledTweakUrls]);

  useEffect(() => {
    if (!settingsInitialized) return undefined;

    const url = activeTheme.remoteFullUrl?.trim();
    let cancelled = false;

    if (url) {
      (async () => {
        const text = await loadRemoteThemeCssText(url);
        if (cancelled) return;
        if (!text) {
          setInlineStyleText(REMOTE_STYLE_ID, undefined);
          clearStoredAppliedThemeCss();
          return;
        }
        setInlineStyleText(REMOTE_STYLE_ID, text);
        putStoredAppliedThemeCss(url, text);
      })();
    } else {
      setInlineStyleText(REMOTE_STYLE_ID, undefined);
      clearStoredAppliedThemeCss();
    }

    return () => {
      cancelled = true;
    };
  }, [settingsInitialized, activeTheme.remoteFullUrl]);

  useEffect(() => {
    if (!settingsInitialized) return undefined;

    const urls = (enabledTweakUrls ?? []).filter((u) => u.trim().length > 0);
    let cancelled = false;

    if (urls.length === 0) {
      setInlineStyleText(REMOTE_TWEAKS_STYLE_ID, undefined);
      clearStoredAppliedTweakCss();
      return undefined;
    }

    (async () => {
      const texts = await Promise.all(urls.map((url) => loadRemoteThemeCssText(url.trim())));
      if (cancelled) return;
      const chunks = texts.filter((text): text is string => Boolean(text));
      if (chunks.length === 0) {
        setInlineStyleText(REMOTE_TWEAKS_STYLE_ID, undefined);
        clearStoredAppliedTweakCss();
        return;
      }
      const text = chunks.join('\n\n');
      setInlineStyleText(REMOTE_TWEAKS_STYLE_ID, text);
      putStoredAppliedTweakCss(urls, text);
    })();

    return () => {
      cancelled = true;
    };
  }, [settingsInitialized, enabledTweakUrls]);

  return (
    <ArboriumThemeBridge kind={activeTheme.kind}>
      <ThemeContextProvider value={activeTheme}>{children}</ThemeContextProvider>
    </ArboriumThemeBridge>
  );
}
