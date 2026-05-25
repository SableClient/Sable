import { useCallback } from 'react';
import type { MatrixClient } from '$types/matrix-sdk';
import { useMediaUrlCacheContext } from './useMediaUrlCacheContext';

/**
 * Returns a memoized MXC URL converter that uses the in-memory cache.
 * This prevents redundant mxcUrlToHttp conversions for avatars, emoji, stickers, etc.
 *
 * Usage:
 * ```tsx
 * const convertMxc = useCachedMxcConverter();
 * const avatarUrl = useMemo(() =>
 *   mxcUrl ? convertMxc(mx, mxcUrl, useAuth, 96, 96, 'crop') : undefined,
 *   [convertMxc, mx, mxcUrl, useAuth]
 * );
 * ```
 */
export const useCachedMxcConverter = () => {
  const cache = useMediaUrlCacheContext();

  return useCallback(
    (
      mx: MatrixClient,
      mxcUrl: string,
      useAuthentication = false,
      width?: number,
      height?: number,
      resizeMethod?: string,
      allowDirectLinks?: boolean
    ): string | null => {
      return cache.get(mx, mxcUrl, useAuthentication, width, height, resizeMethod, allowDirectLinks);
    },
    [cache]
  );
};
