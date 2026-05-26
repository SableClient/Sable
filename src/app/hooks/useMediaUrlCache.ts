import { useRef, useEffect } from 'react';
import type { MatrixClient } from '$types/matrix-sdk';

/**
 * In-memory cache for converted MXC URLs and blob URLs to prevent redundant conversions/downloads.
 * Cache key format: `{mxcUrl}|{useAuth}|{width}x{height}|{method}`
 * Blob cache key format: `blob:{mxcUrl}|{encrypted}`
 *
 * Fixes SABLE-2: N+1 media thumbnail requests (336+ individual GET requests)
 * Fixes SABLE-3H: N+1 blob URL fetches (9+ repeated downloads for encrypted content)
 */
type CacheKey = string;
type CachedUrl = string | null;

const createCacheKey = (
  mxcUrl: string,
  useAuthentication: boolean,
  width?: number,
  height?: number,
  resizeMethod?: string
): CacheKey => {
  const dims = width !== undefined && height !== undefined ? `${width}x${height}` : 'original';
  const method = resizeMethod ?? 'scale';
  return `${mxcUrl}|${useAuthentication ? 'auth' : 'noauth'}|${dims}|${method}`;
};

const createBlobCacheKey = (mxcUrl: string, isEncrypted: boolean, params?: string): CacheKey => {
  const extra = params ?? '';
  return `blob:${mxcUrl}|${isEncrypted ? 'enc' : 'plain'}|${extra}`;
};

export const useMediaUrlCache = () => {
  const cacheRef = useRef<Map<CacheKey, CachedUrl>>(new Map());
  const blobUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Cleanup blob URLs on unmount
    const blobUrls = blobUrlsRef.current;
    const cache = cacheRef.current;
    return () => {
      blobUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      blobUrls.clear();
      cache.clear();
    };
  }, []);

  return {
    get: (
      mx: MatrixClient,
      mxcUrl: string,
      useAuthentication: boolean,
      width?: number,
      height?: number,
      resizeMethod?: string,
      allowDirectLinks?: boolean
    ): string | null => {
      const key = createCacheKey(mxcUrl, useAuthentication, width, height, resizeMethod);
      const cached = cacheRef.current.get(key);
      if (cached !== undefined) {
        return cached;
      }

      // Convert and cache
      const httpUrl = mx.mxcUrlToHttp(
        mxcUrl.replace(/^["']|["']$/g, ''),
        width,
        height,
        resizeMethod,
        allowDirectLinks,
        undefined,
        useAuthentication
      );

      cacheRef.current.set(key, httpUrl);
      return httpUrl;
    },

    getBlob: (mxcUrl: string, isEncrypted: boolean, params?: string): string | undefined => {
      const key = createBlobCacheKey(mxcUrl, isEncrypted, params);
      return cacheRef.current.get(key) ?? undefined;
    },

    setBlob: (mxcUrl: string, isEncrypted: boolean, blobUrl: string, params?: string): void => {
      const key = createBlobCacheKey(mxcUrl, isEncrypted, params);
      cacheRef.current.set(key, blobUrl);
      blobUrlsRef.current.add(blobUrl);
    },

    clear: () => {
      blobUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      blobUrlsRef.current.clear();
      cacheRef.current.clear();
    },
  };
};
