import { describe, expect, it } from 'vitest';

import { DEFAULT_THEME_CATALOG_BASE, themeCatalogListingBaseUrl } from './catalogDefaults';

describe('catalogDefaults', () => {
  it('themeCatalogListingBaseUrl uses default without trailing slash in constant', () => {
    expect(DEFAULT_THEME_CATALOG_BASE.endsWith('/')).toBe(false);
    expect(themeCatalogListingBaseUrl()).toBe(`${DEFAULT_THEME_CATALOG_BASE}/`);
  });

  it('themeCatalogListingBaseUrl normalizes configured base', () => {
    expect(themeCatalogListingBaseUrl('https://example.com/themes')).toBe(
      'https://example.com/themes/'
    );
    expect(themeCatalogListingBaseUrl('https://example.com/themes/')).toBe(
      'https://example.com/themes/'
    );
  });
});
