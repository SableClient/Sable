import type { ThemeRemoteTweakFavorite } from '$state/settings';

import { getCachedThemeCss, putCachedThemeCss } from './cache';
import { isLocalImportTweakUrl } from './localImportUrls';

/**
 * Restores replicated local tweak CSS to the device-local cache. Cache failures
 * are deliberately ignored: settings sync must work without IndexedDB.
 */
export async function hydrateSyncedLocalTweakCss(
  favorites: ThemeRemoteTweakFavorite[]
): Promise<void> {
  await Promise.all(
    favorites.map(async ({ fullUrl, cssText }) => {
      if (!isLocalImportTweakUrl(fullUrl) || typeof cssText !== 'string') return;
      try {
        await putCachedThemeCss(fullUrl, cssText);
      } catch {
        // IndexedDB may be unavailable (for example in private browsing).
      }
    })
  );
}

/** CSS embedded in settings is only valid for local tweak imports. */
export function getEmbeddedLocalTweakCss(
  favorite: ThemeRemoteTweakFavorite | undefined
): string | undefined {
  return favorite && isLocalImportTweakUrl(favorite.fullUrl) ? favorite.cssText : undefined;
}

/** Resolve saved tweak CSS from cache, with embedded local CSS as a cache-independent fallback. */
export async function resolveSavedTweakCss(favorite: ThemeRemoteTweakFavorite): Promise<string> {
  const embeddedCss = getEmbeddedLocalTweakCss(favorite);
  if (embeddedCss) {
    void putCachedThemeCss(favorite.fullUrl, embeddedCss).catch(() => undefined);
    return embeddedCss;
  }
  try {
    const cachedCss = await getCachedThemeCss(favorite.fullUrl);
    if (cachedCss) return cachedCss;
  } catch {
    // Embedded CSS remains usable when IndexedDB is unavailable.
  }
  return '';
}

/** Restores CSS for pre-sync local favorites from the device cache before upload. */
export async function backfillLocalTweakCss(
  favorites: ThemeRemoteTweakFavorite[]
): Promise<ThemeRemoteTweakFavorite[]> {
  return Promise.all(
    favorites.map(async (favorite) => {
      if (!isLocalImportTweakUrl(favorite.fullUrl) || typeof favorite.cssText === 'string') {
        return favorite;
      }
      try {
        const cssText = await getCachedThemeCss(favorite.fullUrl);
        return typeof cssText === 'string' ? { ...favorite, cssText } : favorite;
      } catch {
        return favorite;
      }
    })
  );
}
