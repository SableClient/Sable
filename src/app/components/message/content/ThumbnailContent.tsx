import { ReactNode, useCallback, useEffect, useMemo } from 'react';
import { IThumbnailContent } from '$types/matrix/common';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaUrlCacheContext } from '$hooks/useMediaUrlCacheContext';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { decryptFileSafe, downloadEncryptedMedia } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useRenderableMediaUrl } from '$hooks/useRenderableMediaUrl';
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

  const resolvedMediaUrl = useRenderableMediaUrl(encInfo ? undefined : rawMediaUrl);

  const [thumbSrcState, loadThumbSrc] = useAsyncCallback(
    useCallback(async () => {
      const thumbInfo = info.thumbnail_info;
      if (typeof thumbMxcUrl !== 'string' || typeof thumbInfo?.mimetype !== 'string') {
        return null;
      }
      if (encInfo) {
        // Check blob cache first
        const cachedBlob = mediaUrlCache.getBlob(thumbMxcUrl, true, thumbInfo.mimetype);
        if (cachedBlob) return cachedBlob;

        try {
          const fileContent = await downloadEncryptedMedia(
            mediaUrl,
            (encBuf) =>
              decryptFileSafe(encBuf, thumbInfo.mimetype ?? FALLBACK_MIMETYPE, encInfo, {
                mediaUrl,
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
      return resolvedMediaUrl ?? rawMediaUrl ?? thumbMxcUrl;
    }, [info, thumbMxcUrl, rawMediaUrl, resolvedMediaUrl, encInfo])
  );

  useEffect(() => {
    loadThumbSrc();
  }, [loadThumbSrc]);

  return thumbSrcState.status === AsyncStatus.Success && thumbSrcState.data
    ? renderImage(thumbSrcState.data)
    : null;
}
