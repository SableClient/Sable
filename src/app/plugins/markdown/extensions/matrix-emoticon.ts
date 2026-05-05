import type { TokenizerExtension, RendererExtension } from 'marked';

/** Delimiters for round-tripping Matrix emoticons from HTML through markdown into the Slate composer. */
export const MX_EMOTICON_MD_START = '\uE000';
export const MX_EMOTICON_MD_SEP = '\uE001';
export const MX_EMOTICON_MD_END = '\uE002';

export function encodeMxEmoticonForMarkdownPlaceholder(src: string, shortcode: string): string {
  return `${MX_EMOTICON_MD_START}${src}${MX_EMOTICON_MD_SEP}${shortcode}${MX_EMOTICON_MD_END}`;
}

/**
 * Validates that a URL is a proper mxc:// URI.
 * Returns true if valid, false otherwise.
 */
function validateMxcUrlInternal(url: string): boolean {
  if (!url.startsWith('mxc://')) return false;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'mxc:') return false;
    if (!parsed.host) return false;
    if (!parsed.pathname || parsed.pathname.length < 1) return false;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return false;
    return true;
  } catch {
    return false;
  }
}

// Extension to preserve img[data-mx-emoticon] tags through markdown pipeline
export const matrixEmoticonExtension = {
  name: 'emoticon',
  level: 'inline',
  start(src: string) {
    return src.indexOf('data-mx-emoticon');
  },
  tokenizer(src: string) {
    const rule = /^<img\s+[^>]*data-mx-emoticon[^>]*(?:\/>|>(?=\s*<\/img>))/i;
    const match = rule.exec(src);
    if (!match) return undefined;

    const rawHtml = match[0];

    const srcMatch = /src\s*=\s*["']([^"']*)["']/i.exec(rawHtml);
    if (!srcMatch) return undefined;

    const srcValue = srcMatch[1];
    if (!srcValue || !validateMxcUrlInternal(srcValue)) return undefined;

    return {
      type: 'emoticon',
      raw: rawHtml,
      html: rawHtml,
    };
  },
  renderer(token) {
    return token.html;
  },
} satisfies TokenizerExtension & RendererExtension;

// Preprocessor to strip invalid emoticon img tags before marked processing
export function preprocessEmoticon(markdown: string): string {
  // Remove img[data-mx-emoticon] tags with invalid src URLs
  return markdown.replace(/<img\s+[^>]*data-mx-emoticon[^>]*>/gi, (tag) => {
    const srcMatch = /src\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (!srcMatch) return tag; // Keep if no src attribute
    const srcValue = srcMatch[1];
    if (!srcValue || !validateMxcUrlInternal(srcValue)) return ''; // Remove invalid
    return tag; // Keep valid
  });
}

// Standalone validation function for use by htmlToMarkdown
export function validateMxcUrl(url: string): boolean {
  return validateMxcUrlInternal(url);
}
