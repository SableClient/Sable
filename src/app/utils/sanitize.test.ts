// Tests for sanitizeCustomHtml — security-critical: strips dangerous content from
// user-supplied Matrix message HTML before rendering.
import { describe, it, expect } from 'vitest';
import { sanitizeCustomHtml } from './sanitize';

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
    // eslint-disable-next-line no-script-url
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

  it('converts <img> with https:// src to a safe <a> link', () => {
    const result = sanitizeCustomHtml('<img src="https://example.com/image.jpg" alt="photo" />');
    expect(result).not.toContain('<img');
    expect(result).toContain('<a');
    expect(result).toContain('https://example.com/image.jpg');
    expect(result).toContain('rel="noreferrer noopener"');
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
