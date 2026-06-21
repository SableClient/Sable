import { describe, expect, it } from 'vitest';
import type { Room } from '$types/matrix-sdk';
import { toMatrixCustomHTML, toPlainText, trimCustomHtml } from '$components/editor/output';
import { BlockType } from '$components/editor/types';
import { htmlToMarkdown } from '$plugins/markdown';
import { plainToEditorInput } from '$components/editor/input';

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

describe('toMatrixCustomHTML angle bracket escapes', () => {
  it('renders backslash-escaped angle brackets as literal characters in formatted output', () => {
    const html = trimCustomHtml(
      toMatrixCustomHTML(
        [
          {
            type: BlockType.Paragraph,
            children: [{ text: String.raw`\<test\>` }],
          } as never,
        ],
        {}
      )
    );

    expect(html).toContain('&lt;test&gt;');
    expect(html).not.toMatch(/<test[^>]*>/);
  });

  it('does not double-encode when the editor already contains entity text', () => {
    const html = trimCustomHtml(
      toMatrixCustomHTML(
        [
          {
            type: BlockType.Paragraph,
            children: [{ text: '&lt;test&gt;' }],
          } as never,
        ],
        {}
      )
    );

    expect(html).toContain('&lt;test&gt;');
    expect(html).not.toContain('&amp;lt;');
  });

  it('keeps backslash escapes in plain body for round-trip editing', () => {
    const children = [
      {
        type: BlockType.Paragraph,
        children: [{ text: String.raw`\<test\>` }],
      } as never,
    ];
    expect(toPlainText(children).trim()).toBe(String.raw`\<test\>`);
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

describe('toMatrixCustomHTML intentional blank paragraphs', () => {
  const blankLineDoc = [
    { type: BlockType.Paragraph, children: [{ text: 'Wordle 1,828 4/6*' }] } as never,
    { type: BlockType.Paragraph, children: [{ text: '' }] } as never,
    { type: BlockType.Paragraph, children: [{ text: '⬛🟨🟩' }] } as never,
  ];

  it('serializes an empty Slate paragraph as visible blank-line breaks', () => {
    const html = toMatrixCustomHTML(blankLineDoc, {});

    expect(html).toContain('<p>Wordle 1,828 4/6*<br/><br/>⬛🟨🟩</p>');
  });

  it('round-trips visible blank lines back into an empty editor paragraph', () => {
    const html = toMatrixCustomHTML(blankLineDoc, {});
    const markdown = htmlToMarkdown(html);
    const doc = plainToEditorInput(markdown);

    expect(markdown).toBe('Wordle 1,828 4/6\\*\n\n⬛🟨🟩');
    expect(doc).toHaveLength(3);
    expect(doc[1]).toEqual({
      type: BlockType.Paragraph,
      children: [{ text: '' }],
    });
  });

  it('keeps blank paragraphs inside fenced code blocks', () => {
    const html = trimCustomHtml(
      toMatrixCustomHTML(
        [
          { type: BlockType.Paragraph, children: [{ text: '```' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: '' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: 'code' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: '```' }] } as never,
        ],
        {}
      )
    );

    expect(html).toContain('<pre');
    expect(html).toContain('<code>\ncode\n</code>');
    expect(html).not.toContain('</pre>code');
  });

  it('drops trailing empty paragraphs that the plain body trims away', () => {
    const html = trimCustomHtml(
      toMatrixCustomHTML(
        [
          { type: BlockType.Paragraph, children: [{ text: 'hello' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: '' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: '' }] } as never,
        ],
        {}
      )
    );

    expect(html).toBe('hello');
  });

  it('drops leading empty paragraphs that the plain body trims away', () => {
    const html = trimCustomHtml(
      toMatrixCustomHTML(
        [
          { type: BlockType.Paragraph, children: [{ text: '' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: '' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: 'hello' }] } as never,
        ],
        {}
      )
    );

    expect(html).toBe('hello');
  });

  it('wraps inline text before a following markdown block after a blank line', () => {
    const html = trimCustomHtml(
      toMatrixCustomHTML(
        [
          { type: BlockType.Paragraph, children: [{ text: 'hello' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: '' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: '```' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: 'code' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: '```' }] } as never,
        ],
        {}
      )
    );

    expect(html).toContain('<p>hello<br/><br/></p>');
    expect(html).toContain('<pre');
  });

  it('keeps blank lines inside indented code blocks', () => {
    const html = trimCustomHtml(
      toMatrixCustomHTML(
        [
          { type: BlockType.Paragraph, children: [{ text: '    code' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: '' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: '    more code' }] } as never,
        ],
        {}
      )
    );

    expect(html).toContain('<pre');
    expect(html).toContain('<code>code\n\nmore code\n</code>');
  });

  it('keeps longer fenced code blocks open across inner backtick lines', () => {
    const html = trimCustomHtml(
      toMatrixCustomHTML(
        [
          { type: BlockType.Paragraph, children: [{ text: '````' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: '' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: '```' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: '````' }] } as never,
        ],
        {}
      )
    );

    expect(html).toContain('<pre');
    expect(html).toContain('<code>\n```\n</code>');
  });

  it('round-trips heading blocks with one empty paragraph without adding extra blank lines', () => {
    const html = trimCustomHtml(
      toMatrixCustomHTML(
        [
          { type: BlockType.Paragraph, children: [{ text: '# Head' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: '' }] } as never,
          { type: BlockType.Paragraph, children: [{ text: 'text' }] } as never,
        ],
        {}
      )
    );
    const markdown = htmlToMarkdown(html);

    expect(markdown).toBe('# Head\n\ntext');
  });
});
