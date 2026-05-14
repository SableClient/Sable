/**
 * Inserts an extra newline before block-level markdown lines that follow a single `\n`,
 * so CommonMark/marked see a real paragraph boundary. Skips fenced code regions.
 */

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

/** Returns index just past the fence block, or null if `i` is not a fence opener at line start. */
function trySkipFenceEnd(md: string, i: number): number | null {
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
    if (!close) return md.length;
    return close.blockEnd;
  }

  const closeIdx = findSameLineFenceClose(md, afterOpen, tick, openLen);
  if (closeIdx < 0) return null;

  let closeRun = 0;
  while (closeIdx + closeRun < md.length && md[closeIdx + closeRun] === tick) closeRun++;

  return closeIdx + closeRun;
}

function afterLeadingIndent(line: string): string {
  let k = 0;
  while (k < line.length && k < 3 && line[k] === ' ') k++;
  return line.slice(k);
}

function effectiveContentAfterEscapes(line: string): string | null {
  const rest = afterLeadingIndent(line);
  if (rest.length === 0) return null;
  let bs = 0;
  while (bs < rest.length && rest[bs] === '\\') bs++;
  if (bs % 2 === 1) return null;
  return rest.slice(bs);
}

function looksLikeBlockStart(effective: string): boolean {
  if (effective.length === 0) return false;

  if (/^#{1,6}(?:\s|$)/.test(effective)) return true;
  if (/^-# +/.test(effective)) return true;
  if (/^>\s/.test(effective)) return true;
  if (/^[-*+]\s/.test(effective)) return true;
  if (/^\d{1,9}\.\s/.test(effective)) return true;
  if (/^(?:`{3,}|~{3,})/.test(effective)) return true;
  if (effective.startsWith('$$')) return true;
  if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(effective)) return true;

  return false;
}

function nextLineIsBlockStarter(md: string, newlineIdx: number): boolean {
  const start = newlineIdx + 1;
  if (start >= md.length) return false;
  const nextNl = md.indexOf('\n', start);
  const line = nextNl === -1 ? md.slice(start) : md.slice(start, nextNl);
  const effective = effectiveContentAfterEscapes(line);
  if (effective === null) return false;
  return looksLikeBlockStart(effective);
}

/**
 * After a single newline (not part of `\n\n`), inserts one more `\n` when the following line
 * opens a block the marked stack understands. Fenced code is copied verbatim without changes.
 */
export function expandBlockBoundariesAfterSingleNewlines(markdown: string): string {
  const md = markdown.replace(/\r\n/g, '\n');
  let out = '';
  let i = 0;
  const n = md.length;

  while (i < n) {
    const atLineStart = i === 0 || md[i - 1] === '\n';
    if (atLineStart) {
      const fenceEnd = trySkipFenceEnd(md, i);
      if (fenceEnd !== null) {
        out += md.slice(i, fenceEnd);
        i = fenceEnd;
        continue;
      }
    }

    if (
      md[i] === '\n' &&
      (i === 0 || md[i - 1] !== '\n') &&
      (i + 1 >= n || md[i + 1] !== '\n') &&
      nextLineIsBlockStarter(md, i)
    ) {
      out += '\n\n';
      i += 1;
      continue;
    }

    out += md[i];
    i += 1;
  }

  return out;
}
