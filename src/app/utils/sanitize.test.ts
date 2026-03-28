// Tests for sanitizeCustomHtml — security-critical: strips dangerous content from
// user-supplied Matrix message HTML before rendering.
import { describe, it, expect } from 'vitest';
import { sanitizeCustomHtml, sanitizeText } from './sanitize';

describe('sanitizeCustomHtml – tag allowlist', () => {
  it('passes through permitted tags', () => {
    expect(sanitizeCustomHtml('<b>bold</b>')).toBe('<b>bold</b>');
    expect(sanitizeCustomHtml('<i>italic</i>')).toBe('<i>italic</i>');
    expect(sanitizeCustomHtml('<code>snippet</code>')).toBe('<code>snippet</code>');
  });

  it('strips disallowed tags but keeps their text content', () => {
    const result = sanitizeCustomHtml('<marquee>text</marquee>');
    expect(result).not.toContain('<marquee');
    expect(result).toContain('text');
  });

  it('strips <mx-reply> and its content entirely', () => {
    const result = sanitizeCustomHtml('<mx-reply>quoted message</mx-reply>remaining');
    expect(result).not.toContain('quoted message');
    expect(result).toContain('remaining');
  });
});

describe('sanitizeCustomHtml – XSS prevention', () => {
  it('strips <script> tags and their content', () => {
    const result = sanitizeCustomHtml("<script>alert('xss')</script>");
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
  });

  it('strips inline event handlers', () => {
    const result = sanitizeCustomHtml('<b onclick="alert(1)">click me</b>');
    expect(result).not.toContain('onclick');
    expect(result).toContain('click me');
  });

  it('strips javascript: href on anchor tags', () => {
    const result = sanitizeCustomHtml('<a href="javascript:alert(\'xss\')">link</a>');
    expect(result).not.toMatch(/javascript:/);
  });

  it('strips data: href on anchor tags', () => {
    const result = sanitizeCustomHtml(
      '<a href="data:text/html,<script>alert(1)</script>">link</a>'
    );
    expect(result).not.toContain('data:');
  });

  it('strips vbscript: href', () => {
    const result = sanitizeCustomHtml('<a href="vbscript:msgbox(1)">link</a>');
    expect(result).not.toContain('vbscript:');
  });
});

describe('sanitizeCustomHtml – link transformer', () => {
  it('adds rel and target to http links', () => {
    const result = sanitizeCustomHtml('<a href="https://example.com">link</a>');
    expect(result).toContain('rel="noreferrer noopener"');
    expect(result).toContain('target="_blank"');
  });

  it('passes through existing href for http links', () => {
    const result = sanitizeCustomHtml('<a href="https://example.com">link</a>');
    expect(result).toContain('href="https://example.com"');
  });
});

describe('sanitizeCustomHtml – image transformer', () => {
  it('keeps <img> tags with mxc:// src', () => {
    const result = sanitizeCustomHtml('<img src="mxc://example.com/abc" alt="img" />');
    expect(result).toContain('<img');
    expect(result).toContain('src="mxc://example.com/abc"');
  });

  it('falls back to alt text in a span for https:// src', () => {
    const result = sanitizeCustomHtml('<img src="https://example.com/image.jpg" alt="photo" />');
    expect(result).not.toContain('<img');
    // Non-mxc images are replaced with a span containing the alt text
    expect(result).toContain('<span');
    expect(result).toContain('photo');
    // The remote URL must NOT appear in the output (privacy/security)
    expect(result).not.toContain('https://example.com/image.jpg');
  });
});

