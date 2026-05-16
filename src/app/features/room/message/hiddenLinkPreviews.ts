import type { BundleContent } from '$components/message';

const LINK_URL = `(https?:\\/\\/.[A-Za-z0-9-._~:/?#[\\()@!$&'*+,;%=]+)`;
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

  let s = markdown.replace(WRAPPED, '<$1>').replace(OPEN_ONLY, '<$1').replace(CLOSE_ONLY, '$1>');

  // Restore [label](<url>) after htmlToMarkdown escaped a surrounding "\<...\>".
  const ESCAPED_SUPPRESSED_MD_LINK = new RegExp(
    String.raw`\\<\[([^\]]*)\]\((<https?:\/\/[^>\s]+>)\)\\>`,
    'g'
  );
  s = s.replace(ESCAPED_SUPPRESSED_MD_LINK, '[$1]($2)');

  // Same for "\<[label](bare-url)>" when angle brackets were lost on the destination.
  const WRONG_OUTER_ESCAPED_AUTOLINK = /\\<\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)(?:>|\\>)/g;
  s = s.replace(WRONG_OUTER_ESCAPED_AUTOLINK, '[$1](<$2>)');

  return s;
}

export function readdAngleBracketsForHiddenPreviews(
  body: string,
  linkPreviews: BundleContent[] | undefined
): string {
  if (!linkPreviews) return body;

  const previewed = new Set(linkPreviews.map((b) => b.matched_url));

  LINKINPUTREGEX.lastIndex = 0;
  return body.replace(LINKINPUTREGEX, (...args: unknown[]) => {
    const full = args[0] as string;
    const url = args[args.length - 3] as string;
    const offset = args[args.length - 2] as number;
    if (!url || previewed.has(url)) return full;

    // URL is the label of a markdown link [url](...) — do not insert "<" into the label.
    const after = body.slice(offset + full.length, offset + full.length + 2);
    if (after === '](') {
      return full;
    }

    // Already a preview-suppressed destination ...](<https://...>)
    if (offset >= 3 && body.slice(offset - 3, offset) === '](<') {
      return full;
    }

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
