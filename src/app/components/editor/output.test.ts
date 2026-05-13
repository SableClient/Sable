import { describe, expect, it } from 'vitest';
import { toMatrixCustomHTML, trimCustomHtml } from '$components/editor/output';
import { BlockType } from '$components/editor/types';

describe('toMatrixCustomHTML emoticons', () => {
  it('always serializes custom emoji images with height=32', () => {
    const html = trimCustomHtml(
      toMatrixCustomHTML(
        [
          {
            type: BlockType.Paragraph,
            children: [
              {
                type: BlockType.Emoticon,
                key: 'mxc://example.org/emote',
                shortcode: 'blobcat',
                children: [{ text: '' }],
              } as never,
            ],
          } as never,
        ],
        {}
      )
    );

    expect(html).toContain('data-mx-emoticon');
    expect(html).toContain('mxc://example.org/emote');
    expect(html).toContain('height="32"');
  });
});

describe('toMatrixCustomHTML matrix.to', () => {
  it('serializes room mentions as raw matrix.to URL text, not an anchor', () => {
    const html = trimCustomHtml(
      toMatrixCustomHTML(
        [
          {
            type: BlockType.Paragraph,
            children: [
              {
                type: BlockType.Mention,
                id: '!room:example.org',
                name: 'My room',
                children: [{ text: '' }],
              } as never,
            ],
          } as never,
        ],
        {}
      )
    );

    expect(html).toContain('https://matrix.to/#/!room:example.org');
    expect(html).not.toMatch(/<a\b[^>]*matrix\.to/i);
  });

  it('serializes matrix.to links as raw URL text, not an anchor', () => {
    const html = trimCustomHtml(
      toMatrixCustomHTML(
        [
          {
            type: BlockType.Paragraph,
            children: [
              {
                type: BlockType.Link,
                href: 'https://matrix.to/#/@alice:example.org',
                children: [{ text: 'Alice' }],
              } as never,
            ],
          } as never,
        ],
        {}
      )
    );

    expect(html).toContain('https://matrix.to/#/@alice:example.org');
    expect(html).not.toMatch(/<a\b[^>]*matrix\.to/i);
  });
});
