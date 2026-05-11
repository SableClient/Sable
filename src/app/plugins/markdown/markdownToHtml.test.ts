import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from './htmlToMarkdown';
import { markdownToHtml } from './markdownToHtml';

describe('markdownToHtml', () => {
  it('converts headings', () => {
    const result = markdownToHtml('# Hello World');
    expect(result).toContain('<h1');
    expect(result).toContain('Hello World');
  });

  it('converts bold text', () => {
    const result = markdownToHtml('**bold**');
    expect(result).toContain('<strong>bold</strong>');
  });

  it('converts __ to underline, not bold', () => {
    const result = markdownToHtml('__underlined__');
    expect(result).toContain('<u');
    expect(result).toContain('data-md="__"');
    expect(result).toContain('>underlined<');
    expect(result).not.toContain('<strong>underlined</strong>');
  });

  it('converts italic text', () => {
    const result = markdownToHtml('*italic*');
    expect(result).toContain('<em>italic</em>');
  });

  it('converts inline code', () => {
    const result = markdownToHtml('`code`');
    expect(result).toContain('<code>code</code>');
  });

  it('converts links', () => {
    const result = markdownToHtml('[link](https://example.com)');
    expect(result).toContain('<a href="https://example.com"');
  });

  it('converts spoiler syntax', () => {
    const result = markdownToHtml('||spoiler||');
    expect(result).toContain('data-mx-spoiler');
    expect(result).toContain('spoiler');
  });

  it('converts inline math syntax', () => {
    const result = markdownToHtml('$E = mc^2$');
    expect(result).toContain('data-mx-maths');
    expect(result).toContain('E = mc^2');
  });

  it('does not mangle messages with dollar amounts', () => {
    const result = markdownToHtml(
      'I just bought something for $10 on sale, it was originally $20!'
    );
    expect(result).not.toContain('data-mx-maths');
    expect(result).toContain('$10');
    expect(result).toContain('$20');
  });

  it('does not treat empty or dollar-only block math as KaTeX', () => {
    expect(markdownToHtml('$$   $$')).not.toContain('data-mx-maths');
    expect(markdownToHtml('$$ $ $$')).not.toContain('data-mx-maths');
  });

  it('does not parse five consecutive dollar signs in a sentence as math', () => {
    const result = markdownToHtml('hey $$$$$ there');
    expect(result).not.toContain('data-mx-maths');
    expect(result).toContain('$$$$$');
  });

  it('does not parse dollars inside fenced code as math', () => {
    expect(markdownToHtml('```\n$$test$$\n```')).not.toContain('data-mx-maths');
    expect(markdownToHtml('```\n$$test$$\n```')).toContain('$$test$$');
  });

  it('does not parse dollars inside single-line fenced code as math', () => {
    expect(markdownToHtml('```$$test$$```')).not.toContain('data-mx-maths');
    expect(markdownToHtml('```$$test$$```')).toContain('$$test$$');
  });

  it('does not parse dollars inside inline code as math', () => {
    expect(markdownToHtml('`$$test$$`')).not.toContain('data-mx-maths');
    expect(markdownToHtml('`$$test$$`')).toContain('$$test$$');
  });

  it('does not parse inline math when dollars are only inside backticks in a sentence', () => {
    const result = markdownToHtml('See `$$test$$` here.');
    expect(result).not.toContain('data-mx-maths');
    expect(result).toContain('$$test$$');
  });

  it('converts -# small/sub syntax outside code', () => {
    const result = markdownToHtml('-# caption');
    expect(result).toContain('<sub');
    expect(result).toContain('data-md="-#"');
    expect(result).toContain('caption');
  });

  it('does not parse -# inside fenced code as subscript', () => {
    expect(markdownToHtml('```\n-# not sub\n```')).not.toContain('<sub');
    expect(markdownToHtml('```\n-# not sub\n```')).toContain('-# not sub');
  });

  it('does not parse -# inside inline code as subscript', () => {
    expect(markdownToHtml('`-# lit`')).not.toContain('<sub');
    expect(markdownToHtml('`-# lit`')).toContain('-# lit');
  });

  it('parses -# as single-line only so fenced code below stays code', () => {
    const html = markdownToHtml('-# caption\n```\nfenced\n```');
    expect(html).toContain('caption');
    expect(html).toContain('<pre>');
    expect(html).toContain('fenced');
  });

  it('does not parse escaped \\-# as small/sub', () => {
    const result = markdownToHtml('\\-# literal caption');
    expect(result).not.toContain('<sub');
    expect(result).not.toContain('data-md="-#"');
    expect(result).toContain('literal caption');
  });

  it('escapes literal -# when converting paragraph HTML to markdown', () => {
    expect(htmlToMarkdown('<p>-# plain words</p>')).toContain('\\-#');
  });

  it('converts block math syntax', () => {
    const result = markdownToHtml('$$\\frac{a}{b}$$');
    expect(result).toContain('data-mx-maths');
    expect(result).toContain('<div');
  });

  it('does not parse k. as a list', () => {
    const result = markdownToHtml('k. Hello world');
    expect(result).not.toContain('<li>');
    expect(result).not.toContain('<ol>');
    expect(result).not.toContain('<ul>');
  });

  it('handles text without markdown', () => {
    const result = markdownToHtml('Plain text without any formatting');
    expect(result).toContain('Plain text');
  });

  it('handles multiline content', () => {
    const result = markdownToHtml('Line 1\nLine 2\nLine 3');
    expect(result).toContain('Line 1');
    expect(result).toContain('Line 2');
  });

  it('handles escaped markdown characters', () => {
    const result = markdownToHtml('This is \\*not bold\\*');
    expect(result).not.toContain('<strong>');
    expect(result).toContain('not bold');
  });

  it('preserves typed backslashes before punctuation inside fenced code', () => {
    const result = markdownToHtml('```\n\\*literal\\*\n```');
    expect(result).toContain('\\*literal\\*');
    expect(result).toContain('<pre');
  });

  it('preserves typed backslashes inside inline code', () => {
    const result = markdownToHtml('Hi `\\*x\\*` there');
    expect(result).toContain('\\*x\\*');
  });

  it('does not treat >:3 as a block quote (requires space after >)', () => {
    const result = markdownToHtml('>:3');
    expect(result).not.toContain('<blockquote>');
    expect(result).toContain(':3');
  });

  it('treats > followed by space as block quote', () => {
    const result = markdownToHtml('> quoted');
    expect(result).toContain('<blockquote>');
    expect(result).toContain('quoted');
  });

  it('escapes block quote with a single backslash before >', () => {
    const result = markdownToHtml('\\>:3');
    expect(result).not.toContain('<blockquote>');
    expect(result).toContain(':3');
  });

  it('preserves img[data-mx-emoticon] tags with valid mxc URLs', () => {
    const html =
      '<img data-mx-emoticon src="mxc://example.org/emote" alt=":blobcat:" title=":blobcat:" height="32" />';
    const result = markdownToHtml(html);
    expect(result).toContain('mxc://example.org/emote');
    expect(result).toContain('data-mx-emoticon');
    expect(result).toContain('height="32"');
  });

  it('rejects img tags with non-mxc protocols', () => {
    const html = '<img data-mx-emoticon src="https://evil.com/image.png" alt="test" />';
    const result = markdownToHtml(html);
    expect(result).not.toContain('https://evil.com');
  });

  it('rejects img tags with javascript: protocol', () => {
    const html = '<img data-mx-emoticon src="javascript:alert(1)" alt="test" />';
    const result = markdownToHtml(html);
    expect(result).not.toContain('javascript:');
  });

  it('rejects img tags with data: protocol', () => {
    const html =
      '<img data-mx-emoticon src="data:text/html,<script>alert(1)</script>" alt="test" />';
    const result = markdownToHtml(html);
    expect(result).not.toContain('data:');
  });

  it('rejects img tags with mxc URL containing credentials', () => {
    const html = '<img data-mx-emoticon src="mxc://user:pass@evil.com/image" alt="test" />';
    const result = markdownToHtml(html);
    expect(result).not.toContain('user:pass');
  });

  it('rejects img tags with mxc URL containing search params', () => {
    const html = '<img data-mx-emoticon src="mxc://example.com/image?x=y" alt="test" />';
    const result = markdownToHtml(html);
    expect(result).not.toContain('?');
  });
});
