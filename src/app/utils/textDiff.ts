export type TextDiffPart = {
  type: 'equal' | 'insert' | 'delete';
  value: string;
};

export type LineDiffPart = {
  type: 'equal' | 'insert' | 'delete';
  lines: string[];
};

export type MessageDiffRow =
  | { type: 'equal'; text: string }
  | { type: 'delete'; text: string }
  | { type: 'insert'; text: string }
  | { type: 'skip'; lines: string[]; placement: 'before' | 'after' | 'between' };

export type MessageDiffDisplay =
  | { mode: 'inline'; parts: TextDiffPart[] }
  | { mode: 'lines'; rows: MessageDiffRow[] };

const DEFAULT_CONTEXT_LINES = 1;

const tokenizeForDiff = (text: string): string[] => text.match(/\s+|[^\s]+/g) ?? [];

const mergeAdjacentParts = (parts: TextDiffPart[]): TextDiffPart[] => {
  const merged: TextDiffPart[] = [];
  for (const part of parts) {
    const last = merged.at(-1);
    if (last && last.type === part.type) {
      last.value += part.value;
      continue;
    }
    merged.push({ ...part });
  }
  return merged;
};

const lcsDiff = <T>(
  oldTokens: T[],
  newTokens: T[],
  isEqual: (left: T, right: T) => boolean
): Array<{ type: 'equal' | 'insert' | 'delete'; value: T }> => {
  const oldLen = oldTokens.length;
  const newLen = newTokens.length;

  const lcs: number[][] = Array.from({ length: oldLen + 1 }, () =>
    Array<number>(newLen + 1).fill(0)
  );

  for (let i = oldLen - 1; i >= 0; i -= 1) {
    for (let j = newLen - 1; j >= 0; j -= 1) {
      if (isEqual(oldTokens[i]!, newTokens[j]!)) {
        lcs[i]![j] = lcs[i + 1]![j + 1]! + 1;
      } else {
        lcs[i]![j] = Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
      }
    }
  }

  const parts: Array<{ type: 'equal' | 'insert' | 'delete'; value: T }> = [];
  let i = 0;
  let j = 0;

  while (i < oldLen && j < newLen) {
    if (isEqual(oldTokens[i]!, newTokens[j]!)) {
      parts.push({ type: 'equal', value: oldTokens[i]! });
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      parts.push({ type: 'delete', value: oldTokens[i]! });
      i += 1;
    } else {
      parts.push({ type: 'insert', value: newTokens[j]! });
      j += 1;
    }
  }

  while (i < oldLen) {
    parts.push({ type: 'delete', value: oldTokens[i]! });
    i += 1;
  }

  while (j < newLen) {
    parts.push({ type: 'insert', value: newTokens[j]! });
    j += 1;
  }

  return parts;
};

export const diffWords = (oldText: string, newText: string): TextDiffPart[] => {
  if (oldText === newText) {
    return oldText ? [{ type: 'equal', value: oldText }] : [];
  }

  const parts = lcsDiff(tokenizeForDiff(oldText), tokenizeForDiff(newText), (a, b) => a === b);
  return mergeAdjacentParts(parts.map((part) => ({ type: part.type, value: part.value })));
};

const splitLines = (text: string): string[] => {
  if (text === '') return [];
  return text.replace(/\n$/, '').split('\n');
};

const trimLineDiffEdges = (text: string): string => {
  const lines = splitLines(text);
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines.at(-1) === '') lines.pop();
  return lines.join('\n');
};

const mergeLineParts = (
  parts: Array<{ type: 'equal' | 'insert' | 'delete'; value: string }>
): LineDiffPart[] => {
  const merged: LineDiffPart[] = [];
  for (const part of parts) {
    const last = merged.at(-1);
    if (last && last.type === part.type) {
      last.lines.push(part.value);
      continue;
    }
    merged.push({ type: part.type, lines: [part.value] });
  }
  return merged;
};

export const diffLinesRaw = (oldText: string, newText: string): LineDiffPart[] => {
  if (oldText === newText) {
    const lines = splitLines(oldText);
    return lines.length > 0 ? [{ type: 'equal', lines }] : [];
  }

  const parts = lcsDiff(splitLines(oldText), splitLines(newText), (a, b) => a === b);
  return mergeLineParts(parts);
};

export const collapseEqualLineRuns = (
  parts: LineDiffPart[],
  contextLines = DEFAULT_CONTEXT_LINES
): MessageDiffRow[] => {
  const rows: MessageDiffRow[] = [];

  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const part = parts[partIndex]!;
    if (part.type !== 'equal') {
      for (const line of part.lines) {
        rows.push({ type: part.type, text: line });
      }
      continue;
    }

    const { lines } = part;
    const prevIsChange = partIndex > 0 && parts[partIndex - 1]!.type !== 'equal';
    const nextIsChange = partIndex < parts.length - 1 && parts[partIndex + 1]!.type !== 'equal';

    if (lines.length <= contextLines) {
      for (const line of lines) {
        rows.push({ type: 'equal', text: line });
      }
      continue;
    }

    if (!prevIsChange && nextIsChange) {
      const hiddenLines = lines.slice(0, -contextLines);
      if (hiddenLines.length > 0) {
        rows.push({ type: 'skip', lines: hiddenLines, placement: 'before' });
      }
      for (const line of lines.slice(-contextLines)) {
        rows.push({ type: 'equal', text: line });
      }
      continue;
    }

    if (prevIsChange && !nextIsChange) {
      for (const line of lines.slice(0, contextLines)) {
        rows.push({ type: 'equal', text: line });
      }
      const hiddenLines = lines.slice(contextLines);
      if (hiddenLines.length > 0) {
        rows.push({ type: 'skip', lines: hiddenLines, placement: 'after' });
      }
      continue;
    }

    if (prevIsChange && nextIsChange) {
      if (lines.length <= contextLines * 2) {
        for (const line of lines) {
          rows.push({ type: 'equal', text: line });
        }
        continue;
      }

      for (const line of lines.slice(0, contextLines)) {
        rows.push({ type: 'equal', text: line });
      }
      rows.push({
        type: 'skip',
        lines: lines.slice(contextLines, -contextLines),
        placement: 'between',
      });
      for (const line of lines.slice(-contextLines)) {
        rows.push({ type: 'equal', text: line });
      }
      continue;
    }

    for (const line of lines) {
      rows.push({ type: 'equal', text: line });
    }
  }

  return rows;
};

export const buildMessageDiffDisplay = (oldText: string, newText: string): MessageDiffDisplay => {
  const isMultiline = oldText.includes('\n') || newText.includes('\n');
  if (!isMultiline) {
    return { mode: 'inline', parts: diffWords(oldText, newText) };
  }

  const normalizedOld = trimLineDiffEdges(oldText);
  const normalizedNew = trimLineDiffEdges(newText);

  return {
    mode: 'lines',
    rows: collapseEqualLineRuns(diffLinesRaw(normalizedOld, normalizedNew)),
  };
};
