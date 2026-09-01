import { Plugin } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { highlightCode } from '$plugins/arborium';
import * as css from './Editor.css';

export type MarkdownLeafMarks = {
  markdownToken?: boolean;
  markdownBold?: boolean;
  markdownItalic?: boolean;
  markdownUnderline?: boolean;
  markdownStrikeThrough?: boolean;
  markdownCode?: boolean;
  markdownCodeBlock?: boolean;
  markdownHeading?: number;
  markdownSpoiler?: boolean;
  markdownLink?: boolean;
  url?: string;
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

// Line-start markers (headings, quotes, lists) are dimmed; heading content gets
// its own style per level. Code fences are handled at the block level.
const BLOCK_PREFIX_PATTERNS: ReadonlyArray<{ re: RegExp; heading: boolean }> = [
  { re: /^(#{1,6})\s+/, heading: true },
  { re: /^>\s/, heading: false },
  { re: /^[-+*]\s/, heading: false },
  { re: /^\d+\.\s/, heading: false },
];

// A `---`/`***`/`___` line is a divider (marked renders it as an <hr>). We
// never read `text\n---` as a setext h2, so typing a separator can't re-style
// the line above.
const THEMATIC_BREAK_RE = /^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

const matchBlockPrefix = (line: string): { length: number; headingLevel: number } | null => {
  for (const { re, heading } of BLOCK_PREFIX_PATTERNS) {
    const match = line.match(re);
    if (!match) continue;
    if (heading) {
      const hashes = match[1] ?? '';
      return { length: match[0].length, headingLevel: hashes.length || 1 };
    }
    return { length: match[0].length, headingLevel: 0 };
  }
  return null;
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
  { open: '``', close: '``', inner: { markdownCode: true } },
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
  let closeBracket = text.indexOf(']');
  while (closeBracket > 0 && isEscaped(text, closeBracket)) {
    closeBracket = text.indexOf(']', closeBracket + 1);
  }
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
    inner: { markdownLink: true, url },
    recurse: true,
    totalLength: closeParen + 1,
  };
};

// CommonMark's underscore rule: `_` only opens/closes emphasis when flanked by
// whitespace or punctuation, so `1_test_1` stays literal while `_bar_`
// emphasises. `*` has no such restriction (`foo*bar*baz` emphasises `bar`).
// Line/paragraph edges count as whitespace, like the reference implementations.
const isWhitespace = (ch: string): boolean => /\s/.test(ch);
const isPunctuation = (ch: string): boolean => /[\p{P}]/u.test(ch);
const charBefore = (text: string, idx: number): string => text[idx - 1] ?? '\n';
const charAfter = (text: string, idx: number, length: number): string => text[idx + length] ?? '\n';

const canOpenUnderscore = (text: string, idx: number, length: number): boolean => {
  const before = charBefore(text, idx);
  const after = charAfter(text, idx, length);
  const leftFlanking =
    !isWhitespace(after) &&
    (!isPunctuation(after) || isWhitespace(before) || isPunctuation(before));
  return leftFlanking && (isWhitespace(before) || isPunctuation(before) || isPunctuation(after));
};

const canCloseUnderscore = (text: string, idx: number, length: number): boolean => {
  const before = charBefore(text, idx);
  const after = charAfter(text, idx, length);
  const rightFlanking =
    !isWhitespace(before) &&
    (!isPunctuation(before) || isWhitespace(after) || isPunctuation(after));
  return rightFlanking && (isWhitespace(after) || isPunctuation(after) || isPunctuation(before));
};

const matchInlineSpan = (text: string, from: number, to: number): InlineMatch | null => {
  const rest = text.slice(from, to);
  for (const span of INLINE_SPANS) {
    if (!rest.startsWith(span.open)) continue;
    const isUnderscoreDelimiter = span.open[0] === '_';
    if (isUnderscoreDelimiter && !canOpenUnderscore(text, from, span.open.length)) continue;
    let closeIdx = text.indexOf(span.close, from + span.open.length);
    const isCloser = (idx: number): boolean =>
      !isEscaped(text, idx) &&
      (!isUnderscoreDelimiter || canCloseUnderscore(text, idx, span.close.length));
    while (closeIdx >= 0 && closeIdx < to && !isCloser(closeIdx)) {
      closeIdx = text.indexOf(span.close, closeIdx + 1);
    }
    if (closeIdx < 0 || closeIdx >= to) continue;
    const relClose = closeIdx - from;
    if (relClose <= span.open.length) continue;
    const content = text.slice(from + span.open.length, closeIdx);
    if (!content.trim()) continue;
    return {
      contentStart: span.open.length,
      contentEnd: relClose,
      inner: span.inner,
      // Code spans are literal: markers inside them are not formatting.
      recurse: !span.inner.markdownCode,
      totalLength: relClose + span.close.length,
    };
  }
  return null;
};

// Bare URLs (schemes Sable linkifies when sending) get the same link styling as
// [label](url); a non-word boundary keeps `abchttps://x` from matching mid-word.
// `_` is kept because it's a legal URL path character (the sent renderer links
// `https://x.com/foo_bar` whole).
const BARE_URL_RE = /(?<![\w.])(?:https?|ftp|mailto|magnet|matrix):\/?\/?[^\s()[\]{}<>`|*~]+/i;

const matchBareUrl = (text: string): InlineMatch | null => {
  const match = BARE_URL_RE.exec(text);
  if (!match || match.index !== 0) return null;
  const url = match[0].replace(/[.,;:!?)]+$/, '');
  if (!url) return null;
  return {
    contentStart: 0,
    contentEnd: url.length,
    inner: { markdownLink: true, url },
    recurse: false,
    totalLength: url.length,
  };
};

const INLINE_OPENERS = ['``', '**', '~~', '||', '__', '`', '*', '_', '['] as const;

const hasMarks = (marks: MarkdownLeafMarks): boolean => Object.values(marks).some(Boolean);

// A backslash escapes the next character (odd run of backslashes), keeping a
// would-be delimiter literal — `test\*beep\*` renders as plain text.
const isEscaped = (text: string, idx: number): boolean => {
  let backslashes = 0;
  for (let j = idx - 1; j >= 0 && text[j] === '\\'; j -= 1) backslashes += 1;
  return backslashes % 2 === 1;
};

// Dims the delimiters of each matched span and recurses into the content with
// the enclosing marks inherited, so `**||x||**` styles both bold and spoiler.
// Unstyled runs keep the enclosing marks; at the top level they stay plain.
const scanInline = (
  text: string,
  from: number,
  to: number,
  marks: MarkdownLeafMarks,
  tokens: MarkdownToken[]
): void => {
  let i = from;
  while (i < to) {
    const rest = text.slice(i, to);
    // A bare URL inside a [label](url) is not its own link: the label belongs
    // to the marked link, so its URL is skipped there.
    const match =
      matchLinkSpan(rest) ??
      (marks.markdownLink ? null : matchBareUrl(rest)) ??
      matchInlineSpan(text, i, to);
    if (!match) {
      // A backslash keeps the next character literal.
      if (text[i] === '\\' && i + 1 < to) {
        if (hasMarks(marks)) tokens.push(token(i, i + 2, marks));
        i += 2;
        continue;
      }
      let next = -1;
      for (const opener of INLINE_OPENERS) {
        let idx = text.indexOf(opener, i + 1);
        while (idx >= 0 && idx < to && isEscaped(text, idx)) {
          idx = text.indexOf(opener, idx + 1);
        }
        if (idx >= 0 && idx < to && (next === -1 || idx < next)) next = idx;
      }
      if (!marks.markdownLink) {
        const urlMatch = BARE_URL_RE.exec(text.slice(i + 1, to));
        if (urlMatch) {
          const urlStart = i + 1 + urlMatch.index;
          if (urlStart < to && !isEscaped(text, urlStart) && (next === -1 || urlStart < next)) {
            next = urlStart;
          }
        }
      }
      const runEnd = next < 0 ? to : next;
      if (hasMarks(marks)) tokens.push(token(i, runEnd, marks));
      i = runEnd;
      continue;
    }
    const contentStart = i + match.contentStart;
    const contentEnd = i + match.contentEnd;
    const closeEnd = i + match.totalLength;
    if (contentStart > i) tokens.push(token(i, contentStart, { markdownToken: true }));
    const inner: MarkdownLeafMarks = { ...marks, ...match.inner };
    if (match.recurse) {
      scanInline(text, contentStart, contentEnd, inner, tokens);
    } else {
      tokens.push(token(contentStart, contentEnd, inner));
    }
    if (contentEnd < closeEnd) tokens.push(token(contentEnd, closeEnd, { markdownToken: true }));
    i = closeEnd;
  }
};

// Tokenizes a single line. atLineStart controls whether a block marker (which
// can only begin a line) is recognized — the composer stores one line per
// paragraph, but a paragraph's later text nodes sit mid-line.
const tokenizeLine = (text: string, atLineStart: boolean): MarkdownToken[] => {
  const tokens: MarkdownToken[] = [];
  const prefix = atLineStart ? matchBlockPrefix(text) : null;
  if (prefix) {
    tokens.push(token(0, prefix.length, { markdownToken: true }));
    if (prefix.headingLevel > 0) {
      // The heading styles the whole content range; inner formatting spans
      // render on top and can override the weight (bold stays really bold).
      tokens.push(token(prefix.length, text.length, { markdownHeading: prefix.headingLevel }));
      scanInline(text, prefix.length, text.length, {}, tokens);
    } else {
      scanInline(text, prefix.length, text.length, {}, tokens);
    }
  } else {
    scanInline(text, 0, text.length, {}, tokens);
  }
  return tokens;
};

/**
 * Scans a text node and returns the markdown spans that should be rendered
 * with formatting (the content) or dimmed (the syntax characters). Fenced
 * code blocks are tracked across lines, matching the composer's layout of
 * one paragraph per line.
 */
export const tokenizeMarkdown = (text: string): MarkdownToken[] => {
  if (!text) return [];
  const tokens: MarkdownToken[] = [];
  let inCode = false;
  let offset = 0;
  while (true) {
    const nl = text.indexOf('\n', offset);
    const lineEnd = nl < 0 ? text.length : nl;
    const line = text.slice(offset, lineEnd);
    if (line.startsWith('```')) {
      const tag = line.match(/^```\S*/)?.[0].length ?? 3;
      tokens.push(token(offset, offset + tag, { markdownToken: true }));
      inCode = !inCode;
    } else if (inCode) {
      tokens.push(token(offset, lineEnd, { markdownCodeBlock: true }));
    } else {
      for (const t of tokenizeLine(line, true)) {
        tokens.push({ ...t, start: t.start + offset, end: t.end + offset });
      }
    }
    if (nl < 0) break;
    offset = nl + 1;
  }
  return tokens;
};

const STYLED_TOKEN_CLASSES: ReadonlyArray<[keyof MarkdownLeafMarks, string]> = [
  ['markdownBold', css.EditorMarkdownBold],
  ['markdownItalic', css.EditorMarkdownItalic],
  ['markdownUnderline', css.EditorMarkdownUnderline],
  ['markdownStrikeThrough', css.EditorMarkdownStrikeThrough],
  ['markdownCode', css.EditorMarkdownCode],
  ['markdownCodeBlock', css.EditorMarkdownCodeBlock],
  ['markdownSpoiler', css.EditorMarkdownSpoiler],
  ['markdownLink', css.EditorMarkdownLink],
];

// Matches the sent renderer, which maps `#`…`######` onto folds' H2/H3/H4
// heading sizes (h4 shares H4, like the message parser's h1→H2 … h6→H6).
const HEADING_CLASSES: ReadonlyArray<string> = [
  css.EditorMarkdownHeading1,
  css.EditorMarkdownHeading2,
  css.EditorMarkdownHeading3,
  css.EditorMarkdownHeading4,
  css.EditorMarkdownHeading5,
  css.EditorMarkdownHeading6,
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
  if (t.markdownHeading) {
    const level = Math.min(Math.max(t.markdownHeading, 1), 6);
    classes.push(HEADING_CLASSES[level - 1]!);
  }
  if (!classes.length) return null;
  // The link marker lets the global force-underline-links rule (index.css)
  // underline preview links only when that setting is on; the href powers
  // Ctrl+click-to-open in the plugin's click handler.
  return Decoration.inline(nodeStart + t.start, nodeStart + t.end, {
    class: classes.join(' '),
    ...(t.markdownLink
      ? {
          'data-markdown-preview-link': '',
          'data-markdown-preview-href': t.url ?? '',
        }
      : {}),
  });
};

// A paragraph can hold several text nodes (atoms like mentions split them), so
// tokens from the paragraph's full text are clipped onto each text child. The
// paragraph sits at pos with its first child at pos + 1.
type TextChild = { pos: number; start: number; end: number };

const textChildren = (node: ProseMirrorNode, pos: number): TextChild[] => {
  const children: TextChild[] = [];
  let start = 0;
  node.forEach((child, childOffset) => {
    if (child.isText && child.text) {
      children.push({ pos: pos + childOffset + 1, start, end: start + child.text.length });
      start += child.text.length;
    }
  });
  return children;
};

const lineTokensToDecorations = (
  children: TextChild[],
  tokens: MarkdownToken[],
  decorations: Decoration[]
): void => {
  let tokenIdx = 0;
  for (const child of children) {
    while (tokenIdx < tokens.length && tokens[tokenIdx]!.end <= child.start) tokenIdx += 1;
    for (let t = tokenIdx; t < tokens.length && tokens[t]!.start < child.end; t += 1) {
      const lineToken = tokens[t]!;
      const start = Math.max(lineToken.start, child.start);
      const end = Math.min(lineToken.end, child.end);
      if (end <= start) continue;
      const decoration = tokenToDecoration(child.pos, {
        ...lineToken,
        start: start - child.start,
        end: end - child.start,
      });
      if (decoration) decorations.push(decoration);
    }
  }
};

const highlightCache = new Map<
  string,
  ReadonlyArray<{ start: number; end: number; cls: string }> | null
>();
const inFlightHighlights = new Set<string>();
let previewDispatch: (() => void) | null = null;

/** The composer has no view handle inside the decoration pass, so the controller
 * hands the plugin a callback that dispatches an empty transaction (re-running
 * decorations) once queued syntax highlighting resolves. */
export const setMarkdownPreviewDispatch = (dispatch: (() => void) | null): void => {
  previewDispatch = dispatch;
};

const highlightKey = (lang: string | null, line: string): string => `${lang ?? ''}\u0000${line}`;

const TOKEN_ELEMENT_RE = /^a-[a-z]{1,2}$/;

// Arborium returns a line highlighted as flat token elements (e.g.
// `<a-k>const</a-k>`); parse it with the platform HTML parser so entity
// decoding is native, then turn each token's text into a line-relative range
// carrying the token's element name so the decoration pass can render the
// real elements the CDN arborium CSS styles.
const parseHighlightHtml = (
  html: string
): ReadonlyArray<{ start: number; end: number; cls: string }> => {
  const segments: { start: number; end: number; cls: string }[] = [];
  let offset = 0;
  const visit = (node: Node, cls: string | undefined): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text && cls !== undefined)
        segments.push({ start: offset, end: offset + text.length, cls });
      offset += text.length;
      return;
    }
    const childCls =
      node instanceof Element && TOKEN_ELEMENT_RE.test(node.tagName.toLowerCase())
        ? node.tagName.toLowerCase()
        : cls;
    for (const child of node.childNodes) visit(child, childCls);
  };
  visit(new DOMParser().parseFromString(html, 'text/html').body, undefined);
  return segments;
};

const MAX_HIGHLIGHT_LINE_LENGTH = 400;
const MAX_HIGHLIGHT_CACHE_ENTRIES = 200;

// Highlights the fenced lines that the decoration pass has not cached yet, then
// dispatches an empty transaction so the view re-runs decorations with the new
// token colours. Plain (unhighlightable) results are cached too, so a lang-less
// fence is not re-detected on every keystroke.
const scheduleHighlights = (entries: Array<{ lang: string | null; line: string }>): void => {
  const toRun = entries.filter(({ lang, line }) => {
    if (!line || line.length > MAX_HIGHLIGHT_LINE_LENGTH) return false;
    const key = highlightKey(lang, line);
    return !highlightCache.has(key) && !inFlightHighlights.has(key);
  });
  if (!toRun.length) return;
  for (const { lang, line } of toRun) inFlightHighlights.add(highlightKey(lang, line));
  void Promise.all(
    toRun.map(({ lang, line }) =>
      highlightCode({ code: line, language: lang, allowDetect: !lang }).then((result) => ({
        lang,
        line,
        result,
      }))
    )
  ).then((results) => {
    let stored = false;
    for (const { lang, line, result } of results) {
      const key = highlightKey(lang, line);
      inFlightHighlights.delete(key);
      highlightCache.set(
        key,
        result.mode === 'highlighted' ? parseHighlightHtml(result.html) : null
      );
      stored = true;
    }
    while (highlightCache.size > MAX_HIGHLIGHT_CACHE_ENTRIES) {
      const oldest = highlightCache.keys().next().value;
      if (oldest === undefined) break;
      highlightCache.delete(oldest);
    }
    if (stored) previewDispatch?.();
  });
};

const decorateCodeLine = (
  children: TextChild[],
  lang: string | null,
  line: string,
  decorations: Decoration[],
  pending: Array<{ lang: string | null; line: string }>
): void => {
  for (const child of children) {
    decorations.push(
      Decoration.inline(child.pos, child.pos + (child.end - child.start), {
        class: css.EditorMarkdownCodeBlock,
      })
    );
  }
  const cached = highlightCache.get(highlightKey(lang, line));
  if (cached) {
    for (const segment of cached) {
      for (const child of children) {
        if (segment.end <= child.start || segment.start >= child.end) continue;
        const start = Math.max(segment.start, child.start) - child.start;
        const end = Math.min(segment.end, child.end) - child.start;
        if (end > start) {
          decorations.push(
            Decoration.inline(child.pos + start, child.pos + end, { nodeName: segment.cls })
          );
        }
      }
    }
  } else {
    pending.push({ lang, line });
  }
};

/** The composer stores one line per paragraph (insertNewline splits the block),
 * so fenced code blocks span several paragraphs. Walk them in order and track
 * whether the current paragraph is inside a fence. */
export const markdownDecorations = (state: EditorState): DecorationSet => {
  const decorations: Decoration[] = [];
  const pending: Array<{ lang: string | null; line: string }> = [];
  let inCode = false;
  let currentLang: string | null = null;
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      const line = node.textContent;
      const children = textChildren(node, pos);
      if (line.startsWith('```')) {
        const tag = line.match(/^```\S*/)?.[0] ?? '```';
        inCode = !inCode;
        currentLang = tag.length > 3 ? tag.slice(3) : null;
        let remaining = tag.length;
        for (const child of children) {
          const length = Math.min(remaining, child.end - child.start);
          if (length > 0) {
            decorations.push(
              Decoration.inline(child.pos, child.pos + length, { class: css.EditorMarkdownToken })
            );
            remaining -= length;
          }
          if (remaining <= 0) break;
        }
      } else if (inCode) {
        decorateCodeLine(children, currentLang, line, decorations, pending);
      } else if (THEMATIC_BREAK_RE.test(line)) {
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, { class: css.EditorMarkdownDivider })
        );
      } else {
        lineTokensToDecorations(children, tokenizeLine(line, true), decorations);
      }
      return true;
    }
    return true;
  });
  if (pending.length && previewDispatch) scheduleHighlights(pending);
  return DecorationSet.create(state.doc, decorations);
};

/**
 * Render-time markdown preview: dims syntax characters and styles content via
 * decorations, so the document and serialized output stay untouched.
 */
export const markdownPreviewPlugin = new Plugin({
  props: {
    decorations: (state) => markdownDecorations(state),
    // Preview links open on Ctrl/Cmd+click only, so a stray click never
    // navigates away while editing.
    handleDOMEvents: {
      click: (view, event) => {
        if (!event.ctrlKey && !event.metaKey) return false;
        const href = (event.target as HTMLElement | null)
          ?.closest('[data-markdown-preview-link]')
          ?.getAttribute('data-markdown-preview-href');
        if (!href) return false;
        window.open(href, '_blank', 'noopener,noreferrer');
        return true;
      },
    },
  },
});
