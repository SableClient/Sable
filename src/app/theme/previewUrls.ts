export function isHttpsFullSableCssUrl(url: string): boolean {
  return (
    /^https:\/\//i.test(url) &&
    /\.sable\.css(\?|#|$)/i.test(url) &&
    !/\.preview\.sable\.css(\?|#|$)/i.test(url)
  );
}

export function previewUrlFromFullThemeUrl(fullUrl: string): string | undefined {
  if (!/\.sable\.css$/i.test(fullUrl)) return undefined;
  return fullUrl.replace(/\.sable\.css$/i, '.preview.sable.css');
}

export function fullUrlFromPreviewUrl(previewUrl: string, metaFull?: string): string | undefined {
  if (metaFull && /^https:\/\//i.test(metaFull)) return metaFull;
  if (!/\.preview\.sable\.css(\?|#|$)/i.test(previewUrl)) return undefined;
  return previewUrl.replace(/\.preview\.sable\.css(\?|#|$)/i, '.sable.css$1');
}
