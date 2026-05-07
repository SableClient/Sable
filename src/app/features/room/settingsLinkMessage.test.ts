import { describe, expect, it } from 'vitest';
import { toMatrixCustomHTML, toPlainText, trimCustomHtml } from '$components/editor/output';
import { BlockType } from '$components/editor/types';
import { hasSettingsLinksToRewrite, rewriteSettingsLinks } from './settingsLinkMessage';

const settingsUrl =
  'https://app.example/settings/account?focus=display-name&moe.sable.client.action=settings';
const settingsUrlWithExtraParam =
  'https://app.example/settings/account?focus=display-name&moe.sable.client.action=settings&hello=world';
const invalidSettingsUrl =
  'https://app.example/settings/account?focus=display-name2&moe.sable.client.action=settings';

describe('settingsLinkMessage', () => {
  it('detects bare settings links that need outgoing rewriting', () => {
    expect(
      hasSettingsLinksToRewrite(
        [
          {
            type: BlockType.Paragraph,
            children: [{ text: settingsUrl }],
          },
        ],
        'https://app.example'
      )
    ).toBe(true);
  });

  it('rewrites bare settings links into message-friendly labels before serialization', () => {
    const rewritten = rewriteSettingsLinks(
      [
        {
          type: BlockType.Paragraph,
          children: [{ text: settingsUrl }],
        },
      ],
      'https://app.example'
    );

    expect(toPlainText(rewritten).trim()).toBe(
      `[Settings > Account > Display Name](${settingsUrl})`
    );
    expect(trimCustomHtml(toMatrixCustomHTML(rewritten, {}))).toContain(
      `Settings &gt; Account &gt; Display Name</a>`
    );
  });

  it('rewrites same-base settings links with extra query params', () => {
    const rewritten = rewriteSettingsLinks(
      [
        {
          type: BlockType.Paragraph,
          children: [{ text: settingsUrlWithExtraParam }],
        },
      ],
      'https://app.example'
    );

    expect(toPlainText(rewritten).trim()).toBe(
      `[Settings > Account > Display Name](${settingsUrlWithExtraParam})`
    );
  });

  it('does not rewrite settings links that are already in markdown link syntax', () => {
    const rewritten = rewriteSettingsLinks(
      [
        {
          type: BlockType.Paragraph,
          children: [{ text: `[Display Name](${settingsUrl})` }],
        },
      ],
      'https://app.example'
    );

    expect(toPlainText(rewritten).trim()).toBe(`[Display Name](${settingsUrl})`);
  });

  it('does not rewrite settings links inside markdown inline code spans', () => {
    expect(
      hasSettingsLinksToRewrite(
        [
          {
            type: BlockType.Paragraph,
            children: [{ text: `\`${settingsUrl}\`` }],
          },
        ],
        'https://app.example'
      )
    ).toBe(false);

    const rewritten = rewriteSettingsLinks(
      [
        {
          type: BlockType.Paragraph,
          children: [{ text: `\`${settingsUrl}\`` }],
        },
      ],
      'https://app.example'
    );

    expect(toPlainText(rewritten).trim()).toBe(`\`${settingsUrl}\``);
    expect(trimCustomHtml(toMatrixCustomHTML(rewritten, {}))).not.toContain(
      'Settings &gt; Account &gt; Display Name'
    );
  });

  it('does not rewrite settings links inside markdown autolinks', () => {
    const rewritten = rewriteSettingsLinks(
      [
        {
          type: BlockType.Paragraph,
          children: [{ text: `<${settingsUrl}>` }],
        },
      ],
      'https://app.example'
    );

    expect(toPlainText(rewritten).trim()).toBe(settingsUrl);
  });

  it('does not rewrite settings links inside literal html text', () => {
    const rewritten = rewriteSettingsLinks(
      [
        {
          type: BlockType.Paragraph,
          children: [{ text: `<a href="${settingsUrl}">Settings</a>` }],
        },
      ],
      'https://app.example'
    );

    expect(toPlainText(rewritten).trim()).toBe(`<a href="${settingsUrl}">Settings</a>`);
  });

  it('does not rewrite settings links with unknown focus ids', () => {
    expect(
      hasSettingsLinksToRewrite(
        [
          {
            type: BlockType.Paragraph,
            children: [{ text: invalidSettingsUrl }],
          },
        ],
        'https://app.example'
      )
    ).toBe(false);

    const rewritten = rewriteSettingsLinks(
      [
        {
          type: BlockType.Paragraph,
          children: [{ text: invalidSettingsUrl }],
        },
      ],
      'https://app.example'
    );

    expect(toPlainText(rewritten).trim()).toBe(invalidSettingsUrl);
  });

  it('rewrites plain same-base hash-router settings links when given the runtime app base', () => {
    const hashRouterSettingsUrl = 'https://app.example/#/app/settings/account?focus=display-name';
    const rewritten = rewriteSettingsLinks(
      [
        {
          type: BlockType.Paragraph,
          children: [{ text: hashRouterSettingsUrl }],
        },
      ],
      'https://app.example/#/app'
    );

    expect(toPlainText(rewritten).trim()).toBe(
      `[Settings > Account > Display Name](${hashRouterSettingsUrl})`
    );
  });
});
