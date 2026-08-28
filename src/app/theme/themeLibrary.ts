import type { ThemeRemoteFavorite, ThemeRemoteTweakFavorite } from '$state/settings';

export function pruneThemeFavorites(
  favorites: ThemeRemoteFavorite[],
  activeUrls: Array<string | undefined>
): ThemeRemoteFavorite[] {
  const active = new Set(activeUrls.filter((url): url is string => Boolean(url)));
  return favorites.filter((favorite) => favorite.pinned === true || active.has(favorite.fullUrl));
}

export function pruneThemeTweakFavorites(
  favorites: ThemeRemoteTweakFavorite[],
  enabledUrls: string[]
): ThemeRemoteTweakFavorite[] {
  const enabled = new Set(enabledUrls);
  return favorites.filter((favorite) => favorite.pinned === true || enabled.has(favorite.fullUrl));
}

export function themeUrlHostLabel(url: string, fallback = 'Third-party source'): string {
  try {
    return new URL(url).hostname;
  } catch {
    return fallback;
  }
}

export function themeSourceLabel({
  importedLocal,
  official,
  url,
}: {
  importedLocal?: boolean;
  official?: boolean;
  url?: string;
}): string {
  if (importedLocal) return 'Uploaded file';
  if (official) return 'Official catalog';
  if (url) return themeUrlHostLabel(url);
  return 'Local theme';
}
