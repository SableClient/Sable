import { ReactNode, useCallback, useEffect, useMemo } from 'react';
import { IThumbnailContent } from '$types/matrix/common';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { decryptFile, downloadEncryptedMedia, mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useMediaSrc, useMediaDownloadToken } from '$hooks/useMediaSrc';
import { FALLBACK_MIMETYPE } from '$utils/mimeTypes';

export type ThumbnailContentProps = {
  info: IThumbnailContent;
  renderImage: (src: string) => ReactNode;
};
export function ThumbnailContent({ info, renderImage }: ThumbnailContentProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const mediaToken = useMediaDownloadToken();

  const encInfo = info.thumbnail_file;
  const thumbMxcUrl = encInfo?.url ?? info.thumbnail_url;

  const rawMediaUrl = useMemo(() => {
    if (typeof thumbMxcUrl !== 'string') return undefined;
    return mxcUrlToHttp(mx, thumbMxcUrl, useAuthentication) ?? undefined;
  }, [mx, thumbMxcUrl, useAuthentication]);

  const resolvedMediaUrl = useMediaSrc(encInfo ? undefined : rawMediaUrl);

  const [thumbSrcState, loadThumbSrc] = useAsyncCallback(
    useCallback(async () => {
      const thumbInfo = info.thumbnail_info;
      if (typeof thumbMxcUrl !== 'string' || typeof thumbInfo?.mimetype !== 'string') {
        throw new Error('Failed to load thumbnail');
      }
      if (encInfo) {
        if (!rawMediaUrl) throw new Error('Invalid media URL');
        const fileContent = await downloadEncryptedMedia(
          rawMediaUrl,
          (encBuf) => decryptFile(encBuf, thumbInfo.mimetype ?? FALLBACK_MIMETYPE, encInfo),
          mediaToken
        );
        return URL.createObjectURL(fileContent);
      }
      return resolvedMediaUrl ?? rawMediaUrl ?? thumbMxcUrl;
    }, [info, thumbMxcUrl, rawMediaUrl, resolvedMediaUrl, encInfo, mediaToken])
  );

  useEffect(() => {
    loadThumbSrc();
  }, [loadThumbSrc]);

  return thumbSrcState.status === AsyncStatus.Success ? renderImage(thumbSrcState.data) : null;
}
