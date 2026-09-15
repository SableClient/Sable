import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import type { MatrixClient } from '$types/matrix-sdk';
import { webviewStripsCustomProtocolCache } from './platform';
import { getCurrentMediaSessionScope } from './mediaTransport';
import { getTauriMediaSourceUrl } from './mediaSourceUrl';

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

// Kept in step with MEDIA_RETRY_MARKER in mediaTransport.ts, which strips it from cache keys.
const MEDIA_RETRY_MARKER = '__sable_media_retry';
const TAURI_MEDIA_OUTER_QUERY_PARAMS = ['__sable_media_cache', '__sable_media_session'];

// Embeds a retry revision as a fragment on the inner http(s) target (stripping the
// outer cache/session markers, which the rewrite re-adds). The fragment makes Rust's
// cache_key(scope, target) distinct but is stripped natively before the upstream
// request and the encryption lookup. Undefined for the first attempt, outside Tauri,
// or when there is no http(s) inner target (e.g. blob: URLs).
export const getTauriMediaRetryTarget = (
  mediaUrl: string,
  revision: number
): string | undefined => {
  if (revision <= 0 || !isTauri()) return undefined;
  const innerTarget = getTauriMediaSourceUrl(mediaUrl);
  if (!innerTarget) return undefined;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(innerTarget);
  } catch {
    return undefined;
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return undefined;
  TAURI_MEDIA_OUTER_QUERY_PARAMS.forEach((param) => parsedUrl.searchParams.delete(param));
  parsedUrl.hash = `${MEDIA_RETRY_MARKER}=${revision}`;
  return parsedUrl.toString();
};

export const addTauriMediaRetryRevision = (mediaUrl: string, revision: number): string => {
  const target = getTauriMediaRetryTarget(mediaUrl, revision);
  if (!target) return mediaUrl;
  return rewriteAuthenticatedMediaUrl(target) ?? mediaUrl;
};

/**
 * Returns the inner http(s) target of a renderable media URL, stripped of the
 * outer cache/session markers. Null when the URL isn't a http(s) media URL.
 */
export const getTauriMediaHttpTarget = (src: string): string | null => {
  const innerTarget = getTauriMediaSourceUrl(src);
  if (!innerTarget) return null;
  let url: string;
  try {
    url = decodeURIComponent(innerTarget);
  } catch {
    return null;
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return null;
  TAURI_MEDIA_OUTER_QUERY_PARAMS.forEach((param) => parsedUrl.searchParams.delete(param));
  return parsedUrl.toString();
};

// Without it the retried `src` is identical, so the browser never re-requests.
const addWebMediaRetryRevision = (mediaUrl: string, revision: number): string => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(mediaUrl);
  } catch {
    return mediaUrl;
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return mediaUrl;
  parsedUrl.searchParams.set(MEDIA_RETRY_MARKER, String(revision));
  return parsedUrl.toString();
};

export const addMediaRetryRevision = (mediaUrl: string, revision: number): string => {
  if (revision <= 0) return mediaUrl;
  return isTauri()
    ? addTauriMediaRetryRevision(mediaUrl, revision)
    : addWebMediaRetryRevision(mediaUrl, revision);
};

// A media element cannot play from the `sable-media` scheme (MEDIA_ERR_SRC_NOT_SUPPORTED),
// so video/audio sources go through the loopback HTTP origin.
export const prepareLoopbackMedia = async (source: string): Promise<string> => {
  if (!isTauri()) return source;
  return invoke<string>('prepare_loopback_media', { url: source });
};

// Awaited by the caller's own load so an element's src never changes mid-flight. An image
// renders from the custom protocol too, so a loopback failure costs caching, not the image.
export const prepareLoopbackImageSource = async (source: string): Promise<string> => {
  if (!isTauri()) return source;
  if (!webviewStripsCustomProtocolCache()) return rewriteAuthenticatedMediaUrl(source) ?? source;
  try {
    return await prepareLoopbackMedia(source);
  } catch {
    return source;
  }
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
