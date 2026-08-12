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
// `**` is matched as bold before `*` could match as italic, and `__` before `_`.
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
  { open: '_', close: '_', inner: { markdownItalic: true } },
];

type InlineMatch = {
  contentStart: number;
  contentEnd: number;
  inner: MarkdownLeafMarks;
  recurse: boolean;
  totalLength: number;
};

const matchLinkSpan = (text: string): InlineMatch | null => {
  if (!text.startsWith('[')) return null;
  const closeBracket = text.indexOf(']');
  if (closeBracket <= 1) return null;
  if (text[closeBracket + 1] !== '(') return null;
  const closeParen = text.indexOf(')', closeBracket + 2);
  if (closeParen < 0) return null;
  const label = text.slice(1, closeBracket);
  const url = text.slice(closeBracket + 2, closeParen);
  if (!label.trim() || !url.trim()) return null;
  return {
    contentStart: 1,
    contentEnd: closeBracket,
    inner: { markdownLink: true },
    recurse: true,
    totalLength: closeParen + 1,
  };
};

const matchInlineSpan = (text: string): InlineMatch | null => {
  for (const span of INLINE_SPANS) {
    if (!text.startsWith(span.open)) continue;
    const closeIdx = text.indexOf(span.close, span.open.length);
    if (closeIdx <= span.open.length) continue;
    const content = text.slice(span.open.length, closeIdx);
    if (!content.trim()) continue;
    return {
      contentStart: span.open.length,
      contentEnd: closeIdx,
      inner: span.inner,
      // Code spans are literal: markers inside them are not formatting.
      recurse: !span.inner.markdownCode,
      totalLength: closeIdx + span.close.length,
    };
  }
  return null;
};

const INLINE_OPENERS = ['**', '~~', '||', '__', '`', '*', '_', '['] as const;

const hasMarks = (marks: MarkdownLeafMarks): boolean =>
  Object.values(marks).some((value) => value === true);

// Scans a range and, for each matched span, dims the delimiters and recurses
// into the content with the enclosing marks inherited, so `**||x||**` styles
// the text as both bold and spoiler instead of stopping at the outer span.
// Unstyled runs inside a styled span keep the enclosing marks; at the top
// level (no marks) they stay plain and produce no decoration.
const scanInlineRange = (
  text: string,
  from: number,
  to: number,
  marks: MarkdownLeafMarks,
  tokens: MarkdownToken[]
): void => {
  let i = from;
  while (i < to) {
    const rest = text.slice(i, to);
    const match = matchLinkSpan(rest) ?? matchInlineSpan(rest);
    if (!match) {
      let next = -1;
      for (const opener of INLINE_OPENERS) {
        const idx = text.indexOf(opener, i + 1);
        if (idx >= 0 && idx < to && (next === -1 || idx < next)) next = idx;
      }
      const runEnd = next < 0 ? to : next;
      if (hasMarks(marks)) tokens.push(token(i, runEnd, marks));
      i = runEnd;
      continue;
    }
    const contentStart = i + match.contentStart;
    const contentEnd = i + match.contentEnd;
    const closeEnd = i + match.totalLength;
    tokens.push(token(i, contentStart, { markdownToken: true }));
    const inner: MarkdownLeafMarks = { ...marks, ...match.inner };
    if (match.recurse) {
      scanInlineRange(text, contentStart, contentEnd, inner, tokens);
    } else {
      tokens.push(token(contentStart, contentEnd, inner));
    }
    tokens.push(token(contentEnd, closeEnd, { markdownToken: true }));
    i = closeEnd;
  }
};

/**
 * Scans a text node and returns the markdown spans that should be rendered
 * with formatting (the content) or dimmed (the syntax characters).
 */
export const tokenizeMarkdown = (text: string): MarkdownToken[] => {
  if (!text) return [];
  const tokens: MarkdownToken[] = [];
  collectBlockPrefixTokens(text, tokens);
  scanInlineRange(text, 0, text.length, {}, tokens);
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
  const classes = STYLED_TOKEN_CLASSES.filter(([mark]) => t[mark]).map(
    ([, className]) => className
  );
  if (!classes.length) return null;
  return Decoration.inline(nodeStart + t.start, nodeStart + t.end, {
    class: classes.join(' '),
  });
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
