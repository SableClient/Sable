// Regression tests for unwrapForwardedContent — verifies that forwarded message
// content is sanitized before being returned, and that the forward-marker
// blockquote unwrapping works correctly.
import { describe, it, expect } from 'vitest';
import { unwrapForwardedContent } from './MessageForward';

describe('unwrapForwardedContent – passthrough (no forward marker)', () => {
  it('returns the sanitized content unchanged when there is no forward marker', () => {
    const result = unwrapForwardedContent('<b>Hello</b>');
    expect(result).toContain('Hello');
    expect(result).toContain('<b>');
  });

  it('strips XSS from content with no forward marker', () => {
    const result = unwrapForwardedContent("<script>alert('xss')</script><b>safe</b>");
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
    expect(result).toContain('safe');
  });

  it('strips javascript: href with no forward marker', () => {
    const result = unwrapForwardedContent('<a href="javascript:alert(1)">link</a>');
    expect(result).not.toMatch(/javascript:/);
  });
});

describe('unwrapForwardedContent – forward marker unwrapping', () => {
  it('extracts the inner blockquote when data-forward-marker is present', () => {
    const html =
      '<div data-forward-marker="true"><blockquote><b>forwarded text</b></blockquote></div>';
    const result = unwrapForwardedContent(html);
    expect(result).toContain('forwarded text');
    // The outer wrapper should be gone
    expect(result).not.toContain('data-forward-marker');
  });

  it('sanitizes XSS inside the forwarded blockquote', () => {
    const html =
      '<div data-forward-marker="true"><blockquote><script>evil()</script>safe</blockquote></div>';
    const result = unwrapForwardedContent(html);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('evil()');
    expect(result).toContain('safe');
  });

  it('returns the original sanitized content if the marker has no blockquote child', () => {
    const html = '<span data-forward-marker="true">no blockquote here</span>';
    const result = unwrapForwardedContent(html);
    // Falls back to the original content, sanitized
    expect(result).toContain('no blockquote here');
  });
});
