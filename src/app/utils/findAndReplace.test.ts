// Example: testing an algorithmic utility with multiple interaction scenarios.
// Shows how to test functions that return arrays, and how to test edge cases
// like empty input, no matches, and back-to-back matches.
import { describe, it, expect } from 'vitest';
import { findAndReplace } from './findAndReplace';

// Helpers that mirror what a real caller would pass
const asText = (text: string) => ({ type: 'text', text }) as const;
const asMatch = (match: string) => ({ type: 'match', match }) as const;

describe('findAndReplace', () => {
  it('returns the original text when there are no matches', () => {
    const result = findAndReplace('hello world', /xyz/g, (m) => asMatch(m[0]), asText);
    expect(result).toEqual([asText('hello world')]);
  });

  it('splits text around a single match', () => {
    const result = findAndReplace('say hello there', /hello/g, (m) => asMatch(m[0]), asText);
    expect(result).toEqual([asText('say '), asMatch('hello'), asText(' there')]);
  });

  it('handles multiple matches in sequence', () => {
    const result = findAndReplace('a b a', /a/g, (m) => asMatch(m[0]), asText);
    expect(result).toEqual([asText(''), asMatch('a'), asText(' b '), asMatch('a'), asText('')]);
  });

  it('handles a match at the very start', () => {
    const result = findAndReplace('helloworld', /hello/g, (m) => asMatch(m[0]), asText);
    expect(result).toEqual([asText(''), asMatch('hello'), asText('world')]);
  });

  it('handles a match at the very end', () => {
    const result = findAndReplace('worldhello', /hello/g, (m) => asMatch(m[0]), asText);
    expect(result).toEqual([asText('world'), asMatch('hello'), asText('')]);
  });

  it('handles an empty input string', () => {
    const result = findAndReplace('', /hello/g, (m) => asMatch(m[0]), asText);
    expect(result).toEqual([asText('')]);
  });

  it('passes the correct pushIndex to callbacks', () => {
    const indices: number[] = [];
    findAndReplace(
      'a b',
      /[ab]/g,
      (m, i) => {
        indices.push(i);
        return asMatch(m[0]);
      },
      (t, i) => {
        indices.push(i);
        return asText(t);
      }
    );
    // indices are assigned in push order: text(''), match('a'), text(' '), match('b'), text('')
    expect(indices).toEqual([0, 1, 2, 3, 4]);
  });
});
