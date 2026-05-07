import type { BundleContent } from '$components/message';

const LINK_URL = `(https?:\\/\\/.[A-Za-z0-9-._~:/?#[\\]()@!$&'*+,;%=]+)`;
const LINKINPUTREGEX = new RegExp(`\\(?(${LINK_URL})\\)?`, 'g');

/**
 * `htmlToMarkdown()` escapes `<` and `>` into `\<` and `\>` in text nodes.
 *
 * We deliberately inject angle brackets around URLs to suppress link previews. Those backslashes
 * are correct internally for markdown escaping, but should not be shown to the user when editing.
 *
 * This helper removes *only* the backslashes that wrap our `<url>` suppressor pattern.
 */
export function stripMarkdownEscapesForHiddenPreviews(markdown: string): string {
  // Handle: \<https://example.com\>
  // Also handle common surrounding parens: (\<url\>), (\<url), \<url\>)
  const WRAPPED = new RegExp(String.raw`\\<(${LINK_URL})\\>`, 'g');
  const OPEN_ONLY = new RegExp(String.raw`\\<(${LINK_URL})`, 'g');
  const CLOSE_ONLY = new RegExp(String.raw`(${LINK_URL})\\>`, 'g');

  return markdown.replace(WRAPPED, '<$1>').replace(OPEN_ONLY, '<$1').replace(CLOSE_ONLY, '$1>');
}

export function readdAngleBracketsForHiddenPreviews(
  body: string,
  linkPreviews: BundleContent[] | undefined
): string {
  if (!linkPreviews) return body;

  const previewed = new Set(linkPreviews.map((b) => b.matched_url));

  LINKINPUTREGEX.lastIndex = 0;
  return body.replace(LINKINPUTREGEX, (full, url: string, offset: number) => {
    if (!url || previewed.has(url)) return full;

    // If the URL is already wrapped as <url>, leave it alone.
    const urlIndex = body.indexOf(url, offset);
    if (urlIndex !== -1 && body.slice(urlIndex - 1, urlIndex + url.length + 1) === `<${url}>`) {
      return full;
    }

    // Keep any surrounding parens emitted by LINKINPUTREGEX.
    if (full.startsWith('(') && full.endsWith(')')) return `(<${url}>)`;
    if (full.startsWith('(')) return `(<${url}`;
    if (full.endsWith(')')) return `<${url}>)`;

    return `<${url}>`;
  });
}
