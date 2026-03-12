import { hasServiceWorker } from '$utils/platform';
import { useMatrixClient } from './useMatrixClient';
import { useAuthenticatedMediaUrl } from './useAuthenticatedMediaUrl';

/** Wraps a media URL for `<img>` / `<video>` src. Returns a blob: URL on platforms without a SW. */
export function useMediaSrc(url: string | undefined): string | undefined {
  const mx = useMatrixClient();
  return useAuthenticatedMediaUrl(url, mx.getAccessToken());
}

/** Returns the access token for media downloads, or `undefined` when a SW handles auth. */
export function useMediaDownloadToken(): string | null | undefined {
  const mx = useMatrixClient();
  if (hasServiceWorker()) return undefined;
  return mx.getAccessToken();
}
