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
});

describe('consecutive blockquotes', () => {
  it('produces a single blockquote element', () => {
    const html = markdownToHtml('> test\n> test\n> test');
    expect((html.match(/<blockquote/g) ?? []).length).toBe(1);
  });
});
