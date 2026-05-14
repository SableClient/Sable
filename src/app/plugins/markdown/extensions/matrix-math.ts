import type { TokenizerExtension, RendererExtension } from 'marked';

/** Private-use char so math extensions do not match `$` / `$$` inside code spans. Not U+E000–U+E002 (emoticon placeholders). {@link shieldDollarRunsForMarked} uses U+E021–U+E022. */
export const MATH_CODE_DOLLAR_MASK = '\uE020';

/**
 * Replaces the `-` of line-start `-# …` inside markdown code so the Matrix subscript block
 * extension does not match before marked's `fences` rule (custom block extensions run first).
 * {@link unmaskSubscriptCodeLinePlaceholders} restores output HTML.
 */
export const SUBSCRIPT_CODE_LINE_MASK = '\uE023';

function maskSubscriptLineStartsInCodeInner(inner: string): string {
  return inner.replace(/(^|\n)-#( +)/g, `$1${SUBSCRIPT_CODE_LINE_MASK}#$2`);
}

/** Applies {@link MATH_CODE_DOLLAR_MASK} and subscript masking inside a fence or inline-code region. */
function maskMathAndSubscriptInCodeInner(inner: string): string {
  return maskSubscriptLineStartsInCodeInner(inner.replace(/\$/g, MATH_CODE_DOLLAR_MASK));
}

function findSameLineFenceClose(md: string, from: number, tick: string, minLen: number): number {
  let j = from;
  while (j < md.length && md[j] !== '\n') {
    if (md[j] === tick) {
      let run = 0;
      while (j + run < md.length && md[j + run] === tick) run++;
      if (run >= minLen) return j;
      j += run;
    } else {
      j++;
    }
  }
  return -1;
}

function findMultilineFenceEnd(
  md: string,
  contentStart: number,
  tick: string,
  minLen: number
): { blockEnd: number; contentEnd: number } | null {
  let p = contentStart;
  while (p <= md.length) {
    const nl = md.indexOf('\n', p);
    const lineStart = p;
    const lineEnd = nl === -1 ? md.length : nl;
    const line = md.slice(lineStart, lineEnd);
    const m = tick === '`' ? /^ {0,3}(`{3,})\s*$/.exec(line) : /^ {0,3}(~{3,})\s*$/.exec(line);
    const fenceRun = m?.[1];
    if (fenceRun && fenceRun.length >= minLen && fenceRun[0] === tick) {
      return {
        blockEnd: nl === -1 ? md.length : nl + 1,
        contentEnd: lineStart,
      };
    }
    if (nl === -1) return null;
    p = nl + 1;
  }
  return null;
}

function tryConsumeFence(md: string, i: number): { text: string; end: number } | null {
  const atLineStart = i === 0 || md[i - 1] === '\n';
  if (!atLineStart) return null;

  const rest = md.slice(i);
  const open = /^(\s{0,3})(`{3,}|~{3,})/.exec(rest);
  if (!open?.[2]) return null;

  const fenceStr = open[2];
  const tick = fenceStr.charAt(0);
  const openLen = fenceStr.length;
  const afterOpen = i + open[0].length;

  if (afterOpen < md.length && md[afterOpen] === '\n') {
    const contentStart = afterOpen + 1;
    const close = findMultilineFenceEnd(md, contentStart, tick, openLen);
    if (!close) {
      const inner = md.slice(contentStart, md.length);
      const masked = maskMathAndSubscriptInCodeInner(inner);
      return { text: md.slice(i, contentStart) + masked, end: md.length };
    }
    const inner = md.slice(contentStart, close.contentEnd);
    const maskedInner = maskMathAndSubscriptInCodeInner(inner);
    return {
      text: md.slice(i, contentStart) + maskedInner + md.slice(close.contentEnd, close.blockEnd),
      end: close.blockEnd,
    };
  }

  const closeIdx = findSameLineFenceClose(md, afterOpen, tick, openLen);
  if (closeIdx < 0) return null;

  let closeRun = 0;
  while (closeIdx + closeRun < md.length && md[closeIdx + closeRun] === tick) closeRun++;

  const inner = md.slice(afterOpen, closeIdx);
  const maskedInner = maskMathAndSubscriptInCodeInner(inner);
  return {
    text: md.slice(i, afterOpen) + maskedInner + md.slice(closeIdx, closeIdx + closeRun),
    end: closeIdx + closeRun,
  };
}

function tryConsumeInlineCode(md: string, i: number): { text: string; end: number } | null {
  if (md[i] !== '`') return null;
  let run = 0;
  while (i + run < md.length && md[i + run] === '`') run++;
  const contentStart = i + run;
  let j = contentStart;
  while (j < md.length) {
    if (md[j] === '`') {
      let cr = 0;
      while (j + cr < md.length && md[j + cr] === '`') cr++;
      if (cr === run) {
        const inner = md.slice(contentStart, j);
        const maskedInner = maskMathAndSubscriptInCodeInner(inner);
        return {
          text: md.slice(i, contentStart) + maskedInner + md.slice(j, j + run),
          end: j + run,
        };
      }
      j += cr;
    } else {
      j++;
    }
  }
  return null;
}

/**
 * Replaces `$` inside fenced and inline code so Matrix math extensions do not run on code literals.
 * {@link unmaskMathCodeDollarPlaceholders} must be applied to the final HTML.
 */
export function maskDollarSignsInsideMarkdownCode(markdown: string): string {
  const md = markdown.replace(/\r\n/g, '\n');
  let out = '';
  let i = 0;
  const n = md.length;

  while (i < n) {
    const atLineStart = i === 0 || md[i - 1] === '\n';

    if (atLineStart) {
      const fence = tryConsumeFence(md, i);
      if (fence) {
        out += fence.text;
        i = fence.end;
        continue;
      }
    }

    if (md[i] === '`') {
      const span = tryConsumeInlineCode(md, i);
      if (span) {
        out += span.text;
        i = span.end;
        continue;
      }
    }

    out += md[i];
    i++;
  }

  return out;
}

export function unmaskMathCodeDollarPlaceholders(html: string): string {
  return html.replaceAll(MATH_CODE_DOLLAR_MASK, '$');
}

export function unmaskSubscriptCodeLinePlaceholders(html: string): string {
  return html.replaceAll(`${SUBSCRIPT_CODE_LINE_MASK}#`, '-#');
}

const MARKED_MATH_BLOCK_SHIELD = '\uE021';
const MARKED_MATH_BLOCK_SHIELD_END = '\uE022';

export function shieldDollarRunsForMarked(markdown: string): string {
  const blocks: string[] = [];
  const blockRe = /\$\$([^$]+)\$\$\n?/g;
  let m: RegExpExecArray | null;
  let shielded = '';
  let last = 0;
  while ((m = blockRe.exec(markdown)) !== null) {
    shielded += markdown.slice(last, m.index);
    blocks.push(m[0]);
    shielded += `${MARKED_MATH_BLOCK_SHIELD}${blocks.length - 1}${MARKED_MATH_BLOCK_SHIELD_END}`;
    last = m.index + m[0].length;
  }
  shielded += markdown.slice(last);

  shielded = shielded.replace(/\${2,}/g, (run) => run.replace(/\$/g, () => '\\$'));

  return shielded.replace(
    new RegExp(`${MARKED_MATH_BLOCK_SHIELD}(\\d+)${MARKED_MATH_BLOCK_SHIELD_END}`, 'g'),
    (_, i) => blocks[parseInt(i, 10)] ?? ''
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isIgnorableMathContent(latex: string): boolean {
  const t = latex.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (t === '') return true;
  return /^\$+$/.test(t);
}

/**
 * Inline math delimiters use `$...$` but must not greedily pair across dollar amounts
 * (e.g. "$10 ... $20"). We only treat a pair as math when:
 * - the opening `$` is not followed by whitespace, and
 * - the closing `$` is not preceded by whitespace, and
 * - the closing `$` is not immediately followed by an ASCII digit.
 */
function tryTokenizeInlineMath(
  src: string
): { type: 'math'; raw: string; latex: string } | undefined {
  if (!src.startsWith('$')) {
    return undefined;
  }
  if (src.startsWith('$$') && (src.length < 3 || src.charAt(2) !== '$')) {
    return undefined;
  }
  if (src.length < 3 || /\s/.test(src.charAt(1))) {
    return undefined;
  }
  for (let j = 1; j < src.length; j++) {
    if (src.charAt(j) !== '$') continue;
    const before = src.charAt(j - 1);
    if (/\s/.test(before)) continue;
    const after = j + 1 < src.length ? src.charAt(j + 1) : '';
    if (after !== '' && /[0-9]/.test(after)) continue;
    const latex = src.slice(1, j);
    if (isIgnorableMathContent(latex)) continue;
    if (latex.trimStart().startsWith('$$')) continue;
    return {
      type: 'math',
      raw: src.slice(0, j + 1),
      latex,
    };
  }
  return undefined;
}

// Inline math: $...$
export const matrixMathExtension = {
  name: 'math',
  level: 'inline',
  start(src: string) {
    return src.indexOf('$');
  },
  tokenizer(src: string) {
    return tryTokenizeInlineMath(src);
  },
  renderer(token) {
    return `<span data-mx-maths="${escapeHtml(token.latex)}">${token.latex}</span>`;
  },
} satisfies TokenizerExtension & RendererExtension;

// Block math: $$...$$
export const matrixMathBlockExtension = {
  name: 'mathBlock',
  level: 'block',
  start(src: string) {
    return src.indexOf('$$');
  },
  tokenizer(src: string) {
    const match = /^\$\$([^$]+)\$\$\n?/.exec(src);
    if (match) {
      const latex = match[1]?.trim() ?? '';
      if (isIgnorableMathContent(latex)) return undefined;
      return {
        type: 'mathBlock',
        raw: match[0],
        latex,
      };
    }
    return undefined;
  },
  renderer(token) {
    return `<div data-mx-maths="${escapeHtml(token.latex)}">${token.latex}</div>`;
  },
} satisfies TokenizerExtension & RendererExtension;
