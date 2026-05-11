import { describe, it, expect } from 'vitest';
import { parsePronounsInput, filterPronounsByLanguage } from './pronouns';

describe('parsePronounsInput', () => {
  it('parses a single pronoun without a language prefix', () => {
    expect(parsePronounsInput('he/him')).toEqual([{ summary: 'he/him', language: 'en' }]);
  });

  it('parses multiple comma-separated pronouns', () => {
    expect(parsePronounsInput('he/him,she/her')).toEqual([
      { summary: 'he/him', language: 'en' },
      { summary: 'she/her', language: 'en' },
    ]);
  });

  it('parses a pronoun with a language prefix', () => {
    expect(parsePronounsInput('de:er/ihm')).toEqual([{ language: 'de', summary: 'er/ihm' }]);
  });

  it('trims whitespace around entries', () => {
    expect(parsePronounsInput(' he/him , she/her ')).toEqual([
      { summary: 'he/him', language: 'en' },
      { summary: 'she/her', language: 'en' },
    ]);
  });

  it('truncates summary to 16 characters', () => {
    const longSummary = 'this/is/way/too/long';
    const result = parsePronounsInput(longSummary);
    expect(result[0]?.summary).toHaveLength(16);
    expect(result[0]?.summary).toBe('this/is/way/too/');
  });

  it('falls back to "en" when language prefix is empty', () => {
    expect(parsePronounsInput(':he/him')).toEqual([{ language: 'en', summary: 'he/him' }]);
  });

  it('returns empty array for empty string', () => {
    expect(parsePronounsInput('')).toEqual([]);
  });

  it.each([null, undefined, 42 as unknown as string])(
    'returns empty array for non-string input: %s',
    (input) => {
      expect(parsePronounsInput(input as string)).toEqual([]);
    }
  );
});

describe('filterPronounsByLanguage', () => {
  const pronouns = [
    { summary: 'he/him', language: 'en' },
    { summary: 'er/ihm', language: 'de' },
    { summary: 'il/lui', language: 'fr' },
  ];

  it('returns all pronouns when filtering is disabled', () => {
    const result = filterPronounsByLanguage(pronouns, false, ['en']);
    expect(result).toHaveLength(3);
  });

  it('filters to matching language when enabled', () => {
    const result = filterPronounsByLanguage(pronouns, true, ['de']);
    expect(result).toHaveLength(1);
    expect(result[0]?.language).toBe('de');
  });

  it('returns all pronouns when no entries match (fallthrough)', () => {
    const result = filterPronounsByLanguage(pronouns, true, ['ja']);
    expect(result).toHaveLength(3);
  });

  it('matches multiple languages', () => {
    const result = filterPronounsByLanguage(pronouns, true, ['en', 'fr']);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.language)).toEqual(['en', 'fr']);
  });

  it('is case-insensitive for language matching', () => {
    const result = filterPronounsByLanguage(pronouns, true, ['EN']);
    expect(result).toHaveLength(1);
    expect(result[0]?.language).toBe('en');
  });

  it('returns empty array for non-array input', () => {
    expect(filterPronounsByLanguage(null, true, ['en'])).toEqual([]);
  });
});
