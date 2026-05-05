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
