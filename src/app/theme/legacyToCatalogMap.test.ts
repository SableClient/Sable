import { describe, expect, it } from 'vitest';

import { defaultSettings } from '$state/settings';

import {
  catalogFullUrlForBasename,
  inferLegacyKindFromBasename,
  isLegacyThemeId,
  legacyThemeIdToBasename,
  needsLegacyThemeMigration,
} from './legacyToCatalogMap';

describe('legacyToCatalogMap', () => {
  it('treats only light-theme and dark-theme as non-legacy', () => {
    expect(isLegacyThemeId(undefined)).toBe(false);
    expect(isLegacyThemeId('light-theme')).toBe(false);
    expect(isLegacyThemeId('dark-theme')).toBe(false);
    expect(isLegacyThemeId('silver-theme')).toBe(true);
  });

  it('maps legacy id to basename', () => {
    expect(legacyThemeIdToBasename('silver-theme')).toBe('silver');
    expect(legacyThemeIdToBasename('cinny-light-theme')).toBe('cinny-light');
  });

  it('builds catalog full URL under themes/', () => {
    expect(catalogFullUrlForBasename('silver', 'https://example.com/catalog-root')).toBe(
      'https://example.com/catalog-root/themes/silver.sable.css'
    );
  });

  it('infers kind from basename when metadata missing', () => {
    expect(inferLegacyKindFromBasename('silver')).toBe('light');
    expect(inferLegacyKindFromBasename('black')).toBe('dark');
  });

  it('needs migration when dismissed is false and a slot is legacy', () => {
    expect(
      needsLegacyThemeMigration({
        ...defaultSettings,
        themeMigrationDismissed: false,
        themeId: 'silver-theme',
      })
    ).toBe(true);
    expect(
      needsLegacyThemeMigration({
        ...defaultSettings,
        themeMigrationDismissed: true,
        themeId: 'silver-theme',
      })
    ).toBe(false);
  });
});
