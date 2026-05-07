import type { BundleContent } from '$components/message';

const LINK_URL = `(https?:\\/\\/.[A-Za-z0-9-._~:/?#[\\]()@!$&'*+,;%=]+)`;
const LINKINPUTREGEX = new RegExp(`\\(?(${LINK_URL})\\)?`, 'g');

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
