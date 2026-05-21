import { describe, expect, it } from 'vitest';
import { decodeSpaceIdOrAlias } from './useSelectedSpace';

describe('decodeSpaceIdOrAlias', () => {
  it('returns undefined for empty input', () => {
    expect(decodeSpaceIdOrAlias(undefined)).toBeUndefined();
  });

  it('decodes encoded values', () => {
    expect(decodeSpaceIdOrAlias('%21space%3Aexample.org')).toBe('!space:example.org');
  });

  it('returns stable cached value for repeated input', () => {
    const encoded = '%23space%3Aexample.org';
    const first = decodeSpaceIdOrAlias(encoded);
    const second = decodeSpaceIdOrAlias(encoded);

    expect(first).toBe('#space:example.org');
    expect(second).toBe(first);
  });
});
