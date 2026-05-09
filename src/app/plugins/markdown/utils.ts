import { findAndReplace } from '$utils/findAndReplace';

// URL-aware pattern for inline sequences
const URL_NEG_LB = '(?<!(?:https?|ftp|mailto|magnet):\\/\\/\\S*)';
const INLINE_SEQUENCE_SET = '[*_~`|<>]';
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

  let out = parts.join('');
  out = out.replace(
    /(^|\n)-(# +)/gm,
    (_, lineStart: string, hashSp: string) => `${lineStart}\\-${hashSp}`
  );
  return out;
};

/**
 * CommonMark treats `>` at line start as a block quote marker even when not followed by
 * space. We only start a block quote when `>` is followed by horizontal whitespace.
 * Lines like `>:3` get a backslash so the `>` is literal.
 */
export const escapeLineStartBlockquoteWithoutFollowingSpace = (markdown: string): string =>
  markdown.replace(/^(\s*)>(?![ \t])/gm, '$1\\>');
