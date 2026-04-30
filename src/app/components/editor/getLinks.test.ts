import { describe, expect, it } from 'vitest';
import type { Descendant } from 'slate';
import { getLinks, toPlainText } from './output';
import type { ParagraphElement } from './slate';
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
    expect(links).toEqual([]);
  });

  it('extracts markdown link URLs', () => {
    const node: ParagraphElement = {
      type: BlockType.Paragraph,
      children: [{ text: 'Check [my link](https://example.com) for more info' }],
    };
    const links = getLinks([node]);
    expect(links).toContain('https://example.com');
  });

  it('excludes URLs inside markdown inline code spans', () => {
    const node: ParagraphElement = {
      type: BlockType.Paragraph,
      children: [{ text: 'Do not visit `https://example.com` please' }],
    };
    const links = getLinks([node]);
    expect(links).toEqual([]);
  });

  it('excludes URLs inside markdown code blocks spanning multiple paragraphs', () => {
    const nodes: Descendant[] = [
      { type: BlockType.Paragraph, children: [{ text: '```' }] },
      { type: BlockType.Paragraph, children: [{ text: 'https://example.com' }] },
      { type: BlockType.Paragraph, children: [{ text: '```' }] },
    ];
    const links = getLinks(nodes);
    expect(links).toEqual([]);
  });
});

describe('toPlainText spoiler handling', () => {
  it('replaces ||spoilered text|| with [Spoiler]', () => {
    const node: ParagraphElement = {
      type: BlockType.Paragraph,
      children: [{ text: 'Hello ||spoilered|| world' }],
    };
    const plain = toPlainText(node);
    expect(plain).toContain('[Spoiler]');
    expect(plain).not.toContain('||spoilered||');
  });

  it('replaces ||spoilered links|| with [Spoiler]', () => {
    const node: ParagraphElement = {
      type: BlockType.Paragraph,
      children: [{ text: 'Hello ||https://example.com|| world' }],
    };
    const plain = toPlainText(node);
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
