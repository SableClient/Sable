import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { matrixSpoilerExtension } from './extensions/matrix-spoiler';
import {
  matrixMathExtension,
  matrixMathBlockExtension,
  maskDollarSignsInsideMarkdownCode,
  shieldDollarRunsForMarked,
  unmaskMathCodeDollarPlaceholders,
  unmaskSubscriptCodeLinePlaceholders,
} from './extensions/matrix-math';
import { matrixSubscriptExtension } from './extensions/matrix-subscript';
import { matrixEmoticonExtension, preprocessEmoticon } from './extensions/matrix-emoticon';
import { matrixUnderlineExtension } from './extensions/matrix-underline';
import {
  escapeLineStartBlockquoteWithoutFollowingSpace,
  unescapeMarkdownInlineSequencesExceptInCodeHtml,
} from './utils';

// Configure marked with Matrix extensions
const processor = marked.use({
  breaks: true,
  extensions: [
    matrixUnderlineExtension,
    matrixSpoilerExtension,
    matrixMathExtension,
    matrixMathBlockExtension,
    matrixSubscriptExtension,
    matrixEmoticonExtension,
  ],
});

/**
 * Decodes common HTML entities in text for markdown processing.
 * This allows markdown parsers to correctly interpret entities like &lt; as <.
 */
const decodeHtmlEntities = (text: string): string => {
  const entities: Record<string, string> = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
  };
  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.split(entity).join(char);
  }
  return result;
};

const MATRIX_TO_PLACEHOLDER_PREFIX = 'MATRIXTORAWLINKTOKEN';

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const shieldBareMatrixToLinks = (
  input: string
): { shielded: string; placeholders: Map<string, string> } => {
  const placeholders = new Map<string, string>();
  let index = 0;

  const shielded = input.replace(/(?<!\]\()https?:\/\/matrix\.to\/[^\s<)]+/gi, (url) => {
    const key = `${MATRIX_TO_PLACEHOLDER_PREFIX}${index++}X`;
    placeholders.set(key, url);
    return key;
  });

  return { shielded, placeholders };
};

const unshieldBareMatrixToLinks = (html: string, placeholders: Map<string, string>): string => {
  let result = html;
  const keys = [...placeholders.keys()].sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const url = placeholders.get(key);
    if (url) result = result.split(key).join(escapeHtml(url));
  }
  return result;
};

/** When the whole message is a single paragraph, drop the redundant wrapper. */
const unwrapSingleOuterParagraph = (html: string): string => {
  const trimmed = html.trim();
  const m = trimmed.match(/^<p\b[^>]*>([\s\S]*)<\/p>$/i);
  if (!m) return html;
  const inner = m[1] ?? '';
  if (/<\/p>/i.test(inner)) return html;
  return inner;
};

/**
 * For `m.emote`, the sender display name is added at render time. Strips the leading `<p>…</p>`
 * block (when its inner HTML has no `</p>`) so we don't send `<p>` around the action.
 */
const stripLeadingEmoteParagraph = (html: string): string | null => {
  const trimmed = html.trim();
  const m = trimmed.match(/^<p\b[^>]*>([\s\S]*?)<\/p>/i);
  if (!m) return null;
  const inner = m[1] ?? '';
  if (/<\/p>/i.test(inner)) return null;
  const rest = trimmed.slice(m[0].length).trimStart();
  return rest.length > 0 ? `${inner}${rest}` : inner;
};

export type MarkdownToHtmlOptions = {
  emote?: boolean;
};

/**
 * Converts markdown string to sanitized Matrix-compatible HTML.
 * Uses marked for parsing and DOMPurify for sanitization per Matrix spec.
 *
 * @param markdown - Input markdown string
 * @param options - Optional; set `emote` for `/me` outgoing HTML
 * @returns Sanitized HTML string safe for Matrix client output
 */
export function markdownToHtml(markdown: string, options?: MarkdownToHtmlOptions): string {
  // Decode HTML entities so marked can properly parse markdown syntax
  // (e.g., &lt; becomes < for link URLs)
  const decoded = decodeHtmlEntities(markdown);

  // Only treat `> ` as block quote, escape bare `>` at line start (e.g. `>:3`)
  const blockquotePrefixed = escapeLineStartBlockquoteWithoutFollowingSpace(decoded);

  const preprocessed = preprocessEmoticon(blockquotePrefixed);

  const { shielded: matrixToShielded, placeholders: matrixToPlaceholders } =
    shieldBareMatrixToLinks(preprocessed);

  const mathInput = shieldDollarRunsForMarked(maskDollarSignsInsideMarkdownCode(matrixToShielded));

  // Parse markdown to HTML using marked with our Matrix extensions
  const html = processor.parse(mathInput) as string;

  // Unescape inline sequences (e.g., \*, \_) after parsing, but not inside <pre>/<code>
  const unescapedInline = unescapeMarkdownInlineSequencesExceptInCodeHtml(html);

  // Force all links to open in a new tab
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noreferrer noopener');
    }
  });

  const sanitized = DOMPurify.sanitize(unescapedInline, {
    ALLOWED_TAGS: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'br',
      'hr',
      'blockquote',
      'ul',
      'ol',
      'li',
      'pre',
      'code',
      'strong',
      'em',
      'u',
      's',
      'del',
      'a',
      'img',
      'span',
      'div',
      'sub',
      'details',
      'summary',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'mx-reply',
    ],
    ALLOWED_ATTR: [
      'href',
      'src',
      'alt',
      'title',
      'height',
      'width',
      'target',
      'rel',
      'data-mx-emoticon',
      'data-mx-spoiler',
      'data-mx-maths',
      'data-md',
      'data-mx-color',
      'data-mx-bg-color',
      'data-lang',
      'class',
      'start',
      'type',
      'open',
    ],
    // Ensure these safe attrs survive sanitization even when the input HTML
    // originates from markdown-embedded tags (e.g. custom emoji <img>).
    ADD_ATTR: ['target', 'rel', 'height', 'width'],
    // Force all links to have safe rel attribute
    FORCE_BODY: false,
    ALLOWED_URI_REGEXP: /^(?:https?|ftp|mailto|magnet|mxc):/i,
  });

  DOMPurify.removeHook('afterSanitizeAttributes');

  const unmasked = unmaskSubscriptCodeLinePlaceholders(unmaskMathCodeDollarPlaceholders(sanitized));

  // DOMPurify's Node/JSdom build can drop <img> size attributes even when allowlisted.
  // For Matrix custom emojis, always emit a stable height so outgoing messages have
  // consistent layout across clients.
  const restoredMxEmoticonHeight = unmasked.replace(
    /<img\b([^>]*\bdata-mx-emoticon\b[^>]*)>/gi,
    (full, attrs: string) => {
      if (/\bheight\s*=/i.test(attrs)) return full;
      return `<img${attrs} height="32">`;
    }
  );

  const unshieldedMatrixTo = unshieldBareMatrixToLinks(
    restoredMxEmoticonHeight,
    matrixToPlaceholders
  );

  const listFixed = unshieldedMatrixTo.replace(/<li>(<p><\/p>)?<\/li>/gi, '<li><br></li>');
  if (options?.emote) {
    return stripLeadingEmoteParagraph(listFixed) ?? unwrapSingleOuterParagraph(listFixed);
  }
  return unwrapSingleOuterParagraph(listFixed);
}
