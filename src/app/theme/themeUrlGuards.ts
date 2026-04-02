const PREVIEW_RE = /\.preview\.sable\.css(\?|$|#)/i;
const FULL_RE = /\.sable\.css(\?|$|#)/i;

export function isThemePreviewUrl(url: string): boolean {
  return /^https:\/\//i.test(url) && PREVIEW_RE.test(url) && !isThemeFullUrl(url);
}

export function isThemeFullUrl(url: string): boolean {
  return /^https:\/\//i.test(url) && /\.sable\.css(\?|$|#)/i.test(url) && !PREVIEW_RE.test(url);
}

export function isApprovedThemeUrl(url: string, approvedPrefixes: string[]): boolean {
  return approvedPrefixes.some((p) => url.startsWith(p));
}
