import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { matrixSpoilerExtension } from './extensions/matrix-spoiler';
import { matrixMathExtension, matrixMathBlockExtension } from './extensions/matrix-math';
import { matrixSubscriptExtension } from './extensions/matrix-subscript';
import { matrixEmoticonExtension, preprocessEmoticon } from './extensions/matrix-emoticon';
import { matrixUnderlineExtension } from './extensions/matrix-underline';
import { unescapeMarkdownBlockSequences, unescapeMarkdownInlineSequences } from './utils';

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

/**
 * Converts markdown string to sanitized Matrix-compatible HTML.
 * Uses marked for parsing and DOMPurify for sanitization per Matrix spec.
 *
 * @param markdown - Input markdown string
 * @returns Sanitized HTML string safe for Matrix client output
 */
export function markdownToHtml(markdown: string): string {
  // Decode HTML entities so marked can properly parse markdown syntax
  // (e.g., &lt; becomes < for link URLs)
  const decoded = decodeHtmlEntities(markdown);

  // First unescape any block-level escape sequences (e.g., \>, \#)
  const unescapedBlocks = unescapeMarkdownBlockSequences(decoded, (text) => text);

  const preprocessed = preprocessEmoticon(unescapedBlocks);

  // Parse markdown to HTML using marked with our Matrix extensions
  const html = processor.parse(preprocessed) as string;

  // Unescape inline sequences (e.g., \*, \_) after parsing
  const unescapedInline = unescapeMarkdownInlineSequences(html);

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
    // Allow safe rel attributes for links
    ADD_ATTR: ['target', 'rel'],
    // Force all links to have safe rel attribute
    FORCE_BODY: false,
    ALLOWED_URI_REGEXP: /^(?:https?|ftp|mailto|magnet|mxc):/i,
  });

  DOMPurify.removeHook('afterSanitizeAttributes');

  return sanitized.replace(/<li>(<p><\/p>)?<\/li>/gi, '<li><br></li>');
}
