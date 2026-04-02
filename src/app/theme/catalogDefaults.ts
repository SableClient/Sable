import { trimTrailingSlash } from '$utils/common';

export const DEFAULT_THEME_CATALOG_BASE =
  'https://raw.githubusercontent.com/SableClient/themes/main';

export function themeCatalogListingBaseUrl(configBaseTrimmed?: string | null): string {
  const base = trimTrailingSlash(
    configBaseTrimmed && configBaseTrimmed.length > 0
      ? configBaseTrimmed
      : DEFAULT_THEME_CATALOG_BASE
  );
  return `${base}/`;
}