describe('sanitizeCustomHtml – style attribute restrictions', () => {
  // The span transformer unconditionally overwrites the style attribute with
  // values derived from data-mx-color / data-mx-bg-color. Inline CSS is always
  // discarded; colors must come from the data-mx-* attributes.
  it('converts data-mx-color to a CSS color style on span', () => {
    const result = sanitizeCustomHtml('<span data-mx-color="#ff0000">text</span>');
    // sanitize-html may normalise whitespace around the colon
    expect(result).toMatch(/color:\s*#ff0000/);
  });

  it('discards plain inline style on span (use data-mx-color instead)', () => {
    const result = sanitizeCustomHtml('<span style="color: #ff0000">text</span>');
    // The transformer replaces style with data-mx-* values; no data-mx-color
    // present here, so style ends up stripped by the allowedStyles check.
    expect(result).not.toContain('color: #ff0000');
  });

  it('strips non-hex values from data-mx-color', () => {
    const result = sanitizeCustomHtml('<span data-mx-color="red">text</span>');
    expect(result).not.toContain('color: red');
  });

  it('strips disallowed CSS properties', () => {
    const result = sanitizeCustomHtml('<span style="position: fixed">text</span>');
    expect(result).not.toContain('position');
  });
});

describe('sanitizeCustomHtml – code block class handling', () => {
  it('preserves language class on code blocks', () => {
    const result = sanitizeCustomHtml('<code class="language-typescript">const x = 1;</code>');
    expect(result).toContain('class="language-typescript"');
  });

  it('strips arbitrary classes not matching language-*', () => {
    const result = sanitizeCustomHtml('<code class="evil-class">code</code>');
    expect(result).not.toContain('evil-class');
  });
});

// ── Matrix spec v1.18 table elements ─────────────────────────────────────────

describe('sanitizeCustomHtml – Matrix spec v1.18 table elements', () => {
  it('passes through a well-formed table', () => {
    const html =
      '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>B</td></tr></tbody></table>';
    const result = sanitizeCustomHtml(html);
    expect(result).toContain('<table>');
    expect(result).toContain('<thead>');
    expect(result).toContain('<tbody>');
    expect(result).toContain('<th>A</th>');
    expect(result).toContain('<td>B</td>');
    expect(result).toContain('<tr>');
  });

  it('passes through <caption>', () => {
    const result = sanitizeCustomHtml(
      '<table><caption>My table</caption><tr><td>cell</td></tr></table>'
    );
    expect(result).toContain('<caption>My table</caption>');
  });

  it('passes through <sup> and <sub>', () => {
    expect(sanitizeCustomHtml('x<sup>2</sup>')).toContain('<sup>2</sup>');
    expect(sanitizeCustomHtml('H<sub>2</sub>O')).toContain('<sub>2</sub>');
  });

  it('passes through <hr>', () => {
    expect(sanitizeCustomHtml('before<hr>after')).toContain('<hr>');
  });
});

// ── Inline styles on non-span tags ───────────────────────────────────────────

describe('sanitizeCustomHtml – inline style on spec-allowed tags', () => {
  it('preserves hex color style on <b>', () => {
    const result = sanitizeCustomHtml('<b style="color: #abcdef">bold</b>');
    expect(result).toMatch(/color:\s*#abcdef/);
  });

  it('preserves hex background-color style on <th>', () => {
    const result = sanitizeCustomHtml(
      '<table><tr><th style="background-color: #123456">H</th></tr></table>'
    );
    expect(result).toMatch(/background-color:\s*#123456/);
  });

  it('strips non-hex color values on <b>', () => {
    const result = sanitizeCustomHtml('<b style="color: red">bold</b>');
    expect(result).not.toContain('color: red');
  });

  it('strips disallowed CSS properties on <p>', () => {
    const result = sanitizeCustomHtml('<p style="font-size: 99px; color: #ff0000">text</p>');
    expect(result).not.toContain('font-size');
    expect(result).toMatch(/color:\s*#ff0000/);
  });
});

// ── image transformer – disallowed protocols ─────────────────────────────────

describe('sanitizeCustomHtml – image transformer protocol checks', () => {
  it('falls back to alt text for javascript: src', () => {
    // eslint-disable-next-line no-script-url
    const result = sanitizeCustomHtml('<img src="javascript:alert(1)" alt="bad" />');
    expect(result).not.toContain('<img');
    expect(result).toContain('bad');
  });

  it('falls back to empty span for data: src with no alt', () => {
    const result = sanitizeCustomHtml('<img src="data:image/png;base64,abc" />');
    expect(result).not.toContain('<img');
    expect(result).not.toContain('data:');
  });
});

// ── sanitizeText ─────────────────────────────────────────────────────────────

describe('sanitizeText', () => {
  it('escapes & to &amp;', () => {
    expect(sanitizeText('foo & bar')).toBe('foo &amp; bar');
  });

  it('escapes < and > to HTML entities', () => {
    expect(sanitizeText('<b>text</b>')).toBe('&lt;b&gt;text&lt;/b&gt;');
  });

  it('escapes double quotes', () => {
    expect(sanitizeText('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(sanitizeText("it's")).toBe('it&#39;s');
  });

  it('leaves plain text unchanged', () => {
    expect(sanitizeText('hello world')).toBe('hello world');
  });
});
