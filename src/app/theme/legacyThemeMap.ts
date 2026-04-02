/**
 * Map legacy theme ids to catalog basenames (SableClient/themes repo filenames without suffix) for migration.
 */
export const LEGACY_THEME_TO_BASENAME: Record<string, string> = {
  'silver-theme': 'silver',
  'cinny-light-theme': 'cinny-light',
  'cinny-silver-theme': 'cinny-silver',
  'dark-theme': 'dark',
  'light-theme': 'light',
  'butter-theme': 'butter',
  'rose-pine-theme': 'rose-pine',
  'cinny-dark-theme': 'cinny-dark',
  'gruvdark-theme': 'gruvdark',
  'accord-theme': 'accord',
  'black-theme': 'black',
};

export const LEGACY_THEME_IDS = Object.keys(LEGACY_THEME_TO_BASENAME);

export function isLegacyBuiltinThemeId(id: string | undefined): boolean {
  if (!id) return false;
  return id !== 'light-theme' && id !== 'dark-theme' && id in LEGACY_THEME_TO_BASENAME;
}
