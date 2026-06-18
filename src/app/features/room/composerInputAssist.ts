import { getMarkdownCodeSpanRanges, isInsideMarkdownCodeSpan } from '$components/editor/utils';

export type StructuredMarkdownAction =
  | { kind: 'continue'; prefix: string }
  | { kind: 'exit'; replacement: string }
  | { kind: 'close_fence'; replacement: string };

const UNORDERED_LIST_RE = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED_LIST_RE = /^(\s*)(\d+)\.\s+(.*)$/;
const BLOCKQUOTE_RE = /^(\s*)>\s?(.*)$/;
const FENCE_RE = /^(\s*)(`{3,}|~{3,})([^`]*)$/;

type FenceState = {
  indent: string;
  fence: string;
};

type EmojiReplacement = {
  emoji: string;
  token: string;
  start: number;
  end: number;
  replacement: string;
};

const AUTO_EXPAND_EMOTICONS: Record<string, string> = {
  '<3': '❤️',
  ':/': '😕',
  ':-/': '😕',
  ':(': '🙁',
  ':-(': '🙁',
  ':)': '🙂',
  ':-)': '🙂',
  ':D': '😄',
  ':-D': '😄',
  ':O': '😮',
  ':-O': '😮',
  ':P': '😛',
  ':-P': '😛',
  ':o': '😮',
  ':-o': '😮',
  ':p': '😛',
  ':-p': '😛',
  ':|': '😐',
  ';)': '😉',
  ';-)': '😉',
  ":'(": '😢',
};

const AUTO_EXPAND_TOKENS = Object.keys(AUTO_EXPAND_EMOTICONS).toSorted((left, right) => {
  if (right.length !== left.length) return right.length - left.length;
  return left.localeCompare(right);
});

const isBoundaryChar = (value: string | undefined): boolean =>
  value === undefined || /\s|[()[\]{}"'`]/.test(value);

const isTokenSeparator = (value: string | undefined): boolean =>
  value === undefined || /\s|[.,!?;:()[\]{}]/.test(value);

function getOpenFence(lines: string[], currentLineIndex: number): FenceState | null {
  let openFence: FenceState | null = null;

  for (let index = 0; index <= currentLineIndex; index += 1) {
    const line = lines[index];
    if (typeof line !== 'string') continue;

    const match = line.match(FENCE_RE);
    if (!match) continue;

    const indent = match[1];
    const fence = match[2];
    if (indent === undefined || fence === undefined) continue;

    if (openFence && openFence.fence[0] === fence[0] && fence.length >= openFence.fence.length) {
      openFence = null;
    } else if (!openFence) {
      openFence = { indent, fence };
    }
  }

  return openFence;
}

export function getStructuredMarkdownAction(
  lines: string[],
  currentLineIndex: number
): StructuredMarkdownAction | null {
  const currentLine = lines[currentLineIndex] ?? '';
  const openFence = getOpenFence(lines, currentLineIndex);
  if (openFence) {
    if (currentLine.trim().length === 0) {
      return { kind: 'close_fence', replacement: `${openFence.indent}${openFence.fence}` };
    }
    return null;
  }

  const blockquoteMatch = currentLine.match(BLOCKQUOTE_RE);
  if (blockquoteMatch) {
    const indent = blockquoteMatch[1] ?? '';
    const body = blockquoteMatch[2] ?? '';
    if (body.trim().length === 0) {
      return { kind: 'exit', replacement: '' };
    }
    return { kind: 'continue', prefix: `${indent}> ` };
  }

  const unorderedMatch = currentLine.match(UNORDERED_LIST_RE);
  if (unorderedMatch) {
    const indent = unorderedMatch[1] ?? '';
    const bullet = unorderedMatch[2] ?? '-';
    const body = unorderedMatch[3] ?? '';
    if (body.trim().length === 0) {
      return { kind: 'exit', replacement: '' };
    }
    return { kind: 'continue', prefix: `${indent}${bullet} ` };
  }

  const orderedMatch = currentLine.match(ORDERED_LIST_RE);
  if (orderedMatch) {
    const indent = orderedMatch[1] ?? '';
    const numberText = orderedMatch[2] ?? '1';
    const body = orderedMatch[3] ?? '';
    if (body.trim().length === 0) {
      return { kind: 'exit', replacement: '' };
    }
    const nextNumber = Number.parseInt(numberText, 10) + 1;
    return { kind: 'continue', prefix: `${indent}${nextNumber}. ` };
  }

  return null;
}

export function shouldInsertBreakAfterStructuredReplacement(
  action: StructuredMarkdownAction
): boolean {
  return action.kind === 'exit' || action.kind === 'close_fence';
}

export function findEmojiAutoReplacement(
  text: string,
  cursorOffset: number
): EmojiReplacement | null {
  if (cursorOffset < 0 || cursorOffset > text.length) return null;

  const trailingChar = text[cursorOffset - 1];
  const tokenEnd = isTokenSeparator(trailingChar) ? cursorOffset - 1 : cursorOffset;
  if (tokenEnd <= 0) return null;

  const codeSpanRanges = getMarkdownCodeSpanRanges(text);

  for (const token of AUTO_EXPAND_TOKENS) {
    const start = tokenEnd - token.length;
    if (start < 0) continue;
    if (text.slice(start, tokenEnd) !== token) continue;

    const before = text[start - 1];
    const after = text[tokenEnd];
    if (!isBoundaryChar(before) || !isTokenSeparator(after)) continue;
    if (isInsideMarkdownCodeSpan(start, tokenEnd, codeSpanRanges)) continue;

    return {
      token,
      emoji: AUTO_EXPAND_EMOTICONS[token]!,
      start,
      end: trailingChar !== undefined && isTokenSeparator(trailingChar) ? cursorOffset : tokenEnd,
      replacement:
        trailingChar !== undefined && isTokenSeparator(trailingChar)
          ? `${AUTO_EXPAND_EMOTICONS[token]}${trailingChar}`
          : AUTO_EXPAND_EMOTICONS[token]!,
    };
  }

  return null;
}
