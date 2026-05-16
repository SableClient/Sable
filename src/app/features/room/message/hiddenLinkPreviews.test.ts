import { describe, expect, it } from 'vitest';
import {
  readdAngleBracketsForHiddenPreviews,
  stripMarkdownEscapesForHiddenPreviews,
} from './hiddenLinkPreviews';

describe('stripMarkdownEscapesForHiddenPreviews', () => {
  it('removes backslashes around <url> suppressor wrappers', () => {
    expect(
      stripMarkdownEscapesForHiddenPreviews(String.raw`hello \<https://example.com\> world`)
    ).toBe('hello <https://example.com> world');
  });

  it('handles paren-adjacent variants produced by link matching', () => {
    expect(stripMarkdownEscapesForHiddenPreviews(String.raw`(\<https://a.b\>)`)).toBe(
      '(<https://a.b>)'
    );
    expect(stripMarkdownEscapesForHiddenPreviews(String.raw`(\<https://a.b\>) and more`)).toBe(
      '(<https://a.b>) and more'
    );
  });

  it('does not touch unrelated markdown escapes', () => {
    expect(stripMarkdownEscapesForHiddenPreviews(String.raw`keep \*this\* and \<not-a-url\>`)).toBe(
      String.raw`keep \*this\* and \<not-a-url\>`
    );
  });

  it('unwraps outer \\< \\> around a preview-suppressed markdown link from htmlToMarkdown', () => {
    expect(
      stripMarkdownEscapesForHiddenPreviews(
        String.raw`\<[https://example.org/](<https://example.org/>)\>`
      )
    ).toBe('[https://example.org/](<https://example.org/>)');
  });

  it('fixes escaped outer brackets when destination lost angle brackets (bad HTML wrap)', () => {
    expect(
      stripMarkdownEscapesForHiddenPreviews(
        String.raw`\<[https://example.com/](https://example.com/)>`
      )
    ).toBe('[https://example.com/](<https://example.com/>)');
  });
});

describe('readdAngleBracketsForHiddenPreviews', () => {
  it('wraps URLs in angle brackets when they are not previewed', () => {
    expect(readdAngleBracketsForHiddenPreviews('see https://example.org/ thanks', [])).toBe(
      'see <https://example.org/> thanks'
    );
  });

  it('does not wrap URLs that are present in link previews', () => {
    expect(
      readdAngleBracketsForHiddenPreviews('see https://example.org/ thanks', [
        { matched_url: 'https://example.org/' } as never,
      ])
    ).toBe('see https://example.org/ thanks');
  });

  it('does not double-wrap already bracketed URLs', () => {
    expect(readdAngleBracketsForHiddenPreviews('see <https://example.org/>', [])).toBe(
      'see <https://example.org/>'
    );
  });

  it('does not corrupt markdown suppressed links [url](<url>)', () => {
    expect(
      readdAngleBracketsForHiddenPreviews(
        'see [https://example.org/](<https://example.org/>) thanks',
        []
      )
    ).toBe('see [https://example.org/](<https://example.org/>) thanks');
  });
});
