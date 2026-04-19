import { describe, expect, it } from 'vitest';
import { toMatrixCustomHTML, toPlainText, trimCustomHtml } from '$components/editor/output';
import { BlockType } from '$components/editor/types';
import {
  hasSettingsLinksToRewriteInDescendants,
  rewriteSettingsLinksInDescendants,
} from './settingsLinkMessage';

const settingsUrl =
  'https://app.example/settings/account?focus=display-name&moe.sable.client.action=settings';
const settingsUrlWithExtraParam =
  'https://app.example/settings/account?focus=display-name&moe.sable.client.action=settings&hello=world';
const invalidSettingsUrl =
  'https://app.example/settings/account?focus=display-name2&moe.sable.client.action=settings';

describe('settingsLinkMessage', () => {
  it('detects bare settings links that need outgoing rewriting', () => {
    expect(
      hasSettingsLinksToRewriteInDescendants(
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
    const rewritten = rewriteSettingsLinksInDescendants(
      [
        {
          type: BlockType.Paragraph,
          children: [{ text: settingsUrl }],
        },
      ],
      'https://app.example'
    );

    expect(toPlainText(rewritten, false).trim()).toBe(
      `[Settings > Account > Display Name](${settingsUrl})`
    );
    expect(
      trimCustomHtml(
        toMatrixCustomHTML(rewritten, {
          allowTextFormatting: true,
          allowBlockMarkdown: false,
          allowInlineMarkdown: false,
        })
      )
    ).toBe(`<a href="${settingsUrl}">Settings &gt; Account &gt; Display Name</a>`);
  });

  it('rewrites same-base settings links with extra query params', () => {
    const rewritten = rewriteSettingsLinksInDescendants(
      [
        {
          type: BlockType.Paragraph,
          children: [{ text: settingsUrlWithExtraParam }],
        },
      ],
      'https://app.example'
    );

    expect(toPlainText(rewritten, false).trim()).toBe(
      `[Settings > Account > Display Name](${settingsUrlWithExtraParam})`
    );
  });

  it('does not rewrite settings links that are already in markdown link syntax', () => {
    const rewritten = rewriteSettingsLinksInDescendants(
      [
        {
          type: BlockType.Paragraph,
          children: [{ text: `[Display Name](${settingsUrl})` }],
        },
      ],
      'https://app.example'
    );

    expect(toPlainText(rewritten, true).trim()).toBe(`[Display Name](${settingsUrl})`);
  });

  it('does not rewrite settings links inside code blocks', () => {
    const rewritten = rewriteSettingsLinksInDescendants(
      [
        {
          type: BlockType.CodeBlock,
          children: [
            {
              type: BlockType.CodeLine,
              children: [{ text: settingsUrl }],
            },
          ],
        },
      ],
      'https://app.example'
    );

    expect(toPlainText(rewritten, false).trim()).toBe(settingsUrl);
    expect(
      trimCustomHtml(
        toMatrixCustomHTML(rewritten, {
          allowTextFormatting: true,
          allowBlockMarkdown: false,
          allowInlineMarkdown: false,
        })
      )
    ).not.toContain('<a href=');
  });

  it('does not rewrite settings links inside markdown inline code spans', () => {
    expect(
      hasSettingsLinksToRewriteInDescendants(
        [
          {
            type: BlockType.Paragraph,
            children: [{ text: `\`${settingsUrl}\`` }],
          },
        ],
        'https://app.example',
        true
      )
    ).toBe(false);

    const rewritten = rewriteSettingsLinksInDescendants(
      [
        {
          type: BlockType.Paragraph,
          children: [{ text: `\`${settingsUrl}\`` }],
        },
      ],
      'https://app.example',
      true
    );

    expect(toPlainText(rewritten, true).trim()).toBe(`\`${settingsUrl}\``);
    expect(
      trimCustomHtml(
        toMatrixCustomHTML(rewritten, {
          allowTextFormatting: true,
          allowBlockMarkdown: false,
          allowInlineMarkdown: true,
        })
      )
    ).not.toContain('Settings &gt; Account &gt; Display Name');
  });

  it('does not rewrite settings links inside markdown autolinks', () => {
    const rewritten = rewriteSettingsLinksInDescendants(
      [
        {
          type: BlockType.Paragraph,
          children: [{ text: `<${settingsUrl}>` }],
        },
      ],
      'https://app.example',
      true
    );

    expect(toPlainText(rewritten, true).trim()).toBe(`<${settingsUrl}>`);
  });

  it('does not rewrite settings links inside literal html text', () => {
    const rewritten = rewriteSettingsLinksInDescendants(
      [
        {
          type: BlockType.Paragraph,
          children: [{ text: `<a href="${settingsUrl}">Settings</a>` }],
        },
      ],
      'https://app.example',
      true
    );

    expect(toPlainText(rewritten, true).trim()).toBe(`<a href="${settingsUrl}">Settings</a>`);
  });

  it('does not rewrite settings links with unknown focus ids', () => {
    expect(
      hasSettingsLinksToRewriteInDescendants(
        [
          {
            type: BlockType.Paragraph,
            children: [{ text: invalidSettingsUrl }],
          },
        ],
        'https://app.example'
      )
    ).toBe(false);

    const rewritten = rewriteSettingsLinksInDescendants(
      [
        {
          type: BlockType.Paragraph,
          children: [{ text: invalidSettingsUrl }],
        },
      ],
      'https://app.example'
    );

    expect(toPlainText(rewritten, false).trim()).toBe(invalidSettingsUrl);
  });

  it('rewrites plain same-base hash-router settings links when given the runtime app base', () => {
    const hashRouterSettingsUrl = 'https://app.example/#/app/settings/account?focus=display-name';
    const rewritten = rewriteSettingsLinksInDescendants(
      [
        {
          type: BlockType.Paragraph,
          children: [{ text: hashRouterSettingsUrl }],
        },
      ],
      'https://app.example/#/app'
    );

    expect(toPlainText(rewritten, false).trim()).toBe(
      `[Settings > Account > Display Name](${hashRouterSettingsUrl})`
    );
  });
});
