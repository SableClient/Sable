export function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll(/=+$/g, '');
}

export function toMatrixID(fname: string, urlPrefix: string): string {
  const base64 = toBase64Url(fname);
  return urlPrefix + base64;
}

export function getKlipyMxcUrl(url: string, proxyUrl?: string): string {
  if (url.startsWith('mxc://')) return url;
  if (!proxyUrl) return url;
  if (url.startsWith('https://static.klipy.com/ii/')) {
    const id = url.slice('https://static.klipy.com/ii/'.length);
    return `mxc://${proxyUrl}/${toMatrixID(id, 'klipy_')}`;
  }
  return url;
}
