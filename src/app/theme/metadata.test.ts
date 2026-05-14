import { describe, expect, it } from 'vitest';
import { ThemeKind } from '$hooks/useTheme';

import {
  getSableCssPackageKind,
  parseSableThemeMetadata,
  parseSableTweakMetadata,
} from './metadata';

describe('parseSableThemeMetadata', () => {
  it('reads @sable-theme from a block after an earlier license comment', () => {
    const css = `/* MIT license
 * blah
 */
/*
@sable-theme
---
id: foo
name: Bar Theme
kind: light
*/
:root {}
`;
    const meta = parseSableThemeMetadata(css);
    expect(meta.id).toBe('foo');
    expect(meta.name).toBe('Bar Theme');
    expect(meta.kind).toBe(ThemeKind.Light);
  });

  it('reads neon glass defaults with ng_ prefix', () => {
    const css = `/*
@sable-theme
id: neon
ng_color: #ff00ff
ng_blur: 20
ng_opacity: 0.5
ng_chat_opacity: 0.2
ng_glow: 15
*/
`;
    const meta = parseSableThemeMetadata(css);
    expect(meta.defaults?.neonGlass?.primaryColor).toBe('#ff00ff');
    expect(meta.defaults?.neonGlass?.blurRadius).toBe(20);
    expect(meta.defaults?.neonGlass?.bgOpacity).toBe(0.5);
    expect(meta.defaults?.neonGlass?.chatOpacity).toBe(0.2);
    expect(meta.defaults?.neonGlass?.glowRadius).toBe(15);
  });

  it('reads neon glass boolean defaults', () => {
    const css = `/*
@sable-theme
id: neon-flags
ng_sidebar: true
ng_chat: false
ng_modals: true
ng_chat_opacity: 0.2
*/
`;
    const meta = parseSableThemeMetadata(css);
    expect(meta.defaults?.neonGlass?.applySidebar).toBe(true);
    expect(meta.defaults?.neonGlass?.applyChat).toBe(false);
    expect(meta.defaults?.neonGlass?.applyModals).toBe(true);
    expect(meta.defaults?.neonGlass?.chatOpacity).toBe(0.2);
  });

  it('returns empty when only a non-metadata comment exists', () => {
    const css = `/* just a license */`;
    expect(parseSableThemeMetadata(css)).toEqual({});
  });
});

describe('getSableCssPackageKind', () => {
  it('detects tweak before theme when tweak block appears first', () => {
    expect(
      getSableCssPackageKind(`/*
@sable-tweak
id: x
*/
`)
    ).toBe('tweak');
  });

  it('detects theme when only @sable-theme is present', () => {
    expect(
      getSableCssPackageKind(`/*
@sable-theme
id: dark
*/
`)
    ).toBe('theme');
  });

  it('returns unknown when no markers', () => {
    expect(getSableCssPackageKind('/* license only */')).toBe('unknown');
  });
});

describe('parseSableTweakMetadata', () => {
  it('reads description from @sable-tweak block', () => {
    const css = `/*
@sable-tweak
id: rounded
name: Softer corners
description: Adjusts shadow depth.
author: Sable
tags: demo, layout
*/
body.sable-remote-theme {}
`;
    const meta = parseSableTweakMetadata(css);
    expect(meta.id).toBe('rounded');
    expect(meta.name).toBe('Softer corners');
    expect(meta.description).toBe('Adjusts shadow depth.');
    expect(meta.tags).toEqual(['demo', 'layout']);
  });
});
