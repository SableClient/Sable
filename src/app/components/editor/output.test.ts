import { describe, expect, it } from 'vitest';
import type { Room } from '$types/matrix-sdk';
import { toMatrixCustomHTML, toPlainText, trimCustomHtml } from '$components/editor/output';
import { BlockType } from '$components/editor/types';

const roomWithMember = (userId: string, rawDisplayName: string): Room =>
  ({
    getMember: (id: string) =>
      id === userId ? ({ userId: id, rawDisplayName } as never) : undefined,
  }) as unknown as Room;

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
  it('serializes @room pings as a markdown link so the label is @room, not a bare permalink', () => {
    const html = trimCustomHtml(
      toMatrixCustomHTML(
        [
          {
            type: BlockType.Paragraph,
            children: [
              {
                type: BlockType.Mention,
                id: '!room:example.org',
                name: '@room',
                children: [{ text: '' }],
              } as never,
            ],
          } as never,
        ],
        {}
      )
    );

    expect(html).toMatch(/<a\b[^>]*href="https:\/\/matrix\.to\/#\/!room:example\.org"/i);
    expect(html).toContain('@room');
  });

  it('serializes non–@room room mentions as bare matrix.to URL text', () => {
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

  it('serializes user mentions using room membership display name, not private Slate node.name', () => {
    const room = roomWithMember('@alice:example.org', 'Alice');
    const html = trimCustomHtml(
      toMatrixCustomHTML(
        [
          {
            type: BlockType.Paragraph,
            children: [
              {
                type: BlockType.Mention,
                id: '@alice:example.org',
                name: 'Secret local only nickname',
                highlight: true,
                children: [{ text: '' }],
              } as never,
            ],
          } as never,
        ],
        { room }
      )
    );

    expect(html).toMatch(/<a\b[^>]*href="https:\/\/matrix\.to\/#\/@alice:example\.org"/i);
    expect(html).toContain('Alice');
    expect(html).not.toContain('Secret local only nickname');
  });

  it('serializes user mentions without room using MXID localpart as link label', () => {
    const html = trimCustomHtml(
      toMatrixCustomHTML(
        [
          {
            type: BlockType.Paragraph,
            children: [
              {
                type: BlockType.Mention,
                id: '@alice:example.org',
                name: 'Secret local only nickname',
                highlight: true,
                children: [{ text: '' }],
              } as never,
            ],
          } as never,
        ],
        {}
      )
    );

    expect(html).toMatch(/<a\b[^>]*href="https:\/\/matrix\.to\/#\/@alice:example\.org"/i);
    expect(html).toMatch(/>alice<\/a>/i);
    expect(html).not.toContain('Secret local only nickname');
  });

  it('uses @room in plain body for room pings, not the room id', () => {
    const plain = toPlainText(
      [
        {
          type: BlockType.Paragraph,
          children: [
            {
              type: BlockType.Mention,
              id: '!room:example.org',
              name: '@room',
              highlight: true,
              children: [{ text: '' }],
            } as never,
          ],
        } as never,
      ],
      false,
      undefined
    ).trim();

    expect(plain).toBe('@room');
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

describe('toMatrixCustomHTML single-newline markdown blocks', () => {
  it('parses -# on a second Slate paragraph joined with a single newline', () => {
    const html = trimCustomHtml(
      toMatrixCustomHTML(
        [
          { type: BlockType.Paragraph, children: [{ text: 'test' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: '-# caption' }] } as never,
        ],
        {}
      )
    );
    expect(html).toContain('<sub');
    expect(html).toContain('data-md="-#"');
  });
});
