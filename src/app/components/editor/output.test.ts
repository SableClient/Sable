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
