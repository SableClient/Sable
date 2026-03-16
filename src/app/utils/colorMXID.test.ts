// Example: testing pure utility functions.
// These are the simplest tests to write — no mocking or DOM needed.
import { describe, it, expect } from 'vitest';
import colorMXID, { cssColorMXID } from './colorMXID';

describe('colorMXID', () => {
  it('returns a valid hsl() string', () => {
    expect(colorMXID('@alice:example.com')).toMatch(/^hsl\(\d+, 65%, 80%\)$/);
  });

  it('is deterministic', () => {
    expect(colorMXID('@alice:example.com')).toBe(colorMXID('@alice:example.com'));
  });

  it('produces different colors for different users', () => {
    expect(colorMXID('@alice:example.com')).not.toBe(colorMXID('@bob:example.com'));
  });

  it('handles undefined without throwing', () => {
    expect(colorMXID(undefined)).toBe('hsl(0, 65%, 80%)');
  });
});

describe('cssColorMXID', () => {
  it('returns a CSS variable in the --mx-uc-1 to --mx-uc-8 range', () => {
    // Run many users through it so we cover the full 0-7 modulo range
    const results = ['@a', '@b', '@c', '@d', '@e', '@f', '@g', '@h'].map(cssColorMXID);
    results.forEach((v) => {
      expect(v).toMatch(/^--mx-uc-[1-8]$/);
    });
  });

  it('handles undefined without throwing', () => {
    expect(cssColorMXID(undefined)).toBe('--mx-uc-1');
  });
});
