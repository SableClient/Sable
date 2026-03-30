import { describe, expect, it } from 'vitest';
import { sanitizeCustomHtml } from './sanitize';

describe('sanitizeCustomHtml', () => {
  it('keeps permitted Matrix v1.18 tags', () => {
    const result = sanitizeCustomHtml(
      '<details><summary>Summary</summary><table><tbody><tr><td><del>text</del></td></tr></tbody></table></details>'
    );

    expect(result).toContain('<details>');
    expect(result).toContain('<summary>Summary</summary>');
    expect(result).toContain('<table>');
    expect(result).toContain('<del>text</del>');
  });

  it('strips tags outside the Matrix v1.18 allowlist', () => {
    const result = sanitizeCustomHtml('<font color="#ff0000">font</font><strike>strike</strike>');

    expect(result).not.toContain('<font');
    expect(result).not.toContain('<strike');
    expect(result).toContain('font');
    expect(result).toContain('strike');
  });

  it('strips mx-reply and its contents entirely', () => {
    const result = sanitizeCustomHtml('<mx-reply>quoted message</mx-reply><p>remaining</p>');

    expect(result).not.toContain('quoted message');
    expect(result).toBe('<p>remaining</p>');
  });

  it('does not accept style attributes anywhere', () => {
    const result = sanitizeCustomHtml(
      '<span style="color:#00ff00" data-mx-color="#ff0000">text</span><p style="color:#00ff00">para</p>'
    );

    expect(result).not.toContain('style=');
    expect(result).toContain('data-mx-color="#ff0000"');
  });

  it('keeps only the permitted attributes on each tag while preserving markdown metadata', () => {
    const result = sanitizeCustomHtml(
      '<span data-mx-color="#ff0000" data-mx-bg-color="#00ff00" data-mx-spoiler="spoiler" data-mx-maths="x" data-md="**">span</span>' +
        '<a href="https://example.com" target="_blank" rel="noreferrer" data-md="[]()">link</a>' +
        '<ol start="2" type="A" data-md="1."><li>item</li></ol>' +
        '<pre class="language-rust" data-md="```" data-lang="rust"><code class="language-rust" data-md="```" data-lang="rust">fn main() {}</code></pre>' +
        '<div data-mx-maths="x" data-md="nope">maths</div>'
    );

    expect(result).toContain('data-mx-color="#ff0000"');
    expect(result).toContain('data-mx-bg-color="#00ff00"');
    expect(result).toContain('data-mx-spoiler="spoiler"');
    expect(result).toContain('data-mx-maths="x"');
    expect(result).toContain('data-md="**"');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('data-md="[]()"');
    expect(result).not.toContain('rel=');
    expect(result).toContain('<ol start="2" data-md="1.">');
    expect(result).not.toContain('type=');
    expect(result).toContain('class="language-rust"');
    expect(result).toContain('data-lang="rust"');
    expect(result).toContain('data-md="```"');
    expect(result).toContain('<div data-mx-maths="x">maths</div>');
  });

  it('preserves a language class only when every class starts with language-', () => {
    expect(sanitizeCustomHtml('<code class="language-typescript">code</code>')).toContain(
      'class="language-typescript"'
    );
    expect(sanitizeCustomHtml('<pre class="language-rust"><code>code</code></pre>')).toContain(
      'class="language-rust"'
    );
    expect(
      sanitizeCustomHtml('<code class="language-typescript language-js">code</code>')
    ).toContain('class="language-typescript language-js"');
    expect(sanitizeCustomHtml('<code class="language-typescript extra">code</code>')).not.toContain(
      'class='
    );
  });

  it('keeps only valid absolute href schemes on links', () => {
    expect(sanitizeCustomHtml('<a href="https://example.com">https</a>')).toContain(
      'href="https://example.com"'
    );
    expect(sanitizeCustomHtml('<a href="mailto:test@example.com">mail</a>')).toContain(
      'href="mailto:test@example.com"'
    );
    expect(sanitizeCustomHtml('<a href="magnet:?xt=urn:btih:abcdef">magnet</a>')).toContain(
      'href="magnet:?xt=urn:btih:abcdef"'
    );

    expect(sanitizeCustomHtml('<a href="/relative">relative</a>')).toBe('<a>relative</a>');
    expect(sanitizeCustomHtml('<a href="matrix:u/alice:example.com">matrix</a>')).toBe(
      '<a>matrix</a>'
    );
    expect(sanitizeCustomHtml('<a href="javascript:alert(1)">bad</a>')).toBe('<a>bad</a>');
    expect(sanitizeCustomHtml('<a href="vbscript:msgbox(1)">bad</a>')).toBe('<a>bad</a>');
  });

  it('keeps only mxc image sources and preserves custom-emote markers', () => {
    const allowed = sanitizeCustomHtml(
      '<img data-mx-emoticon src="mxc://example.com/abc123" alt="blobcat" title="blobcat" height="32" />'
    );
    const blocked = sanitizeCustomHtml('<img src="https://example.com/image.jpg" alt="img" />');

    expect(allowed).toContain('<img');
    expect(allowed).toContain('data-mx-emoticon');
    expect(allowed).toContain('src="mxc://example.com/abc123"');
    expect(allowed).toContain('alt="blobcat"');
    expect(blocked).not.toContain('<img');
  });

  it('restores only one validated image src after masking duplicate image source attributes', () => {
    const result = sanitizeCustomHtml(
      '<img src="mxc://example.com/primary" src="mxc://example.com/secondary" srcset="mxc://example.com/secondary 1x" alt="img" />'
    );

    expect(result).toContain('src="mxc://example.com/primary"');
    expect(result).not.toContain('mxc://example.com/secondary');
    expect(result).not.toContain('srcset=');
    expect(result.match(/\ssrc=/g)).toHaveLength(1);
  });

  it('drops invalid Matrix color attributes instead of translating them to style', () => {
    const result = sanitizeCustomHtml(
      '<span data-mx-color="red" data-mx-bg-color="#123">text</span>'
    );

    expect(result).toBe('<span>text</span>');
  });

  it('enforces the 100-level nesting limit', () => {
    const deepHtml = `${'<div>'.repeat(101)}text${'</div>'.repeat(101)}`;
    const result = sanitizeCustomHtml(deepHtml);

    expect(result).toContain('text');
    expect((result.match(/<div>/g) ?? []).length).toBeLessThanOrEqual(100);
  });
});
