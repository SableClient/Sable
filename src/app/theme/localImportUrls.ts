export const SABLE_LOCAL_THEME_PREFIX = 'sable-import://theme/';
export const SABLE_LOCAL_TWEAK_PREFIX = 'sable-import://tweak/';

export function isLocalImportThemeUrl(url: string): boolean {
  return url.startsWith(SABLE_LOCAL_THEME_PREFIX);
}

export function isLocalImportTweakUrl(url: string): boolean {
  return url.startsWith(SABLE_LOCAL_TWEAK_PREFIX);
}

export function isLocalImportBundledUrl(url: string): boolean {
  return isLocalImportThemeUrl(url) || isLocalImportTweakUrl(url);
}

export function makeLocalImportThemeId(): string {
  return crypto.randomUUID();
}

export function makeLocalImportTweakId(): string {
  return crypto.randomUUID();
}

export function localImportFullUrl(id: string): string {
  return `${SABLE_LOCAL_THEME_PREFIX}${id}/full.sable.css`;
}

export function localImportPreviewUrl(id: string): string {
  return `${SABLE_LOCAL_THEME_PREFIX}${id}/preview.sable.css`;
}

export function localImportTweakFullUrl(id: string): string {
  return `${SABLE_LOCAL_TWEAK_PREFIX}${id}/full.sable.css`;
}
