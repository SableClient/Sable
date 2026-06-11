import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import type { IThumbnailContent } from '$types/matrix/common';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaUrlCacheContext } from '$hooks/useMediaUrlCacheContext';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import {
  decryptFileSafe,
  downloadEncryptedMedia,
  downloadMedia,
  mxcUrlToHttp,
} from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { FALLBACK_MIMETYPE } from '$utils/mimeTypes';

export type ThumbnailContentProps = {
  info: IThumbnailContent;
  renderImage: (src: string) => ReactNode;
};
export function ThumbnailContent({ info, renderImage }: ThumbnailContentProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const mediaUrlCache = useMediaUrlCacheContext();

  const encInfo = info.thumbnail_file;
  const thumbMxcUrl = encInfo?.url ?? info.thumbnail_url;

  const rawMediaUrl = useMemo(() => {
    if (typeof thumbMxcUrl !== 'string') return undefined;
    return mxcUrlToHttp(mx, thumbMxcUrl, useAuthentication) ?? undefined;
  }, [mx, thumbMxcUrl, useAuthentication]);

  const [thumbSrcState, loadThumbSrc] = useAsyncCallback(
    useCallback(async () => {
      const thumbInfo = info.thumbnail_info;
      if (typeof thumbMxcUrl !== 'string' || typeof thumbInfo?.mimetype !== 'string') {
        return null;
      }
      if (encInfo) {
        if (!rawMediaUrl) return null;

        // Check blob cache first
        const cachedBlob = mediaUrlCache.getBlob(thumbMxcUrl, true, thumbInfo.mimetype);
        if (cachedBlob) return cachedBlob;

        try {
          const fileContent = await downloadEncryptedMedia(
            rawMediaUrl,
            (encBuf) =>
              decryptFileSafe(encBuf, thumbInfo.mimetype ?? FALLBACK_MIMETYPE, encInfo, {
                mediaUrl: rawMediaUrl,
              }),
            mx.getAccessToken()
          );
          const blobUrl = URL.createObjectURL(fileContent);
          mediaUrlCache.setBlob(thumbMxcUrl, true, blobUrl, thumbInfo.mimetype);
          return blobUrl;
        } catch {
          // Network-level media fetch failed (timeout, 404, 401, etc.).
          // Return null so the component renders nothing instead of propagating to error boundary.
          return null;
        }
      }
      if (!rawMediaUrl) return null;

      const cachedBlob = mediaUrlCache.getBlob(thumbMxcUrl, false, thumbInfo.mimetype);
      if (cachedBlob) return cachedBlob;

      try {
        const fileContent = await downloadMedia(rawMediaUrl, mx.getAccessToken());
        const blobUrl = URL.createObjectURL(fileContent);
        mediaUrlCache.setBlob(thumbMxcUrl, false, blobUrl, thumbInfo.mimetype);
        return blobUrl;
      } catch {
        return null;
      }
    }, [encInfo, info.thumbnail_info, mediaUrlCache, mx, rawMediaUrl, thumbMxcUrl])
  );

  useEffect(() => {
    loadThumbSrc();
  }, [loadThumbSrc]);

  return thumbSrcState.status === AsyncStatus.Success && thumbSrcState.data
    ? renderImage(thumbSrcState.data)
    : null;
}
