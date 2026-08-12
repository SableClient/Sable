import { Plugin } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import * as css from './Editor.css';

export type MarkdownLeafMarks = {
  markdownToken?: boolean;
  markdownBold?: boolean;
  markdownItalic?: boolean;
  markdownUnderline?: boolean;
  markdownStrikeThrough?: boolean;
  markdownCode?: boolean;
  markdownSpoiler?: boolean;
  markdownLink?: boolean;
};

export type MarkdownToken = {
  start: number;
  end: number;
} & MarkdownLeafMarks;

const token = (start: number, end: number, marks: MarkdownLeafMarks): MarkdownToken => ({
  start,
  end,
  ...marks,
});

// Line-start markers (headings, quotes, lists, code fences) are dimmed, not styled.
const BLOCK_PREFIX_PATTERNS: ReadonlyArray<{ re: RegExp; marks: MarkdownLeafMarks }> = [
  { re: /^#{1,6}\s+/, marks: { markdownToken: true } },
  { re: /^>\s/, marks: { markdownToken: true } },
  { re: /^[-+*]\s/, marks: { markdownToken: true } },
  { re: /^\d+\.\s/, marks: { markdownToken: true } },
  { re: /^```/, marks: { markdownToken: true } },
];

const collectBlockPrefixTokens = (text: string, tokens: MarkdownToken[]): void => {
  let lineStart = 0;
  while (lineStart < text.length) {
    const nl = text.indexOf('\n', lineStart);
    const lineEnd = nl < 0 ? text.length : nl;
    const line = text.slice(lineStart, lineEnd);
    for (const { re, marks } of BLOCK_PREFIX_PATTERNS) {
      const match = line.match(re);
      if (match) {
        tokens.push(token(lineStart, lineStart + match[0].length, marks));
        break;
      }
    }
    if (nl < 0) break;
    lineStart = nl + 1;
  }
};

// Inline delimiters. Order matters: longer delimiters before shorter ones so
// `**` is matched as bold before `*` could match as italic.
const INLINE_SPANS: ReadonlyArray<{
  open: string;
  close: string;
  inner: MarkdownLeafMarks;
}> = [
  { open: '**', close: '**', inner: { markdownBold: true } },
  { open: '~~', close: '~~', inner: { markdownStrikeThrough: true } },
  { open: '||', close: '||', inner: { markdownSpoiler: true } },
  { open: '__', close: '__', inner: { markdownUnderline: true } },
  { open: '`', close: '`', inner: { markdownCode: true } },
  { open: '*', close: '*', inner: { markdownItalic: true } },
];

const matchLinkSpan = (text: string): MarkdownToken[] | null => {
  if (!text.startsWith('[')) return null;
  const closeBracket = text.indexOf(']');
  if (closeBracket <= 1) return null;
  if (text[closeBracket + 1] !== '(') return null;
  const closeParen = text.indexOf(')', closeBracket + 2);
  if (closeParen < 0) return null;
  const label = text.slice(1, closeBracket);
  const url = text.slice(closeBracket + 2, closeParen);
  if (!label.trim() || !url.trim()) return null;
  return [
    token(0, 1, { markdownToken: true }),
    token(1, closeBracket, { markdownLink: true }),
    token(closeBracket, closeParen + 1, { markdownToken: true }),
  ];
};

const matchInlineSpan = (text: string): MarkdownToken[] | null => {
  const linkTokens = matchLinkSpan(text);
  if (linkTokens) return linkTokens;

  for (const span of INLINE_SPANS) {
    if (!text.startsWith(span.open)) continue;
    const closeIdx = text.indexOf(span.close, span.open.length);
    if (closeIdx <= span.open.length) continue;
    const content = text.slice(span.open.length, closeIdx);
    if (!content.trim()) continue;
    const contentStart = span.open.length;
    const contentEnd = closeIdx;
    return [
      token(0, contentStart, { markdownToken: true }),
      token(contentStart, contentEnd, span.inner),
      token(contentEnd, contentEnd + span.close.length, { markdownToken: true }),
    ];
  }
  return null;
};

/**
 * Scans a text node and returns the markdown spans that should be rendered
 * with formatting (the content) or dimmed (the syntax characters).
 */
export const tokenizeMarkdown = (text: string): MarkdownToken[] => {
  if (!text) return [];
  const tokens: MarkdownToken[] = [];
  collectBlockPrefixTokens(text, tokens);

  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const spanTokens = matchInlineSpan(rest);
    if (spanTokens) {
      const consumed = spanTokens[spanTokens.length - 1]!.end;
      spanTokens.forEach((t) => tokens.push({ ...t, start: t.start + i, end: t.end + i }));
      i += consumed;
    } else {
      i += 1;
    }
  }
  return tokens;
};

const STYLED_TOKEN_CLASSES: ReadonlyArray<[keyof MarkdownLeafMarks, string]> = [
  ['markdownBold', css.EditorMarkdownBold],
  ['markdownItalic', css.EditorMarkdownItalic],
  ['markdownUnderline', css.EditorMarkdownUnderline],
  ['markdownStrikeThrough', css.EditorMarkdownStrikeThrough],
  ['markdownCode', css.EditorMarkdownCode],
  ['markdownSpoiler', css.EditorMarkdownSpoiler],
  ['markdownLink', css.EditorMarkdownLink],
];

const tokenToDecoration = (nodeStart: number, t: MarkdownToken): Decoration | null => {
  if (t.markdownToken) {
    return Decoration.inline(nodeStart + t.start, nodeStart + t.end, {
      class: css.EditorMarkdownToken,
    });
  }
  for (const [mark, className] of STYLED_TOKEN_CLASSES) {
    if (t[mark]) {
      return Decoration.inline(nodeStart + t.start, nodeStart + t.end, { class: className });
    }
  }
  return null;
};

export const markdownDecorations = (state: EditorState): DecorationSet => {
  const decorations: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    for (const t of tokenizeMarkdown(node.text)) {
      const decoration = tokenToDecoration(pos, t);
      if (decoration) decorations.push(decoration);
    }
    return true;
  });
  return DecorationSet.create(state.doc, decorations);
};

// Render-time markdown preview: dims syntax characters and styles content via
// decorations, so the document and serialized output stay untouched.
export const markdownPreviewPlugin = new Plugin({
  props: {
    decorations: (state) => markdownDecorations(state),
  },
});
