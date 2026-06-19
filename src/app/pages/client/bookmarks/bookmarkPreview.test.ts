import { describe, expect, it } from 'vitest';
import { getStoredBookmarkFallbackText } from './bookmarkPreview';

describe('getStoredBookmarkFallbackText', () => {
  it('preserves stored filenames alongside unresolved media placeholders', () => {
    expect(
      getStoredBookmarkFallbackText({
        body_preview: 'receipt.pdf',
        msgtype: 'm.file',
      })
    ).toBe('📎 File receipt.pdf');
  });

  it('keeps raw link previews as their stored url', () => {
    expect(
      getStoredBookmarkFallbackText({
        body_preview: 'https://example.com',
        msgtype: 'm.text',
      })
    ).toBe('https://example.com');
  });
});
