import { describe, expect, it, beforeAll } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  tokenizeMarkdown,
  markdownDecorations,
  markdownPreviewPlugin,
  type MarkdownToken,
} from './markdown';
import { toProseMirrorDocument } from './prosemirrorSchema';
import type { EditorDocument } from './model';
import { BlockType } from './types';
import * as editorCss from './Editor.css';

beforeAll(() => {
  Element.prototype.getClientRects ??=
    (() => []) as unknown as typeof Element.prototype.getClientRects;
});

const findToken = (tokens: MarkdownToken[], predicate: (t: MarkdownToken) => unknown) =>
  tokens.find(predicate);

const expectRange = (token: MarkdownToken | undefined, start: number, end: number) => {
  expect(token?.start).toBe(start);
  expect(token?.end).toBe(end);
};

describe('tokenizeMarkdown', () => {
  it('dims bold delimiters and bolds the content', () => {
    const tokens = tokenizeMarkdown('**hello**');
    expect(tokens).toHaveLength(3);
    expectRange(tokens[0], 0, 2);
    expect(tokens[0]!.markdownToken).toBe(true);
    expectRange(tokens[1], 2, 7);
    expect(tokens[1]!.markdownBold).toBe(true);
    expectRange(tokens[2], 7, 9);
    expect(tokens[2]!.markdownToken).toBe(true);
  });

  it('styles italic content with single asterisks', () => {
    const tokens = tokenizeMarkdown('an *italic* word');
    const italic = findToken(tokens, (t) => t.markdownItalic);
    expect(italic?.start).toBe(4);
    expect(italic?.end).toBe(10);
    const openAsterisk = findToken(tokens, (t) => t.markdownToken && t.start === 3);
    expect(openAsterisk?.start).toBe(3);
    expect(openAsterisk?.end).toBe(4);
    const closeAsterisk = findToken(tokens, (t) => t.markdownToken && t.end === 11);
    expect(closeAsterisk?.start).toBe(10);
    expect(closeAsterisk?.end).toBe(11);
  });

  it('matches bold before italic for double asterisks', () => {
    const tokens = tokenizeMarkdown('**bold**');
    const hasItalic = tokens.some((t) => t.markdownItalic);
    expect(hasItalic).toBe(false);
  });

  it('handles strikethrough, underline, and spoiler delimiters', () => {
    const strike = findToken(tokenizeMarkdown('~~gone~~'), (t) => t.markdownStrikeThrough);
    expect(strike?.start).toBe(2);
    expect(strike?.end).toBe(6);
    const under = findToken(tokenizeMarkdown('__under__'), (t) => t.markdownUnderline);
    expect(under?.start).toBe(2);
    expect(under?.end).toBe(7);
    const spoiler = findToken(tokenizeMarkdown('||secret||'), (t) => t.markdownSpoiler);
    expect(spoiler?.start).toBe(2);
    expect(spoiler?.end).toBe(8);
  });

  it('styles inline code and dims the backticks', () => {
    const tokens = tokenizeMarkdown('use `code` here');
    const code = findToken(tokens, (t) => t.markdownCode);
    expect(code?.start).toBe(5);
    expect(code?.end).toBe(9);
    const openTick = findToken(tokens, (t) => t.markdownToken && t.start === 4);
    expect(openTick?.start).toBe(4);
    expect(openTick?.end).toBe(5);
  });

  it('does not treat unclosed delimiters as spans', () => {
    const tokens = tokenizeMarkdown('*unclosed');
    expect(tokens).toHaveLength(0);
  });

  it('does not treat empty delimiters as spans', () => {
    const tokens = tokenizeMarkdown('****');
    expect(tokens).toHaveLength(0);
  });

  it('previews multiple spans on one line', () => {
    const tokens = tokenizeMarkdown('**a** and *b*');
    const bold = findToken(tokens, (t) => t.markdownBold);
    expect(bold?.start).toBe(2);
    expect(bold?.end).toBe(3);
    const italic = findToken(tokens, (t) => t.markdownItalic);
    expect(italic?.start).toBe(11);
    expect(italic?.end).toBe(12);
  });

  it('styles link labels and dims link punctuation', () => {
    const tokens = tokenizeMarkdown('[label](https://example.com)');
    const link = findToken(tokens, (t) => t.markdownLink);
    expect(link?.start).toBe(1);
    expect(link?.end).toBe(6);
    const openBracket = findToken(tokens, (t) => t.markdownToken && t.start === 0);
    expect(openBracket?.start).toBe(0);
    expect(openBracket?.end).toBe(1);
    const closeBracket = findToken(tokens, (t) => t.markdownToken && t.start === 6);
    expect(closeBracket?.start).toBe(6);
    expect(closeBracket?.end).toBe(28);
  });

  it('dims heading and list markers at line starts', () => {
    expectRange(tokenizeMarkdown('# title')[0], 0, 2);
    expect(tokenizeMarkdown('# title')[0]!.markdownToken).toBe(true);
    expectRange(tokenizeMarkdown('- item')[0], 0, 2);
    expectRange(tokenizeMarkdown('1. item')[0], 0, 3);
    expectRange(tokenizeMarkdown('> quote')[0], 0, 2);
  });

  it('dims markers on subsequent lines too', () => {
    const tokens = tokenizeMarkdown('plain\n> quote');
    const quote = findToken(tokens, (t) => t.markdownToken && t.start === 6);
    expect(quote?.start).toBe(6);
    expect(quote?.end).toBe(8);
  });

  it('returns no tokens for plain text', () => {
    expect(tokenizeMarkdown('just plain text')).toHaveLength(0);
  });

  it('returns no tokens for empty text', () => {
    expect(tokenizeMarkdown('')).toHaveLength(0);
  });
});

