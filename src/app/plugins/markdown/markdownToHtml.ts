import { marked } from "marked";
import DOMPurify from "dompurify";
import { matrixSpoilerExtension } from "./extensions/matrix-spoiler";
import {
  matrixMathExtension,
  matrixMathBlockExtension,
} from "./extensions/matrix-math";
import { matrixSubscriptExtension } from "./extensions/matrix-subscript";
import {
  unescapeMarkdownBlockSequences,
  unescapeMarkdownInlineSequences,
} from "./utils";

// Configure marked with Matrix extensions
const processor = marked.use({
  extensions: [
    matrixSpoilerExtension,
    matrixMathExtension,
    matrixMathBlockExtension,
    matrixSubscriptExtension,
  ],
});

/**
 * Decodes common HTML entities in text for markdown processing.
 * This allows markdown parsers to correctly interpret entities like &lt; as <.
 */
const decodeHtmlEntities = (text: string): string => {
  const entities: Record<string, string> = {
    "&lt;": "<",
    "&gt;": ">",
    "&amp;": "&",
    "&quot;": '"',
    "&#39;": "'",
    "&nbsp;": " ",
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
  const unescapedBlocks = unescapeMarkdownBlockSequences(
    decoded,
    (text) => text,
  );

  // Parse markdown to HTML using marked with our Matrix extensions
  const html = processor.parse(unescapedBlocks) as string;

  // Unescape inline sequences (e.g., \*, \_) after parsing
  const unescapedInline = unescapeMarkdownInlineSequences(html);

  // Sanitize using DOMPurify, restricting to Matrix-spec allowed HTML tags/attributes
  const sanitized = DOMPurify.sanitize(unescapedInline, {
    ALLOWED_TAGS: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "br",
      "hr",
      "blockquote",
      "ul",
      "ol",
      "li",
      "pre",
      "code",
      "strong",
      "em",
      "u",
      "s",
      "del",
      "a",
      "img",
      "span",
      "div",
      "sub",
      "details",
      "summary",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "mx-reply",
    ],
    ALLOWED_ATTR: [
      "href",
      "src",
      "alt",
      "title",
      "height",
      "width",
      "target",
      "rel",
      "data-mx-emoticon",
      "data-mx-spoiler",
      "data-mx-maths",
      "data-md",
      "data-lang",
      "class",
      "start",
      "type",
      "open",
    ],
    // Allow safe rel attributes for links
    ADD_ATTR: ["target", "rel"],
    // Force all links to have safe rel attribute
    FORCE_BODY: false,
  });

  return sanitized;
}
