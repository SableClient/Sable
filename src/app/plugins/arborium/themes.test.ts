import { describe, expect, it } from 'vitest';
import { readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import { pluginVersion } from '@arborium/arborium';

import {
  DEFAULT_ARBORIUM_DARK_THEME,
  DEFAULT_ARBORIUM_LIGHT_THEME,
  getArboriumThemeHref,
  getArboriumThemeLabel,
  getArboriumThemeOptions,
} from './themes';

const arboriumThemesDir = dirname(
  createRequire(import.meta.url).resolve('@arborium/arborium/themes/base.css')
);

describe('Arborium theme registry', () => {
  it('exposes the default light and dark themes', () => {
    expect(DEFAULT_ARBORIUM_LIGHT_THEME).toBe('github-light');
    expect(DEFAULT_ARBORIUM_DARK_THEME).toBe('dracula');
  });

  it('groups themes by kind and keeps the defaults available', () => {
    const lightThemes = getArboriumThemeOptions('light');
    const darkThemes = getArboriumThemeOptions('dark');

    expect(lightThemes.map((theme) => theme.id)).toContain(DEFAULT_ARBORIUM_LIGHT_THEME);
    expect(darkThemes.map((theme) => theme.id)).toContain(DEFAULT_ARBORIUM_DARK_THEME);
  });

  it('builds the CDN href for a theme id', () => {
    expect(getArboriumThemeHref('github-light')).toBe(
      `https://cdn.jsdelivr.net/npm/@arborium/arborium@${pluginVersion}/dist/themes/github-light.css`
    );
  });

  it('returns a readable label for a supported theme', () => {
    expect(getArboriumThemeLabel('github-light')).toBe('GitHub Light');
  });

  it('matches the installed Arborium theme css files', async () => {
    const installedThemes = (await readdir(arboriumThemesDir))
      .filter((fileName) => fileName.endsWith('.css'))
      .map((fileName) => fileName.replace(/\.css$/, ''))
      .filter((themeId) => themeId !== 'base' && themeId !== 'base-rustdoc')
      .toSorted();

    const exportedThemeIds = [
      ...getArboriumThemeOptions('light').map((theme) => theme.id),
      ...getArboriumThemeOptions('dark').map((theme) => theme.id),
    ].toSorted();

    expect(exportedThemeIds).toEqual(installedThemes);
  });
});
