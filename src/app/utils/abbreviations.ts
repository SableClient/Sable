export type AbbreviationEntry = {
  term: string;
  definition: string;
};

export type RoomAbbreviationsContent = {
  entries: AbbreviationEntry[];
};

/** Build a map of exact-case term → definition for O(1) lookup. */
export const buildAbbreviationsMap = (entries: AbbreviationEntry[]): Map<string, string> => {
  const map = new Map<string, string>();
  entries.forEach(({ term, definition }) => {
    const t = term.trim();
    if (t) map.set(t, definition);
  });
  return map;
};

/**
 * Split a plain-text string into alternating [plain, term, plain, term, …] segments.
 * Matched terms preserve their original casing from the source string.
 * Matching is whole-word and case-sensitive.
 *
 * Returns an array of `{ text, termKey }` objects where `termKey` is undefined for
 * plain segments and is the exact-case lookup key for abbreviation segments.
 */
export type TextSegment = {
  text: string;
  /** Undefined for plain text; the lowercase map key for an abbreviation. */
  termKey?: string;
};

export const splitByAbbreviations = (text: string, abbrMap: Map<string, string>): TextSegment[] => {
  if (abbrMap.size === 0) return [{ text }];

  // Build a regex that matches any of the terms at word boundaries.
  // Sort longest first so "HTTP/2" matches before "HTTP".
  const terms = [...abbrMap.keys()].sort((a, b) => b.length - a.length);
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'g');

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // eslint-disable-next-line no-cond-assign
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }
    segments.push({ text: match[0], termKey: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ text }];
};
