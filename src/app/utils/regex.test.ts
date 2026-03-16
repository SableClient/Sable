import { describe, it, expect } from 'vitest';
import { sanitizeForRegex, EMAIL_REGEX, URL_REG } from './regex';

describe('sanitizeForRegex', () => {
  it('returns normal alphanumeric strings unchanged', () => {
    expect(sanitizeForRegex('hello123')).toBe('hello123');
  });

  it.each([
    ['|', '\\|'],
    ['\\', '\\\\'],
    ['{', '\\{'],
    ['}', '\\}'],
    ['(', '\\('],
    [')', '\\)'],
    ['[', '\\['],
    [']', '\\]'],
    ['^', '\\^'],
    ['$', '\\$'],
    ['+', '\\+'],
    ['*', '\\*'],
    ['?', '\\?'],
    ['.', '\\.'],
    ['-', '\\x2d'],
  ])('escapes special char %s', (input, expected) => {
    expect(sanitizeForRegex(input)).toBe(expected);
  });

  it('escapes all special chars in a complex string', () => {
    const result = sanitizeForRegex('a.b+c?d');
    expect(result).toBe('a\\.b\\+c\\?d');
  });

  it('produces a valid regex that matches the original string literally', () => {
    const input = 'foo.bar (baz)+';
    const safePattern = sanitizeForRegex(input);
    const reg = new RegExp(safePattern);
    expect(reg.test(input)).toBe(true);
    // Without escaping, `.` would match any char — make sure it's literal
    expect(reg.test('fooXbar (baz)+')).toBe(false);
  });

  it('handles empty string', () => {
    expect(sanitizeForRegex('')).toBe('');
  });
});

describe('EMAIL_REGEX', () => {
  it.each([
    'user@example.com',
    'user.name+tag@subdomain.example.org',
    'x@y.io',
    'user123@domain.co.uk',
  ])('matches valid email: %s', (email) => {
    expect(EMAIL_REGEX.test(email)).toBe(true);
  });

  it.each(['notanemail', '@nodomain.com', 'missing-at-sign.com', 'two@@at.com'])(
    'rejects invalid email: %s',
    (email) => {
      expect(EMAIL_REGEX.test(email)).toBe(false);
    }
  );
});

describe('URL_REG', () => {
  it('matches a simple http URL', () => {
    const matches = 'visit http://example.com today'.match(URL_REG);
    expect(matches).not.toBeNull();
    expect(matches?.[0]).toBe('http://example.com');
  });

  it('matches a simple https URL', () => {
    const matches = 'go to https://example.com/path?q=1'.match(URL_REG);
    expect(matches?.[0]).toBe('https://example.com/path?q=1');
  });

  it('finds multiple URLs in a string', () => {
    const matches = 'https://one.com and https://two.org'.match(URL_REG);
    expect(matches).toHaveLength(2);
    expect(matches?.[0]).toBe('https://one.com');
    expect(matches?.[1]).toBe('https://two.org');
  });

  it('does not match plain text without a scheme', () => {
    const matches = 'just some text without a link'.match(URL_REG);
    expect(matches).toBeNull();
  });

  it('strips trailing punctuation from matched URL', () => {
    // The pattern uses a negative lookbehind to exclude trailing punctuation
    const matches = 'see https://example.com.'.match(URL_REG);
    expect(matches?.[0]).not.toMatch(/\.$/);
  });
});
