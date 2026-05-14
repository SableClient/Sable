import { REMOTE_THEME_ID } from '$hooks/useTheme';
import type { Settings } from '$state/settings';
import { trimTrailingSlash } from '$utils/common';

export const BUILTIN_THEME_IDS = new Set(['light-theme', 'dark-theme']);

export function isLegacyThemeId(themeId: string | undefined): boolean {
  if (!themeId || themeId.trim() === '') return false;
  if (BUILTIN_THEME_IDS.has(themeId)) return false;
  if (themeId === REMOTE_THEME_ID) return false;
  return true;
}

export function legacyThemeIdToBasename(legacyId: string): string {
  return legacyId.endsWith('-theme') ? legacyId.slice(0, -'-theme'.length) : legacyId;
}

const DARK_BASENAMES = new Set([
  'dark',
  'black',
  'cinny-dark',
  'gruvdark',
  'accord',
  'butter',
  'rose-pine',
]);

export function inferLegacyKindFromBasename(basename: string): 'light' | 'dark' {
  return DARK_BASENAMES.has(basename) ? 'dark' : 'light';
}

export function catalogFullUrlForBasename(basename: string, catalogBase: string): string {
  const base = trimTrailingSlash(catalogBase);
  return `${base}/themes/${basename}.sable.css`;
}

export function needsLegacyThemeMigration(settings: Settings): boolean {
  if (settings.themeMigrationDismissed) return false;
  return (
    isLegacyThemeId(settings.themeId) ||
    isLegacyThemeId(settings.lightThemeId) ||
    isLegacyThemeId(settings.darkThemeId)
  );
}
