import { describe, expect, it } from 'vitest';

import { parsePerMessageProfileProxyAssociation } from './usePerMessageProfile';

describe('parsePerMessageProfileProxyAssociation', () => {
  it('parses a regex string with flags (RegExp#toString form)', () => {
    const assoc = {
      profileId: 'p1',
      regexString: '/^\\[text\\] (.+)$/i',
      setAt: 123,
    };

    const parsed = parsePerMessageProfileProxyAssociation(assoc);
    expect(parsed.profileId).toBe('p1');
    expect(parsed.setAt).toBe(123);
    expect(parsed.regex.test('[text] Hello')).toBe(true);
    expect(parsed.regex.test('[TEXT] hello')).toBe(true); // i flag
  });

  it('parses a regex string without flags', () => {
    const assoc = {
      profileId: 'p1',
      regexString: '/^\\[(.+)\\]$/',
    };

    const parsed = parsePerMessageProfileProxyAssociation(assoc);
    expect(parsed.regex.test('[ok]')).toBe(true);
    expect(parsed.regex.test('[no] trailing')).toBe(false);
  });
});
