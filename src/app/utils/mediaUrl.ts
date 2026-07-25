import { convertFileSrc, isTauri } from '@tauri-apps/api/core';
import type { MatrixClient } from '$types/matrix-sdk';
import { getCurrentMediaSessionScope } from './mediaTransport';

const TAURI_MEDIA_CACHE_VERSION = '__sable_media_cache=3';
const TAURI_MEDIA_PATH_PREFIXES = [
  '/_matrix/client/v1/media/',
  '/_matrix/media/v3/download/',
  '/_matrix/media/v3/thumbnail/',
  '/_matrix/media/r0/download/',
  '/_matrix/media/r0/thumbnail/',
];

export const rewriteAuthenticatedMediaUrl = (httpUrl: string | null): string | null => {
  if (!httpUrl) return null;
  if (!isTauri()) return httpUrl;
  const sourceUrl = httpUrl.startsWith('sable-media://')
    ? httpUrl.slice('sable-media://'.length)
    : httpUrl;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return httpUrl;
  }
  if (
    (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') ||
    parsedUrl.origin === 'null' ||
    !TAURI_MEDIA_PATH_PREFIXES.some((path) => parsedUrl.pathname.startsWith(path))
  ) {
    return httpUrl;
  }
  if (httpUrl.includes(TAURI_MEDIA_CACHE_VERSION)) return httpUrl;
  const mediaUrl = httpUrl.startsWith('sable-media://')
    ? httpUrl
    : convertFileSrc(httpUrl, 'sable-media');
  // Session-scoped so the cacheable response is never shared across accounts.
  const sessionScope = encodeURIComponent(getCurrentMediaSessionScope());
  const separator = mediaUrl.includes('?') ? '&' : '?';
  return `${mediaUrl}${separator}${TAURI_MEDIA_CACHE_VERSION}&__sable_media_session=${sessionScope}`;
};

export const mxcUrlToHttp = (
  mx: MatrixClient,
  mxcUrl: string,
  useAuthentication?: boolean,
  width?: number,
  height?: number,
  resizeMethod?: string,
  allowDirectLinks?: boolean
): string | null => {
  const httpUrl = mx.mxcUrlToHttp(
    mxcUrl.replace(/^["']|["']$/g, ''),
    width,
    height,
    resizeMethod,
    allowDirectLinks,
    undefined,
    useAuthentication
  );

  if (httpUrl && isTauri()) {
    return rewriteAuthenticatedMediaUrl(httpUrl);
  }
  return httpUrl;
};