const decorationFinder = (texts: string[]) => {
  const editorDocument: EditorDocument = texts.map((text) => ({
    type: BlockType.Paragraph,
    children: [{ text }],
  }));
  const doc = toProseMirrorDocument(editorDocument);
  const state = EditorState.create({ doc });
  return markdownDecorations(state).find(1, doc.content.size);
};

const renderEditor = (text: string) => {
  const editorDocument: EditorDocument = [{ type: BlockType.Paragraph, children: [{ text }] }];
  const doc = toProseMirrorDocument(editorDocument);
  const state = EditorState.create({ doc, plugins: [markdownPreviewPlugin] });
  const container = document.createElement('div');
  const view = new EditorView(container, { state });
  return { container, view };
};

const decorationSpan = (container: HTMLElement, cls: string) =>
  Array.from(container.querySelectorAll('span')).find((span) => span.className === cls);

describe('markdownPreviewPlugin decorations', () => {
  it('maps bold tokens onto doc positions', () => {
    const found = decorationFinder(['**hi**']);
    expect(found.map((d) => [d.from, d.to])).toEqual([
      [1, 3],
      [3, 5],
      [5, 7],
    ]);
  });

  it('maps tokens in later paragraphs onto their own doc positions', () => {
    const found = decorationFinder(['plain', '`code`']);
    expect(found.map((d) => [d.from, d.to])).toEqual([
      [8, 9],
      [9, 13],
      [13, 14],
    ]);
  });

  it('dims bold delimiters and bolds the content', () => {
    const { container, view } = renderEditor('**hi**');
    expect(decorationSpan(container, editorCss.EditorMarkdownBold)?.textContent).toBe('hi');
    expect(decorationSpan(container, editorCss.EditorMarkdownToken)?.textContent).toBe('**');
    view.destroy();
  });

  it('styles inline code and spoilers', () => {
    const { container, view } = renderEditor('a `code` and ||spoiler||');
    expect(decorationSpan(container, editorCss.EditorMarkdownCode)?.textContent).toBe('code');
    expect(decorationSpan(container, editorCss.EditorMarkdownSpoiler)?.textContent).toBe('spoiler');
    view.destroy();
  });

  it('produces no decorations for plain text', () => {
    const { container, view } = renderEditor('just plain text');
    expect(decorationSpan(container, editorCss.EditorMarkdownBold)).toBeUndefined();
    expect(decorationSpan(container, editorCss.EditorMarkdownToken)).toBeUndefined();
    view.destroy();
  });
});
