import { describe, expect, it } from 'vitest';
import { expandBlockBoundariesAfterSingleNewlines } from './expandBlockNewlines';
import { markdownToHtml } from './markdownToHtml';

describe('expandBlockBoundariesAfterSingleNewlines', () => {
  it('does not expand between consecutive blockquote lines', () => {
    const md = '> test\n> test\n> test';
    expect(expandBlockBoundariesAfterSingleNewlines(md)).toBe(md);
  });

  it('still expands before the first blockquote line', () => {
    expect(expandBlockBoundariesAfterSingleNewlines('intro\n> quote')).toBe('intro\n\n> quote');
  });

  it('still expands when a blockquote ends', () => {
    expect(expandBlockBoundariesAfterSingleNewlines('> quote\nplain')).toBe('> quote\n\nplain');
  });

  it('does not expand between consecutive ordered list items', () => {
    expect(expandBlockBoundariesAfterSingleNewlines('1. one\n2. two')).toBe('1. one\n2. two');
  });

  it('does not expand before a 2-space nested sublist', () => {
    expect(expandBlockBoundariesAfterSingleNewlines('1. test\n  - sub')).toBe('1. test\n  - sub');
  });

  it('does not expand before a 4-space nested sublist', () => {
    expect(expandBlockBoundariesAfterSingleNewlines('1. test\n    - sub')).toBe(
      '1. test\n    - sub'
    );
  });

  it('still expands before the first top-level list item after prose', () => {
    expect(expandBlockBoundariesAfterSingleNewlines('intro\n- item')).toBe('intro\n\n- item');
  });
});

describe('consecutive blockquotes', () => {
  it('produces a single blockquote element', () => {
    const html = markdownToHtml('> test\n> test\n> test');
    expect((html.match(/<blockquote/g) ?? []).length).toBe(1);
  });
});
