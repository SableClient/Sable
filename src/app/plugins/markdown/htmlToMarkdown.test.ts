import { describe, expect, it } from 'vitest';
import {
  MX_EMOTICON_MD_END,
  MX_EMOTICON_MD_SEP,
  MX_EMOTICON_MD_START,
} from './extensions/matrix-emoticon';
import { plainToEditorInput } from '$components/editor/input';
import { BlockType } from '$components/editor/types';
import { htmlToMarkdown } from './htmlToMarkdown';

describe('htmlToMarkdown', () => {
  it('converts headings', () => {
    expect(htmlToMarkdown('<h1>Hello</h1>')).toContain('# Hello');
    expect(htmlToMarkdown('<h2>World</h2>')).toContain('## World');
  });

  it('converts bold text', () => {
    expect(htmlToMarkdown('<strong>bold</strong>')).toContain('**bold**');
    expect(htmlToMarkdown('<b>bold</b>')).toContain('**bold**');
  });

  it('converts italic text', () => {
    expect(htmlToMarkdown('<em>italic</em>')).toContain('*italic*');
    expect(htmlToMarkdown('<i>italic</i>')).toContain('*italic*');
  });

  it('converts strikethrough', () => {
    expect(htmlToMarkdown('<s>deleted</s>')).toContain('~~deleted~~');
    expect(htmlToMarkdown('<del>deleted</del>')).toContain('~~deleted~~');
  });

  it('converts inline code', () => {
    expect(htmlToMarkdown('<code>code</code>')).toContain('`code`');
  });

  it('converts code blocks', () => {
    expect(htmlToMarkdown('<pre><code class="language-rust">fn main() {}</code></pre>')).toContain(
      '```rust'
    );
  });

  it('does not escape markdown markers inside fenced code blocks', () => {
    const result = htmlToMarkdown('<pre><code>*literal*</code></pre>');
    expect(result).toContain('*literal*');
    expect(result).not.toMatch(/\\\*literal\\\*/);
  });

  it('does not escape markdown markers inside inline code', () => {
    const result = htmlToMarkdown('<p>before<code>*x*</code>after</p>');
    expect(result).toContain('`*x*`');
    expect(result).not.toContain('\\*x\\*');
  });

  it('preserves backslash-asterisk literals inside code blocks', () => {
    const result = htmlToMarkdown('<pre><code>\\*typed\\*</code></pre>');
    expect(result).toContain('\\*typed\\*');
  });

  it('converts links', () => {
    expect(htmlToMarkdown('<a href="https://example.com">link</a>')).toContain(
      '[link](https://example.com)'
    );
  });

  it('converts hidden-preview wrapped links to markdown with <href>', () => {
    const html = '<p>&lt;<a href="https://example.org/">https://example.org/</a>&gt;</p>';
    expect(htmlToMarkdown(html)).toBe('[https://example.org/](<https://example.org/>)');
  });

  it('converts hidden-preview wrapped links when angle brackets are decimal entities', () => {
    const html = '<p>&#60;<a href="https://example.org/">https://example.org/</a>&#62;</p>';
    expect(htmlToMarkdown(html)).toBe('[https://example.org/](<https://example.org/>)');
  });

  it('converts spoiler spans', () => {
    expect(htmlToMarkdown('<span data-mx-spoiler>hidden</span>')).toContain('||hidden||');
  });

  it('converts inline math spans', () => {
    expect(htmlToMarkdown('<span data-mx-maths="E = mc^2">E = mc^2</span>')).toContain(
      '$E = mc^2$'
    );
  });

  it('converts block math divs', () => {
    expect(htmlToMarkdown('<div data-mx-maths="\\frac{a}{b}">frac</div>')).toContain(
      '$$\\frac{a}{b}$$'
    );
  });

  it('converts blockquotes', () => {
    const result = htmlToMarkdown('<blockquote>Quote text</blockquote>');
    expect(result).toContain('>');
    expect(result).toContain('Quote text');
  });

  it('converts unordered lists', () => {
    const result = htmlToMarkdown('<ul><li>Item 1</li><li>Item 2</li></ul>');
    expect(result).toContain('-');
    expect(result).toContain('Item 1');
  });

  it('converts ordered lists', () => {
    const result = htmlToMarkdown('<ol><li>Item 1</li><li>Item 2</li></ol>');
    expect(result).toContain('1.');
    expect(result).toContain('Item 1');
  });

  it('preserves data-md attributes for round-trip', () => {
    const result = htmlToMarkdown('<strong data-md="**">bold</strong>');
    expect(result).toContain('**bold**');
  });

  it('escapes markdown special characters in text', () => {
    const result = htmlToMarkdown('<p>Hello *world*</p>');
    expect(result).toContain('\\*');
  });

  it('inserts a blank line between adjacent paragraphs for editor round-trip', () => {
    expect(htmlToMarkdown('<p>First</p><p>Second</p>')).toBe('First\n\nSecond');
  });

  it('encodes mx emoticons as private-use placeholders instead of literal img snippets', () => {
    const src = 'mxc://matrix.org/emote';
    const html = `<p>hi<img data-mx-emoticon src="${src}" alt="blobcat" title="blobcat" height="32" />bye</p>`;
    const md = htmlToMarkdown(html);
    expect(md).not.toContain('<img');
    expect(md).toContain(
      `${MX_EMOTICON_MD_START}${src}${MX_EMOTICON_MD_SEP}blobcat${MX_EMOTICON_MD_END}`
    );
  });

  it('plainToEditorInput expands emoticon placeholders into Slate emoticon elements', () => {
    const src = 'mxc://matrix.org/emote';
    const md = `before${MX_EMOTICON_MD_START}${src}${MX_EMOTICON_MD_SEP}blobcat${MX_EMOTICON_MD_END}after`;
    const doc = plainToEditorInput(md);
    expect(doc).toHaveLength(1);
    const p = doc[0] as { type: BlockType; children: unknown[] };
    expect(p.type).toBe(BlockType.Paragraph);
    expect(p.children).toEqual([
      { text: 'before' },
      expect.objectContaining({
        type: BlockType.Emoticon,
        key: src,
        shortcode: 'blobcat',
      }),
      { text: 'after' },
    ]);
  });
});
