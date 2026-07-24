import { describe, expect, it } from 'vitest';

import {
  pruneThemeFavorites,
  pruneThemeTweakFavorites,
  themeSourceLabel,
  themeUrlHostLabel,
} from './themeLibrary';

describe('themeLibrary', () => {
  it('keeps pinned and active theme records', () => {
    const favorites = [
      { fullUrl: 'active', displayName: 'Active', basename: 'active', kind: 'dark' as const },
      {
        fullUrl: 'pinned',
        displayName: 'Pinned',
        basename: 'pinned',
        kind: 'light' as const,
        pinned: true,
      },
      { fullUrl: 'unused', displayName: 'Unused', basename: 'unused', kind: 'dark' as const },
    ];

    expect(pruneThemeFavorites(favorites, ['active']).map((item) => item.fullUrl)).toEqual([
      'active',
      'pinned',
    ]);
  });

  it('keeps pinned and enabled tweak records', () => {
    const favorites = [
      { fullUrl: 'enabled', displayName: 'Enabled', basename: 'enabled' },
      { fullUrl: 'pinned', displayName: 'Pinned', basename: 'pinned', pinned: true },
      { fullUrl: 'unused', displayName: 'Unused', basename: 'unused' },
    ];

    expect(pruneThemeTweakFavorites(favorites, ['enabled']).map((item) => item.fullUrl)).toEqual([
      'enabled',
      'pinned',
    ]);
  });

  it('provides consistent source labels', () => {
    expect(themeSourceLabel({ importedLocal: true })).toBe('Uploaded file');
    expect(themeSourceLabel({ official: true })).toBe('Official catalog');
    expect(themeSourceLabel({ url: 'https://themes.example/night.sable.css' })).toBe(
      'themes.example'
    );
    expect(themeUrlHostLabel('not a URL', 'Unknown')).toBe('Unknown');
  });
});
