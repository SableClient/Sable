import type { ReactNode } from 'react';
import { useCallback, useEffect } from 'react';
import type { IThumbnailContent } from '$types/matrix/common';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { decryptFileSafe, downloadEncryptedMedia } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { FALLBACK_MIMETYPE } from '$utils/mimeTypes';

export type ThumbnailContentProps = {
  info: IThumbnailContent;
  renderImage: (src: string) => ReactNode;
};
export function ThumbnailContent({ info, renderImage }: ThumbnailContentProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [thumbSrcState, loadThumbSrc] = useAsyncCallback(
    useCallback(async () => {
      const thumbInfo = info.thumbnail_info;
      const thumbMxcUrl = info.thumbnail_file?.url ?? info.thumbnail_url;
      const encInfo = info.thumbnail_file;
      if (typeof thumbMxcUrl !== 'string' || typeof thumbInfo?.mimetype !== 'string') {
        throw new Error('Failed to load thumbnail');
      }

      const mediaUrl = mxcUrlToHttp(mx, thumbMxcUrl, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
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

      return mediaUrl;
    }, [mx, info, useAuthentication])
  );

  useEffect(() => {
    loadThumbSrc();
  }, [loadThumbSrc]);

  return thumbSrcState.status === AsyncStatus.Success ? renderImage(thumbSrcState.data) : null;
}
