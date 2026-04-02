export const SABLE_LOCAL_THEME_PREFIX = 'sable-import://theme/';

export function isLocalImportThemeUrl(url: string): boolean {
  return url.startsWith(SABLE_LOCAL_THEME_PREFIX);
}

export function makeLocalImportThemeId(): string {
  return crypto.randomUUID();
}

export function localImportFullUrl(id: string): string {
  return `${SABLE_LOCAL_THEME_PREFIX}${id}/full.sable.css`;
}

export function localImportPreviewUrl(id: string): string {
  return `${SABLE_LOCAL_THEME_PREFIX}${id}/preview.sable.css`;
}
