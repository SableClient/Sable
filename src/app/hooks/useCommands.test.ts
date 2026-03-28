// Regression tests for rainbowify — verifies that HTML input is sanitized
// before being assigned to innerHTML (XSS prevention) and that the output
// wraps non-whitespace characters in colored spans.
import { describe, it, expect } from 'vitest';
import { rainbowify } from './useCommands';

describe('rainbowify – output structure', () => {
  it('wraps each character in a span with data-mx-color', () => {
    const result = rainbowify('<b>Hi</b>');
    expect(result).toMatch(/data-mx-color="#[0-9a-f]{6}"/i);
  });

  it('produces a span per non-whitespace character', () => {
    const result = rainbowify('AB');
    const matches = result.match(/<span data-mx-color="#[0-9a-f]{6}">[^<]+<\/span>/gi);
    // At least 2 colored spans for the 2 characters
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('returns an empty string for empty input', () => {
    expect(rainbowify('')).toBe('');
  });

  it('does not color whitespace-only input', () => {
    // Whitespace text nodes are skipped; no span wrappers produced
    const result = rainbowify('   ');
    expect(result).not.toContain('data-mx-color');
  });
});

describe('rainbowify – XSS sanitization', () => {
  it('strips <script> tags before DOM processing', () => {
    const result = rainbowify('<script>alert("xss")</script>Hello');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
    // "Hello" characters should still be colorized
    expect(result).toContain('data-mx-color');
  });

  it('strips event handler attributes before DOM processing', () => {
    const result = rainbowify('<b onclick="evil()">text</b>');
    expect(result).not.toContain('onclick');
    // Characters from the original text must still be colorized
    expect(result).toContain('data-mx-color');
  });

  it('strips javascript: href before DOM processing', () => {
    const result = rainbowify('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toMatch(/javascript:/);
  });
});
