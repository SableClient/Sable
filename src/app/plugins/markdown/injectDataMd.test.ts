import { describe, expect, it } from 'vitest';
import { injectDataMd } from './injectDataMd';

describe('injectDataMd', () => {
  it('injects data-md into headings', () => {
    const result = injectDataMd('<h1>Hello</h1>');
    expect(result).toContain('data-md="#');
  });

  it('does not inject data-md if already present', () => {
    const result = injectDataMd('<h1 data-md="#">Hello</h1>');
    expect(result).toContain('data-md="#');
    // Should not have duplicate data-md
    expect(result.match(/data-md="#/g) ?? []).toHaveLength(1);
  });

  it('injects data-md into blockquotes', () => {
    const result = injectDataMd('<blockquote>Quote</blockquote>');
    expect(result).toContain('data-md=">"');
  });

  it('injects data-md into code blocks', () => {
    const result = injectDataMd('<pre><code>code</code></pre>');
    expect(result).toContain('data-md="```"');
  });

  it('injects data-md into horizontal rules', () => {
    const result = injectDataMd('<hr/>');
    expect(result).toContain('data-md="---"');
  });

  it('injects data-md into subscript', () => {
    const result = injectDataMd('<sub>text</sub>');
    expect(result).toContain('data-md="-#"');
  });

  it('injects data-md into unordered lists', () => {
    const result = injectDataMd('<ul><li>Item</li></ul>');
    expect(result).toContain('data-md="-"');
  });

  it('injects data-md into ordered lists', () => {
    const result = injectDataMd('<ol><li>Item</li></ol>');
    expect(result).toContain('data-md="1."');
  });

  it('injects data-md into strong tags', () => {
    const result = injectDataMd('<strong>bold</strong>');
    expect(result).toContain('data-md="**"');
  });

  it('injects data-md into em tags', () => {
    const result = injectDataMd('<em>italic</em>');
    expect(result).toContain('data-md="*"');
  });

  it('injects data-md into u tags', () => {
    const result = injectDataMd('<u>underline</u>');
    expect(result).toContain('data-md="__"');
  });

  it('injects data-md into s tags', () => {
    const result = injectDataMd('<s>strike</s>');
    expect(result).toContain('data-md="~~"');
  });

  it('injects data-md into del tags', () => {
    const result = injectDataMd('<del>deleted</del>');
    expect(result).toContain('data-md="~~"');
  });

  it('injects data-md into code tags', () => {
    const result = injectDataMd('<code>inline</code>');
    expect(result).toContain('data-md="`"');
  });

  it('handles multiline code blocks without injecting data-md', () => {
    const result = injectDataMd('<code>line1\nline2</code>');
    expect(result).not.toContain('data-md');
  });
});
