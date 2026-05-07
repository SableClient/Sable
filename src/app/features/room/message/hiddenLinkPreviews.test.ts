import { describe, expect, it } from 'vitest';
import { readdAngleBracketsForHiddenPreviews } from './hiddenLinkPreviews';

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
});
