import { findAndReplace } from '$utils/findAndReplace';

// Regex patterns for block-level markdown escape sequences
// These match escaped markdown characters like \>, \#, \`, etc.
const ESC_BLOCK_SEQ = /^\\(\\*[#>[ `])/;
const UN_ESC_BLOCK_SEQ = /^\*[#>[ `]/;

// URL-aware pattern for inline sequences
const URL_NEG_LB = '(?<!(?:https?|ftp|mailto|magnet):\\/\\/\\S*)';
const INLINE_SEQUENCE_SET = '[*_~`|]';
const CAP_INLINE_SEQ = `${URL_NEG_LB}${INLINE_SEQUENCE_SET}`;

/**
 * Removes escape sequences from markdown inline elements in the given plain-text.
 * This function unescapes characters that are escaped with backslashes (e.g., `\*`, `\_`)
 * in markdown syntax, returning the original plain-text with markdown characters in effect.
 *
 * @param text - The input markdown plain-text containing escape characters (e.g., `"some \*italic\*"`)
 * @returns The plain-text with markdown escape sequences removed (e.g., `"some *italic*"`)
 */
export const unescapeMarkdownInlineSequences = (text: string): string => {
  const escapePattern = new RegExp(`${URL_NEG_LB}\\\\(${INLINE_SEQUENCE_SET})`, 'g');
  const parts = findAndReplace(
    text,
    escapePattern,
    (match) => {
      const [, g1] = match;
      return g1 ?? '';
    },
    (t) => t
  );
  return parts.join('');
};

const PLACEHOLDER_START = '\uE000';
const PLACEHOLDER_END = '\uE001';

/**
 * Like {@link unescapeMarkdownInlineSequences}, but leaves &lt;pre&gt;…&lt;/pre&gt; and
 * &lt;code&gt;…&lt;/code&gt; regions unchanged so backslash escapes remain literal in HTML
 * code blocks (CommonMark treats them as verbatim in the source markdown, and the post-parse
 * HTML pass must not strip viewer-intended `\` characters there).
 */
export const unescapeMarkdownInlineSequencesExceptInCodeHtml = (html: string): string => {
  const preserved: string[] = [];
  const tag = (idx: number) => `${PLACEHOLDER_START}${idx}${PLACEHOLDER_END}`;

  let masked = html.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, (chunk) => {
    preserved.push(chunk);
    return tag(preserved.length - 1);
  });

  masked = masked.replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, (chunk) => {
    preserved.push(chunk);
    return tag(preserved.length - 1);
  });

  const unescaped = unescapeMarkdownInlineSequences(masked);

  return unescaped.replace(
    new RegExp(`${PLACEHOLDER_START}(\\d+)${PLACEHOLDER_END}`, 'g'),
    (_, i) => preserved[parseInt(i, 10)] ?? ''
  );
};

/**
 * Recovers the markdown escape sequences in the given plain-text.
 * This function adds backslashes (`\`) before markdown characters that may need escaping
 * (e.g., `*`, `_`) to ensure they are treated as literal characters and not part of markdown formatting.
 *
 * @param text - The input plain-text that may contain markdown sequences (e.g., `"some *italic*"`)
 * @returns The plain-text with markdown escape sequences added (e.g., `"some \*italic\*"`)
 */
export const escapeMarkdownInlineSequences = (text: string): string => {
  const regex = new RegExp(`(${CAP_INLINE_SEQ})`, 'g');
  const parts = findAndReplace(
    text,
    regex,
    (match) => {
      const [, g1] = match;
      return `\\${g1}`;
    },
    (t) => t
  );

  return parts.join('');
};

/**
 * Removes escape sequences from markdown block elements in the given plain-text.
 * This function unescapes characters that are escaped with backslashes (e.g., `\>`, `\#`)
 * in markdown syntax, returning the original plain-text with markdown characters in effect.
 *
 * @param {string} text - The input markdown plain-text containing escape characters (e.g., `\> block quote`).
 * @param {function} processPart - It takes the plain-text as input and returns a modified version of it.
 * @returns {string} The plain-text with markdown escape sequences removed and markdown formatting applied.
 */
export const unescapeMarkdownBlockSequences = (
  text: string,
  processPart: (text: string) => string
): string => {
  const match = text.match(ESC_BLOCK_SEQ);

  if (!match) return processPart(text);

  const [, g1] = match;
  return text.replace(ESC_BLOCK_SEQ, g1 ?? '');
};

/**
 * Escapes markdown block elements by adding backslashes before markdown characters
 * (e.g., `\>`, `\#`) that are normally interpreted as markdown syntax.
 *
 * @param {string} text - The input markdown plain-text that may contain markdown elements (e.g., `> block quote`).
 * @param {function} processPart - It takes the plain-text as input and returns a modified version of it.
 * @returns {string} The plain-text with markdown escape sequences added, preventing markdown formatting.
 */
export const escapeMarkdownBlockSequences = (
  text: string,
  processPart: (text: string) => string
): string => {
  const match = text.match(UN_ESC_BLOCK_SEQ);

  if (!match) return processPart(text);

  const [, g1] = match;
  return text.replace(UN_ESC_BLOCK_SEQ, `\\${g1}`);
};
