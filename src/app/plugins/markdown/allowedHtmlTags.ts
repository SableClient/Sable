import { getMarkdownCodeSpanRanges } from '$components/editor/utils';

export const MARKDOWN_ALLOWED_HTML_TAGS = new Set([
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'details',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'li',
  'mx-reply',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'sub',
  'summary',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);

/** Void elements that do not require a separate closing tag. */
export const VOID_HTML_TAGS = new Set(['br', 'hr', 'img']);

export const isAllowedHtmlTag = (tagName: string): boolean =>
  MARKDOWN_ALLOWED_HTML_TAGS.has(tagName.toLowerCase());

/** Matches HTML open/close/self-closing tags (not `<https://…>` preview suppressors). */
const RAW_HTML_TAG = /<\/?([a-zA-Z][\da-zA-Z-]*)(?:\s(?:[^>"']|"[^"]*"|'[^']*')*)?\s*\/?>/g;

const CODE_PLACEHOLDER_START = '\uE000';
const CODE_PLACEHOLDER_END = '\uE001';

type HtmlTagToken = {
  index: number;
  length: number;
  raw: string;
  tagName: string;
  kind: 'open' | 'close' | 'void';
};

const entityEscapeTag = (raw: string): string =>
  raw.replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** True when an odd number of `\` immediately precedes `index` (CommonMark escape). */
const isMarkdownEscapedAt = (input: string, index: number): boolean => {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && input[i] === '\\'; i -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
};

const isVoidHtmlTag = (tagName: string, raw: string): boolean =>
  VOID_HTML_TAGS.has(tagName.toLowerCase()) || /\/>\s*$/.test(raw);

const scanHtmlTags = (input: string): HtmlTagToken[] => {
  const tokens: HtmlTagToken[] = [];
  const re = new RegExp(RAW_HTML_TAG.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(input)) !== null) {
    const raw = match[0];
    const tagName = match[1]!.toLowerCase();
    const isClose = raw.startsWith('</');
    const kind: HtmlTagToken['kind'] = isClose
      ? 'close'
      : isVoidHtmlTag(tagName, raw)
        ? 'void'
        : 'open';

    tokens.push({
      index: match.index,
      length: raw.length,
      raw,
      tagName,
      kind,
    });
  }

  return tokens;
};

const collectTagsToEscape = (input: string, tokens: HtmlTagToken[]): Set<number> => {
  const escapeAt = new Set<number>();
  const openStack: { tagName: string; index: number }[] = [];

  for (const token of tokens) {
    if (isMarkdownEscapedAt(input, token.index)) {
      continue;
    }

    if (!isAllowedHtmlTag(token.tagName)) {
      escapeAt.add(token.index);
      continue;
    }

    if (token.kind === 'void') {
      continue;
    }

    if (token.kind === 'open') {
      openStack.push({ tagName: token.tagName, index: token.index });
      continue;
    }

    const top = openStack[openStack.length - 1];
    if (top && top.tagName === token.tagName) {
      openStack.pop();
    } else {
      escapeAt.add(token.index);
    }
  }

  for (const { index } of openStack) {
    escapeAt.add(index);
  }

  return escapeAt;
};

const applyTagEscapes = (input: string, tokens: HtmlTagToken[], escapeAt: Set<number>): string => {
  if (escapeAt.size === 0) return input;

  let out = '';
  let cursor = 0;

  for (const token of tokens) {
    out += input.slice(cursor, token.index);
    out += escapeAt.has(token.index) ? entityEscapeTag(token.raw) : token.raw;
    cursor = token.index + token.length;
  }

  return out + input.slice(cursor);
};

const maskMarkdownVerbatimRegions = (text: string): { masked: string; chunks: string[] } => {
  const chunks: string[] = [];
  const placeholder = (index: number) =>
    `${CODE_PLACEHOLDER_START}CODE${index}${CODE_PLACEHOLDER_END}`;

  let masked = text.replace(/```[^\n`]*\n[\s\S]*?```/g, (chunk) => {
    chunks.push(chunk);
    return placeholder(chunks.length - 1);
  });
  masked = masked.replace(/```[\s\S]*?```/g, (chunk) => {
    chunks.push(chunk);
    return placeholder(chunks.length - 1);
  });

  const inlineRanges = getMarkdownCodeSpanRanges(masked);
  for (let i = inlineRanges.length - 1; i >= 0; i -= 1) {
    const [start, end] = inlineRanges[i]!;
    const chunk = masked.slice(start, end);
    chunks.push(chunk);
    masked = `${masked.slice(0, start)}${placeholder(chunks.length - 1)}${masked.slice(end)}`;
  }

  return { masked, chunks };
};

const unmaskMarkdownVerbatimRegions = (text: string, chunks: string[]): string =>
  text.replace(
    new RegExp(`${CODE_PLACEHOLDER_START}CODE(\\d+)${CODE_PLACEHOLDER_END}`, 'g'),
    (_, index) => chunks[parseInt(index, 10)] ?? ''
  );

const escapeHtmlTagsInMarkdown = (input: string): string => {
  const tokens = scanHtmlTags(input);
  if (tokens.length === 0) return input;
  const escapeAt = collectTagsToEscape(input, tokens);
  return applyTagEscapes(input, tokens, escapeAt);
};

/**
 * Entity-escapes HTML tags that are not on the allowlist or are structurally invalid
 * (e.g. missing a required closing tag, or a mismatched close) so marked/DOMPurify never
 * interpret them as HTML.
 */
export const escapeNonAllowlistedHtmlTags = (input: string): string => {
  const { masked, chunks } = maskMarkdownVerbatimRegions(input);
  const escaped = escapeHtmlTagsInMarkdown(masked);
  return unmaskMarkdownVerbatimRegions(escaped, chunks);
};
