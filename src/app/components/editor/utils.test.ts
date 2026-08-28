import { describe, expect, it } from 'vitest';
import { getMarkdownCodeSpanRanges, isInsideMarkdownCodeSpan } from './utils';

describe('Markdown code ranges', () => {
  it('finds matching backtick runs', () => {
    const ranges = getMarkdownCodeSpanRanges('before `code` after');
    expect(ranges).toEqual([[7, 13]]);
    expect(isInsideMarkdownCodeSpan(8, 12, ranges)).toBe(true);
  });
});
