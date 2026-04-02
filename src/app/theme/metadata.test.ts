import { describe, expect, it } from 'vitest';
import { ThemeKind } from '$hooks/useTheme';

import { parseSableThemeMetadata } from './metadata';

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
