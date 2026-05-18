import { describe, expect, it } from 'vitest';
import { escapeNonAllowlistedHtmlTags } from './allowedHtmlTags';

describe('escapeNonAllowlistedHtmlTags', () => {
  it('entity-escapes unknown tags', () => {
    expect(escapeNonAllowlistedHtmlTags('<test>')).toBe('&lt;test&gt;');
    expect(escapeNonAllowlistedHtmlTags('<test> </test>')).toBe('&lt;test&gt; &lt;/test&gt;');
  });

  it('leaves well-formed allowlisted tags unchanged', () => {
    expect(escapeNonAllowlistedHtmlTags('<strong>bold</strong>')).toBe('<strong>bold</strong>');
    expect(escapeNonAllowlistedHtmlTags('<br>')).toBe('<br>');
    expect(escapeNonAllowlistedHtmlTags('<img src="mxc://x/y" alt="e" />')).toBe(
      '<img src="mxc://x/y" alt="e" />'
    );
  });

  it('entity-escapes allowlisted tags missing a required closing tag', () => {
    expect(escapeNonAllowlistedHtmlTags('<strong>bold')).toBe('&lt;strong&gt;bold');
    expect(escapeNonAllowlistedHtmlTags('<p>hello')).toBe('&lt;p&gt;hello');
  });

  it('entity-escapes mismatched closing tags', () => {
    expect(escapeNonAllowlistedHtmlTags('<strong>foo</em>')).toBe('&lt;strong&gt;foo&lt;/em&gt;');
  });

  it('entity-escapes orphan closing tags', () => {
    expect(escapeNonAllowlistedHtmlTags('</strong>')).toBe('&lt;/strong&gt;');
  });

  it('does not treat angle-bracket URLs as tags', () => {
    const url = '<https://example.com/path>';
    expect(escapeNonAllowlistedHtmlTags(url)).toBe(url);
  });

  it('does not escape tags inside markdown code spans', () => {
    expect(escapeNonAllowlistedHtmlTags('`<strong>`')).toBe('`<strong>`');
    expect(escapeNonAllowlistedHtmlTags('```\n<strong>\n```')).toBe('```\n<strong>\n```');
  });

  it('does not entity-escape markdown-backslash-escaped tags', () => {
    expect(escapeNonAllowlistedHtmlTags(String.raw`\<test\>`)).toBe(String.raw`\<test\>`);
    expect(escapeNonAllowlistedHtmlTags(String.raw`\<test>`)).toBe(String.raw`\<test>`);
    expect(escapeNonAllowlistedHtmlTags(String.raw`before \<foo\> after`)).toBe(
      String.raw`before \<foo\> after`
    );
  });
});
