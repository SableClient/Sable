import { describe, expect, it } from 'vitest';
import { getLinks, toPlainText } from './output';
import type { CustomElement, ParagraphElement } from './slate';
import { BlockType } from './types';

describe('getLinks', () => {
  it('extracts URLs from text', () => {
    const node: ParagraphElement = {
      type: BlockType.Paragraph,
      children: [{ text: 'Check out https://example.com for more info' }],
    };
    const links = getLinks([node]);
    expect(links).toContain('https://example.com');
  });

  it('excludes URLs in angle brackets (Matrix HTML spoiler)', () => {
    const node: ParagraphElement = {
      type: BlockType.Paragraph,
      children: [{ text: 'Check out <https://example.com> for more info' }],
    };
    const links = getLinks([node]);
    expect(links).not.toContain('https://example.com');
    expect(links).toHaveLength(0);
  });

  it('extracts markdown link URLs', () => {
    const node: ParagraphElement = {
      type: BlockType.Paragraph,
      children: [{ text: 'Check [my link](https://example.com) for more info' }],
    };
    const links = getLinks([node]);
    expect(links).toContain('https://example.com');
  });

  it('excludes URLs inside code blocks', () => {
    const node = {
      type: BlockType.CodeBlock,
      children: [
        {
          type: BlockType.CodeLine,
          children: [{ text: 'https://example.com' }],
        },
      ],
    };
    const links = getLinks([node as unknown as CustomElement]);
    expect(links).toHaveLength(0);
  });

  it('excludes URLs with code mark (inline code)', () => {
    const node: ParagraphElement = {
      type: BlockType.Paragraph,
      children: [{ text: 'https://example.com', code: true }],
    };
    const links = getLinks([node]);
    expect(links).toHaveLength(0);
  });
});

describe('toPlainText spoiler handling', () => {
  it('replaces ||spoilered text|| with [Spoiler]', () => {
    const node: ParagraphElement = {
      type: BlockType.Paragraph,
      children: [{ text: 'Hello ||spoilered|| world' }],
    };
    const plain = toPlainText(node, true);
    expect(plain).toContain('[Spoiler]');
    expect(plain).not.toContain('||spoilered||');
  });

  it('replaces ||spoilered links|| with [Spoiler]', () => {
    const node: ParagraphElement = {
      type: BlockType.Paragraph,
      children: [{ text: 'Hello ||https://example.com|| world' }],
    };
    const plain = toPlainText(node, true);
    expect(plain).toContain('[Spoiler]');
    expect(plain).not.toContain('||https://example.com||');
  });

  it('extracts non-spoilered markdown link URLs alongside spoilered ones', () => {
    const node: ParagraphElement = {
      type: BlockType.Paragraph,
      children: [
        {
          text: 'Check [visible](https://visible.com) and ||https://hidden.com||',
        },
      ],
    };
    const links = getLinks([node]);
    expect(links).toContain('https://visible.com');
    expect(links).not.toContain('https://hidden.com');
  });
});
