import { describe, expect, it, beforeAll, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  tokenizeMarkdown,
  markdownDecorations,
  markdownPreviewPlugin,
  setMarkdownPreviewDispatch,
  type MarkdownToken,
} from './markdown';
import { highlightCode } from '$plugins/arborium';
import { toProseMirrorDocument } from './prosemirrorSchema';
import type { EditorDocument } from './model';
import { BlockType } from './types';
import * as editorCss from './Editor.css';

vi.mock('$plugins/arborium', () => ({
  highlightCode:
    vi.fn<() => Promise<{ mode: 'highlighted' | 'plain'; html: string; language?: string }>>(),
}));

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

  it('styles double-backtick code and keeps single backticks inside literal', () => {
    const tokens = tokenizeMarkdown('use ``a `b` c`` here');
    const code = findToken(tokens, (t) => t.markdownCode);
    expect(code?.start).toBe(6);
    expect(code?.end).toBe(13);
    expect(tokens.every((t) => !(t.markdownItalic || t.markdownBold))).toBe(true);
    const openTicks = findToken(tokens, (t) => t.markdownToken && t.start === 4);
    expect(openTicks?.end).toBe(6);
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

  it('stacks nested formatting so inner spans keep the outer marks', () => {
    const tokens = tokenizeMarkdown('**||test||**');
    const stacked = findToken(tokens, (t) => t.markdownBold && t.markdownSpoiler);
    expect(stacked?.start).toBe(4);
    expect(stacked?.end).toBe(8);
    expect(tokenizeMarkdown('**||test||**').filter((t) => t.markdownToken)).toHaveLength(4);
  });

  it('stacks underline, bold, and italic from nested delimiters', () => {
    const tokens = tokenizeMarkdown('__**_test_**__');
    const stacked = findToken(
      tokens,
      (t) => t.markdownUnderline && t.markdownBold && t.markdownItalic
    );
    expect(stacked?.start).toBe(5);
    expect(stacked?.end).toBe(9);
  });

  it('supports single-underscore italics like the sent renderer', () => {
    const tokens = tokenizeMarkdown('_italic_');
    const italic = findToken(tokens, (t) => t.markdownItalic);
    expect(italic?.start).toBe(1);
    expect(italic?.end).toBe(7);
  });

  it('keeps intraword underscores literal like the sent renderer', () => {
    expect(tokenizeMarkdown('1_test_1').some((t) => t.markdownItalic)).toBe(false);
    expect(tokenizeMarkdown('foo_bar_baz').some((t) => t.markdownItalic)).toBe(false);
    expect(tokenizeMarkdown('x_foo_y_').some((t) => t.markdownItalic)).toBe(false);
    expect(tokenizeMarkdown('a_b_').some((t) => t.markdownItalic)).toBe(false);
    expect(tokenizeMarkdown('_ foo_').some((t) => t.markdownItalic)).toBe(false);
    expect(tokenizeMarkdown('foo_.bar_').some((t) => t.markdownItalic)).toBe(false);
  });

  it('skips an intraword underscore when looking for the closer', () => {
    const tokens = tokenizeMarkdown('_foo_bar_');
    const italics = tokens.filter((t) => t.markdownItalic);
    expect(italics.map((t) => t.start)).toEqual([1, 4]);
    expect(italics.map((t) => t.end)).toEqual([4, 8]);
  });

  it('applies the flanking rule to strong underscores too', () => {
    const tokens = tokenizeMarkdown('__bar__');
    expect(tokens.some((t) => t.markdownUnderline)).toBe(true);
    expect(tokenizeMarkdown('foo__bar__baz').some((t) => t.markdownUnderline)).toBe(false);
  });

  it('applies intraword emphasis to asterisks but not underscores', () => {
    const tokens = tokenizeMarkdown('foo*bar*baz');
    const italic = findToken(tokens, (t) => t.markdownItalic);
    expect(italic?.start).toBe(4);
    expect(italic?.end).toBe(7);
    expect(tokenizeMarkdown('foo_bar_baz').some((t) => t.markdownItalic)).toBe(false);
  });

  it('opens an underscore after punctuation like the sent renderer', () => {
    const tokens = tokenizeMarkdown('foo_._bar_');
    const italic = findToken(tokens, (t) => t.markdownItalic);
    expect(italic?.start).toBe(6);
    expect(italic?.end).toBe(9);
  });

  it('treats code spans as literal so markers inside do not style', () => {
    const tokens = tokenizeMarkdown('`**x**`');
    const code = findToken(tokens, (t) => t.markdownCode);
    expect(code?.start).toBe(1);
    expect(code?.end).toBe(6);
    expect(tokens.some((t) => t.markdownBold)).toBe(false);
  });

  it('stacks link styling with the enclosing formatting', () => {
    const tokens = tokenizeMarkdown('**[x](https://example.com)**');
    const stacked = findToken(tokens, (t) => t.markdownLink && t.markdownBold);
    expect(stacked?.start).toBe(3);
    expect(stacked?.end).toBe(4);
  });

  it('returns no tokens for plain text', () => {
    expect(tokenizeMarkdown('just plain text')).toHaveLength(0);
  });

  it('dims code fences and styles the block content', () => {
    const tokens = tokenizeMarkdown('```\ncode\n```');
    expect(
      tokens.map((t) => [t.start, t.end, t.markdownToken ?? false, t.markdownCodeBlock ?? false])
    ).toEqual([
      [0, 3, true, false],
      [4, 8, false, true],
      [9, 12, true, false],
    ]);
  });

  it('dims the language tag of an opening fence', () => {
    const tokens = tokenizeMarkdown('```ts\ncode\n```');
    const opening = tokens.find((t) => t.start === 0);
    expect(opening?.markdownToken).toBe(true);
    expect(opening?.end).toBe(5);
  });

  it('treats fenced content as literal', () => {
    const tokens = tokenizeMarkdown('```\n**bold**\nhttps://x.com\n# heading\n```');
    expect(tokens.some((t) => t.markdownBold)).toBe(false);
    expect(tokens.some((t) => t.markdownLink)).toBe(false);
    expect(tokens.every((t) => t.markdownToken || t.markdownCodeBlock)).toBe(true);
  });

  it('keeps inline formatting on both sides of a code block', () => {
    const tokens = tokenizeMarkdown('**a**\n```\ncode\n```\n**b**');
    const bolds = tokens.filter((t) => t.markdownBold);
    expect(bolds.map((t) => t.start)).toEqual([2, 21]);
  });

  it('returns no tokens for empty text', () => {
    expect(tokenizeMarkdown('')).toHaveLength(0);
  });

  it('styles heading content after the dimmed marker', () => {
    const tokens = tokenizeMarkdown('# hi');
    expectRange(tokens[0], 0, 2);
    expect(tokens[0]!.markdownToken).toBe(true);
    const heading = findToken(tokens, (t) => t.markdownHeading);
    expectRange(heading, 2, 4);
    expect(heading?.markdownHeading).toBe(1);
  });

  it('reports the hash count as the heading level', () => {
    expect(tokenizeMarkdown('### hi').find((t) => t.markdownHeading)?.markdownHeading).toBe(3);
    expect(tokenizeMarkdown('###### hi').find((t) => t.markdownHeading)?.markdownHeading).toBe(6);
    expect(tokenizeMarkdown('> hi').some((t) => t.markdownHeading)).toBe(false);
  });

  it('does not style heading content inside a code block', () => {
    const tokens = tokenizeMarkdown('```\n# not a heading\n```');
    expect(tokens.some((t) => t.markdownHeading)).toBe(false);
  });

  it('styles bare URLs like linkified messages', () => {
    const tokens = tokenizeMarkdown('see https://x.com now');
    const link = findToken(tokens, (t) => t.markdownLink);
    expectRange(link, 4, 17);
    expect(link?.url).toBe('https://x.com');
  });

  it('keeps underscores inside bare URLs', () => {
    const tokens = tokenizeMarkdown('https://example.com/foo_bar_baz');
    const link = findToken(tokens, (t) => t.markdownLink);
    expectRange(link, 0, 31);
    expect(link?.url).toBe('https://example.com/foo_bar_baz');
  });

  it('trims trailing punctuation from a bare URL with an underscore', () => {
    const link = findToken(tokenizeMarkdown('https://x.com/a_b,'), (t) => t.markdownLink);
    expectRange(link, 0, 17);
    expect(link?.url).toBe('https://x.com/a_b');
  });

  it('trims trailing punctuation from bare URLs', () => {
    const link = findToken(tokenizeMarkdown('https://x.com.'), (t) => t.markdownLink);
    expectRange(link, 0, 13);
    expect(link?.url).toBe('https://x.com');
  });

  it('does not treat mid-word schemes as URLs', () => {
    expect(tokenizeMarkdown('abchttps://x.com')).toHaveLength(0);
  });

  it('does not restyle a bare URL used as a link label', () => {
    const tokens = tokenizeMarkdown('[https://x.com](https://y.com)');
    const link = findToken(tokens, (t) => t.markdownLink);
    expect(link?.url).toBe('https://y.com');
  });

  it('keeps escaped delimiters literal', () => {
    const tokens = tokenizeMarkdown('test\\*beep\\*');
    expect(tokens.some((t) => t.markdownItalic)).toBe(false);
    expect(tokens.some((t) => t.markdownToken)).toBe(false);
  });

  it('keeps a leading escaped opener literal', () => {
    expect(tokenizeMarkdown('\\*beep\\*')).toHaveLength(0);
  });

  it('styles a real opener after an escaped backslash pair', () => {
    const tokens = tokenizeMarkdown('\\\\*beep*');
    const italic = findToken(tokens, (t) => t.markdownItalic);
    expect(italic?.start).toBe(3);
    expect(italic?.end).toBe(7);
  });

  it('keeps escaped delimiters literal inside styled spans', () => {
    const tokens = tokenizeMarkdown('**a\\*b**');
    expect(tokens.some((t) => t.markdownItalic)).toBe(false);
    expect(tokens.filter((t) => t.markdownBold)).toHaveLength(1);
    expect(tokens.find((t) => t.markdownBold)?.start).toBe(2);
    expect(tokens.find((t) => t.markdownBold)?.end).toBe(6);
  });

  it('does not treat an escaped character as a closer', () => {
    const tokens = tokenizeMarkdown('*a\\*b*');
    const italic = findToken(tokens, (t) => t.markdownItalic);
    expect(italic?.start).toBe(1);
    expect(italic?.end).toBe(5);
  });

  it('does not start a heading from an escaped hash', () => {
    expect(tokenizeMarkdown('\\# heading')).toHaveLength(0);
  });

  it('treats escapes as literal inside code spans', () => {
    const tokens = tokenizeMarkdown('`a\\*b`');
    const code = findToken(tokens, (t) => t.markdownCode);
    expect(code?.start).toBe(1);
    expect(code?.end).toBe(5);
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

const renderEditor = (texts: string[]) => {
  const editorDocument: EditorDocument = texts.map((text) => ({
    type: BlockType.Paragraph,
    children: [{ text }],
  }));
  const doc = toProseMirrorDocument(editorDocument);
  const state = EditorState.create({ doc, plugins: [markdownPreviewPlugin] });
  const container = document.createElement('div');
  const view = new EditorView(container, { state });
  return { container, view };
};

const decorationSpan = (container: HTMLElement, cls: string) =>
  Array.from(container.querySelectorAll('span')).find((span) => span.className.includes(cls));

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

  it('maps fenced code blocks onto their own doc positions', () => {
    const found = decorationFinder(['```', 'code', '```']);
    expect(found.map((d) => [d.from, d.to])).toEqual([
      [1, 4],
      [6, 10],
      [12, 15],
    ]);
  });

  it('renders fenced code content with the code block style', () => {
    const { container, view } = renderEditor(['```', 'code', '```']);
    expect(decorationSpan(container, editorCss.EditorMarkdownCodeBlock)?.textContent).toBe('code');
    view.destroy();
  });

  it('dims bold delimiters and bolds the content', () => {
    const { container, view } = renderEditor(['**hi**']);
    expect(decorationSpan(container, editorCss.EditorMarkdownBold)?.textContent).toBe('hi');
    expect(decorationSpan(container, editorCss.EditorMarkdownToken)?.textContent).toBe('**');
    view.destroy();
  });

  it('styles inline code and spoilers', () => {
    const { container, view } = renderEditor(['a `code` and ||spoiler||']);
    expect(decorationSpan(container, editorCss.EditorMarkdownCode)?.textContent).toBe('code');
    expect(decorationSpan(container, editorCss.EditorMarkdownSpoiler)?.textContent).toBe('spoiler');
    view.destroy();
  });

  it('renders stacked formatting on one span', () => {
    const { container, view } = renderEditor(['**||secret||**']);
    const span = decorationSpan(container, editorCss.EditorMarkdownBold);
    expect(span?.textContent).toBe('secret');
    expect(span?.className.includes(editorCss.EditorMarkdownSpoiler)).toBe(true);
    view.destroy();
  });

  it('marks link spans so underline-links can target them', () => {
    const { container, view } = renderEditor(['[hi](https://example.com)']);
    const span = decorationSpan(container, editorCss.EditorMarkdownLink);
    expect(span?.textContent).toBe('hi');
    expect(span?.hasAttribute('data-markdown-preview-link')).toBe(true);
    expect(span?.getAttribute('data-markdown-preview-href')).toBe('https://example.com');
    view.destroy();
  });

  it('styles bare URLs and keeps the URL as the href', () => {
    const { container, view } = renderEditor(['see https://x.com now']);
    const span = decorationSpan(container, editorCss.EditorMarkdownLink);
    expect(span?.textContent).toBe('https://x.com');
    expect(span?.getAttribute('data-markdown-preview-href')).toBe('https://x.com');
    view.destroy();
  });

  it('renders heading content with the per-level heading style', () => {
    const { container, view } = renderEditor(['# hi']);
    const span = decorationSpan(container, editorCss.EditorMarkdownHeading1);
    expect(span?.textContent).toBe('hi');
    view.destroy();
  });

  it('uses a smaller style for deeper heading levels', () => {
    const { container, view } = renderEditor(['### hi']);
    expect(decorationSpan(container, editorCss.EditorMarkdownHeading3)?.textContent).toBe('hi');
    expect(decorationSpan(container, editorCss.EditorMarkdownHeading1)).toBeUndefined();
    view.destroy();
  });

  it('keeps bold inside headings really bold, not just heading weight', () => {
    const { container, view } = renderEditor(['# **bold**']);
    const headingSpans = Array.from(container.querySelectorAll('span')).filter((s) =>
      s.className.includes(editorCss.EditorMarkdownHeading1)
    );
    expect(headingSpans.map((s) => s.textContent).join('')).toBe('**bold**');
    const bold = decorationSpan(container, editorCss.EditorMarkdownBold);
    expect(bold?.textContent).toBe('bold');
    // The bold content stacks both marks on one span; the bold class is declared
    // after the heading classes so its 700 weight wins the cascade (mirroring
    // the sent renderer's `<strong>` inside the heading).
    expect(bold?.className.includes(editorCss.EditorMarkdownHeading1)).toBe(true);
    view.destroy();
  });

  it('opens preview links on ctrl+click only', () => {
    const { container, view } = renderEditor(['[hi](https://example.com)']);
    const span = decorationSpan(container, editorCss.EditorMarkdownLink);
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    span?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(openSpy).not.toHaveBeenCalled();
    span?.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
    view.destroy();
  });

  it('produces no decorations for plain text', () => {
    const { container, view } = renderEditor(['just plain text']);
    expect(decorationSpan(container, editorCss.EditorMarkdownBold)).toBeUndefined();
    expect(decorationSpan(container, editorCss.EditorMarkdownToken)).toBeUndefined();
    view.destroy();
  });

  it('keeps heading styling on text nodes after an atom', () => {
    const editorDocument: EditorDocument = [
      {
        type: BlockType.Paragraph,
        children: [
          { text: '# hi ' },
          {
            type: BlockType.Mention,
            id: '@alice:server',
            highlight: false,
            name: 'Alice',
            children: [],
          },
          { text: 'there' },
        ],
      },
    ];
    const doc = toProseMirrorDocument(editorDocument);
    const state = EditorState.create({ doc, plugins: [markdownPreviewPlugin] });
    const container = document.createElement('div');
    const view = new EditorView(container, { state });
    const headings = Array.from(container.querySelectorAll('span')).filter((s) =>
      s.className.includes(editorCss.EditorMarkdownHeading1)
    );
    expect(headings.map((s) => s.textContent).join('')).toBe('hi there');
    view.destroy();
  });

  it('renders fenced code token colours once highlighting resolves', async () => {
    vi.mocked(highlightCode).mockResolvedValue({
      mode: 'highlighted',
      html: '<a-k>const</a-k> x',
      language: 'ts',
    });
    const editorDocument: EditorDocument = [
      { type: BlockType.Paragraph, children: [{ text: '```ts' }] },
      { type: BlockType.Paragraph, children: [{ text: 'const x' }] },
      { type: BlockType.Paragraph, children: [{ text: '```' }] },
    ];
    const doc = toProseMirrorDocument(editorDocument);
    const state = EditorState.create({ doc, plugins: [markdownPreviewPlugin] });
    const container = document.createElement('div');
    let view: EditorView;
    // The first decoration pass runs during construction, so register the
    // dispatch before the view exists for highlighting to schedule.
    setMarkdownPreviewDispatch(() => {
      view.dispatch(view.state.tr);
    });
    view = new EditorView(container, { state });
    await vi.waitFor(() => {
      expect(container.querySelector('a-k')).toBeTruthy();
    });
    const token = container.querySelector('a-k') as HTMLElement;
    expect(token.textContent).toBe('const');
    // Token elements keep the code-block tint via the overlapping base
    // decoration, while the CDN arborium CSS colours the element selector.
    expect(token.className.includes(editorCss.EditorMarkdownCodeBlock)).toBe(true);
    expect(vi.mocked(highlightCode)).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'const x', language: 'ts' })
    );
    view.destroy();
    setMarkdownPreviewDispatch(null);
  });

  it('asks arborium to detect the language of unlabelled fences', async () => {
    vi.mocked(highlightCode).mockResolvedValue({ mode: 'plain', html: 'let x' });
    const editorDocument: EditorDocument = [
      { type: BlockType.Paragraph, children: [{ text: '```' }] },
      { type: BlockType.Paragraph, children: [{ text: 'let x' }] },
      { type: BlockType.Paragraph, children: [{ text: '```' }] },
    ];
    const doc = toProseMirrorDocument(editorDocument);
    const state = EditorState.create({ doc, plugins: [markdownPreviewPlugin] });
    const container = document.createElement('div');
    let view: EditorView;
    setMarkdownPreviewDispatch(() => {
      view.dispatch(view.state.tr);
    });
    view = new EditorView(container, { state });
    await vi.waitFor(() => {
      expect(vi.mocked(highlightCode)).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'let x', language: null, allowDetect: true })
      );
    });
    view.destroy();
    setMarkdownPreviewDispatch(null);
  });

  it('decodes entities when mapping highlight html onto the line text', async () => {
    vi.mocked(highlightCode).mockResolvedValue({
      mode: 'highlighted',
      html: '<a-op>&lt;</a-op> 2',
      language: 'js',
    });
    const editorDocument: EditorDocument = [
      { type: BlockType.Paragraph, children: [{ text: '```js' }] },
      { type: BlockType.Paragraph, children: [{ text: '< 2' }] },
      { type: BlockType.Paragraph, children: [{ text: '```' }] },
    ];
    const doc = toProseMirrorDocument(editorDocument);
    const state = EditorState.create({ doc, plugins: [markdownPreviewPlugin] });
    const container = document.createElement('div');
    let view: EditorView;
    setMarkdownPreviewDispatch(() => {
      view.dispatch(view.state.tr);
    });
    view = new EditorView(container, { state });
    await vi.waitFor(() => {
      expect(container.querySelector('a-op')).toBeTruthy();
    });
    expect(container.querySelector('a-op')?.textContent).toBe('<');
    view.destroy();
    setMarkdownPreviewDispatch(null);
  });

  it('decodes escaped entities exactly once when mapping highlight html', async () => {
    // The line literally contains `&amp;<`; arborium escapes it to
    // `x &amp;amp;&lt; y`, which must map back onto those same literal chars.
    vi.mocked(highlightCode).mockResolvedValue({
      mode: 'highlighted',
      html: '<a-s>x &amp;amp;&lt;</a-s> y',
      language: 'js',
    });
    const editorDocument: EditorDocument = [
      { type: BlockType.Paragraph, children: [{ text: '```js' }] },
      { type: BlockType.Paragraph, children: [{ text: 'x &amp;< y' }] },
      { type: BlockType.Paragraph, children: [{ text: '```' }] },
    ];
    const doc = toProseMirrorDocument(editorDocument);
    const state = EditorState.create({ doc, plugins: [markdownPreviewPlugin] });
    const container = document.createElement('div');
    let view: EditorView;
    setMarkdownPreviewDispatch(() => {
      view.dispatch(view.state.tr);
    });
    view = new EditorView(container, { state });
    await vi.waitFor(() => {
      expect(container.querySelector('a-s')).toBeTruthy();
    });
    const token = container.querySelector('a-s') as HTMLElement;
    expect(token.textContent).toBe('x &amp;<');
    expect(token.className.includes(editorCss.EditorMarkdownCodeBlock)).toBe(true);
    view.destroy();
    setMarkdownPreviewDispatch(null);
  });

  describe('thematic breaks', () => {
    it('turns a standalone --- line into a divider block decoration', () => {
      expect(decorationFinder(['---'])).toHaveLength(1);
    });

    it('recognizes ***, ___, and spaced marker runs as dividers', () => {
      for (const line of ['***', '___', '- - -']) {
        expect(decorationFinder([line])).toHaveLength(1);
      }
    });

    it('does not treat mixed or suffixed marker runs as dividers', () => {
      for (const line of ['*-*', '---x', '--']) {
        const { container, view } = renderEditor([line]);
        const p = container.querySelector('p');
        expect(p?.className.includes(editorCss.EditorMarkdownDivider)).toBe(false);
        view.destroy();
      }
    });

    it('leaves --- inside a code fence literal', () => {
      const { container, view } = renderEditor(['```', '---', '```']);
      const ps = Array.from(container.querySelectorAll('p'));
      expect(ps[1]?.className.includes(editorCss.EditorMarkdownDivider)).toBe(false);
      expect(decorationSpan(container, editorCss.EditorMarkdownCodeBlock)?.textContent).toBe('---');
      view.destroy();
    });

    it('styles the divider paragraph in the DOM', () => {
      const { container, view } = renderEditor(['text', '---']);
      const ps = Array.from(container.querySelectorAll('p'));
      expect(ps[1]?.className.includes(editorCss.EditorMarkdownDivider)).toBe(true);
      expect(ps[0]?.className.includes(editorCss.EditorMarkdownDivider)).toBe(false);
      view.destroy();
    });
  });
});
