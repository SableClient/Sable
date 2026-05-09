import { describe, expect, it } from 'vitest';
import { encodeMxEmoticonForMarkdownPlaceholder } from './extensions/matrix-emoticon';
import { markdownToHtml } from './markdownToHtml';
import { htmlToMarkdown } from './htmlToMarkdown';
import { injectDataMd } from './injectDataMd';

describe('bidirectional round-trip', () => {
  it('round-trips headings', () => {
    const markdown = '## Hello World';
    const html = markdownToHtml(markdown);
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    expect(result).toContain('## Hello World');
  });

  it('round-trips bold text', () => {
    const markdown = '**bold text**';
    const html = markdownToHtml(markdown);
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    expect(result).toContain('**bold text**');
  });

  it('round-trips italic text', () => {
    const markdown = '*italic text*';
    const html = markdownToHtml(markdown);
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    expect(result).toContain('*italic text*');
  });

  it('round-trips underline', () => {
    const markdown = '__underlined__';
    const html = markdownToHtml(markdown);
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    expect(result).toContain('__underlined__');
  });

  it('round-trips inline code', () => {
    const markdown = '`inline code`';
    const html = markdownToHtml(markdown);
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    expect(result).toContain('`inline code`');
  });

  it('round-trips code blocks', () => {
    const markdown = '```rust\nfn main() {}\n```';
    const html = markdownToHtml(markdown);
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    expect(result).toContain('```rust');
    expect(result).toContain('fn main()');
  });

  it('round-trips markdown-like characters inside code blocks without spurious escapes', () => {
    const markdown = '```\n*literal* \\*typed\\*\n```';
    const html = markdownToHtml(markdown);
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    expect(result).toContain('*literal*');
    expect(result).toContain('\\*typed\\*');
    expect(result).not.toContain('\\*literal\\*');
  });

  it('round-trips inline code containing asterisks', () => {
    const markdown = 'Text `*x*` more';
    const html = markdownToHtml(markdown);
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    expect(result).toContain('`*x*`');
  });

  it('round-trips blockquotes', () => {
    const markdown = '> Quote text';
    const html = markdownToHtml(markdown);
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    expect(result).toContain('> Quote text');
  });

  it('round-trips unordered lists', () => {
    const markdown = '- Item 1\n- Item 2';
    const html = markdownToHtml(markdown);
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    expect(result).toContain('- Item 1');
    expect(result).toContain('- Item 2');
  });

  it('round-trips ordered lists', () => {
    const markdown = '1. First\n2. Second';
    const html = markdownToHtml(markdown);
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    // Note: marked normalizes ordered lists to start at 1, but we increment for output
    expect(result).toContain('1. First');
    expect(result).toContain('2. Second');
  });

  it('round-trips spoiler syntax', () => {
    const markdown = '||hidden message||';
    const html = markdownToHtml(markdown);
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    expect(result).toContain('||hidden message||');
  });

  it('round-trips literal line-start -# (escaped) in a paragraph', () => {
    const markdown = '\\-# not small text';
    const html = markdownToHtml(markdown);
    expect(html).not.toContain('<sub');
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    expect(result).toContain('\\-#');
    expect(result).toContain('not small text');
  });

  it('round-trips inline math', () => {
    const markdown = '$E = mc^2$';
    const html = markdownToHtml(markdown);
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    expect(result).toContain('$E = mc^2$');
  });

  it('round-trips block math', () => {
    const markdown = '$$x + y$$';
    const html = markdownToHtml(markdown);
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    expect(result).toContain('$$x + y$$');
  });

  it('does NOT parse k. as a list', () => {
    const markdown = 'k.Hello world';
    const html = markdownToHtml(markdown);
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    // Should NOT contain any list markers
    expect(result).not.toContain('<li>');
    expect(result).not.toContain('<ol>');
    expect(result).not.toContain('<ul>');
    expect(result).toContain('k.');
  });

  it('preserves mx emoticons as editor placeholders (mxc URI + shortcode)', () => {
    const html = '<img data-mx-emoticon src="mxc://example.org/emote" alt=":blobcat:" />';
    const injected = injectDataMd(html);
    const result = htmlToMarkdown(injected);
    expect(result).not.toContain('<img');
    expect(result).toContain(
      encodeMxEmoticonForMarkdownPlaceholder('mxc://example.org/emote', 'blobcat')
    );
    expect(result).toContain('mxc://example.org/emote');
  });
});
