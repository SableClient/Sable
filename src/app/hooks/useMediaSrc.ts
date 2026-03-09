import { hasServiceWorker } from '$utils/platform';
import { useMatrixClient } from './useMatrixClient';
import { useAuthenticatedMediaUrl } from './useAuthenticatedMediaUrl';

/**
 * Wraps a media URL for use in `<img src>`, `<video src>`, etc.
 * On platforms with a service worker the URL is returned unchanged.
 * On platforms without one (Android WebView) the resource is fetched with
 * the user's access token and a blob: URL is returned instead.
 */
export function useMediaSrc(url: string | undefined): string | undefined {
  const mx = useMatrixClient();
  return useAuthenticatedMediaUrl(url, mx.getAccessToken());
}

/**
 * Returns the access token that should be passed to `downloadMedia` /
 * `downloadEncryptedMedia` / `authenticatedMediaFetch`. Returns `undefined`
 * when a service worker handles authentication so callers don't add a
 * redundant header.
 */
export function useMediaDownloadToken(): string | null | undefined {
  const mx = useMatrixClient();
  if (hasServiceWorker()) return undefined;
  return mx.getAccessToken();
}
