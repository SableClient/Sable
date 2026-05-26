import type { ReactNode } from 'react';
import { useCallback, useEffect } from 'react';
import type { IThumbnailContent } from '$types/matrix/common';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaUrlCacheContext } from '$hooks/useMediaUrlCacheContext';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { decryptFile, downloadEncryptedMedia } from '$utils/matrix';
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

  const [thumbSrcState, loadThumbSrc] = useAsyncCallback(
    useCallback(async () => {
      const thumbInfo = info.thumbnail_info;
      const thumbMxcUrl = info.thumbnail_file?.url ?? info.thumbnail_url;
      const encInfo = info.thumbnail_file;
      if (typeof thumbMxcUrl !== 'string' || typeof thumbInfo?.mimetype !== 'string') {
        throw new Error('Failed to load thumbnail');
      }

      const mediaUrl = mediaUrlCache.get(mx, thumbMxcUrl, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      if (encInfo) {
        // Check blob cache first
        const cachedBlob = mediaUrlCache.getBlob(thumbMxcUrl, true, thumbInfo.mimetype);
        if (cachedBlob) return cachedBlob;

        const fileContent = await downloadEncryptedMedia(
          mediaUrl,
          (encBuf) => decryptFile(encBuf, thumbInfo.mimetype ?? FALLBACK_MIMETYPE, encInfo),
          mx.getAccessToken()
        );
        const blobUrl = URL.createObjectURL(fileContent);
        mediaUrlCache.setBlob(thumbMxcUrl, true, blobUrl, thumbInfo.mimetype);
        return blobUrl;
      }

      return mediaUrl;
    }, [mx, info, useAuthentication, mediaUrlCache])
  );

  useEffect(() => {
    loadThumbSrc();
  }, [loadThumbSrc]);

  return thumbSrcState.status === AsyncStatus.Success ? renderImage(thumbSrcState.data) : null;
}
