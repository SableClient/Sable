import { describe, expect, it } from 'vitest';

import {
  plainToEditorInput,
  toMatrixCustomHTML,
  toPlainText,
  trimCustomHtml,
} from '$components/editor';
import { outgoingMessageTransforms } from './outgoingMessageTransforms';
import { buildSettingsLink, getSettingsLinkLabel } from '$features/settings/settingsLink';

function runOutgoingPipeline(input: string, settingsLinkBaseUrl = 'https://app.example') {
  let children = plainToEditorInput(input);
  const context = { settingsLinkBaseUrl };

  outgoingMessageTransforms.forEach((t) => {
    if (!t.shouldApply(children, context)) return;
    children = t.apply(children, context);
  });

  const plain = toPlainText(children, true).trim();
  const html = trimCustomHtml(
    toMatrixCustomHTML(children, {
      stripNickname: true,
      nickNameReplacement: new Map(),
    })
  );

  return { children, plain, html };
}

describe('PMP proxy outgoing pipeline parity', () => {
  it('renders markdown like normal messages (bold)', () => {
    const { plain, html } = runOutgoingPipeline('**bold**');
    expect(plain).toBe('**bold**');
    // Our markdown pipeline injects `data-md` markers for round-tripping.
    expect(html).toMatch(/<strong[^>]*>bold<\/strong>/);
  });

  it('preserves markdown links in plaintext and renders anchors in html', () => {
    const { plain, html } = runOutgoingPipeline('[Sable](https://example.com)');
    expect(plain).toBe('[Sable](https://example.com)');
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain('>Sable</a>');
  });

  it('escapes raw html so it is not treated as markup', () => {
    const { plain, html } = runOutgoingPipeline('<b>nope</b>');
    expect(plain).toBe('<b>nope</b>');
    // markdownToHtml sanitizes/strips raw tags; ensure it does not render as actual <b>.
    expect(html).toContain('nope');
    expect(html).not.toContain('<b>nope</b>');
  });

  it('applies outgoing transforms (settings link rewrite) like normal messages', () => {
    const base = 'https://app.example';
    const url = buildSettingsLink(base, 'appearance', 'message-link-preview');
    const label = getSettingsLinkLabel('appearance', 'message-link-preview');

    const { plain, html } = runOutgoingPipeline(`see ${url}`, base);

    expect(plain).toContain(`[${label}](${url})`);
    // HTML encodes & as &amp; in attributes
    const encodedUrl = url.replaceAll('&', '&amp;');
    expect(html).toContain(`<a href="${encodedUrl}"`);
    const encodedLabel = label.replaceAll('>', '&gt;');
    expect(html).toContain(`>${encodedLabel}</a>`);
  });

  it('supports multi-paragraph messages (keeps line breaks)', () => {
    const { plain, html } = runOutgoingPipeline('first line\n\nsecond line');
    // Plaintext keeps the blank line separation
    expect(plain).toBe('first line\n\nsecond line');
    // HTML should contain two paragraphs
    expect(html).toMatch(/<p>first line<\/p>[\s\S]*<p>second line<\/p>/);
  });

  it('supports fenced code blocks and renders them as code', () => {
    const md = ['```ts', 'const x = 1', '```'].join('\n');
    const { plain, html } = runOutgoingPipeline(md);
    expect(plain).toBe(md);
    // Allow flexibility in the exact HTML produced by the markdown pipeline
    expect(html).toMatch(/<pre[\s\S]*><code[\s\S]*>[\s\S]*const x = 1[\s\S]*<\/code><\/pre>/);
  });
});
