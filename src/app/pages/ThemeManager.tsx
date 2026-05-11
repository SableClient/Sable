import type { ReactNode } from 'react';
import { useEffect } from 'react';
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
import { getCachedThemeCss, putCachedThemeCss } from '../theme/cache';
import { isLocalImportBundledUrl } from '../theme/localImportUrls';

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
      (async () => {
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
          document.head.appendChild(node);
        }
        node.textContent = text;
      })();
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

    (async () => {
      const texts = await Promise.all(urls.map((url) => loadRemoteThemeCssText(url.trim())));
      if (cancelled) return;
      const chunks = texts.filter((text): text is string => Boolean(text));
      let node = document.getElementById(REMOTE_TWEAKS_STYLE_ID) as HTMLStyleElement | null;
      if (!node) {
        node = document.createElement('style');
        node.id = REMOTE_TWEAKS_STYLE_ID;
        document.head.appendChild(node);
      }
      node.textContent = chunks.join('\n\n');
    })();

    return () => {
      cancelled = true;
    };
  }, [enabledTweakUrls]);

  return (
    <ArboriumThemeBridge kind={activeTheme.kind}>
      <ThemeContextProvider value={activeTheme}>{children}</ThemeContextProvider>
    </ArboriumThemeBridge>
  );
}
