import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { Box, Spinner } from 'folds';
import type { IThumbnailContent } from '$types/matrix/common';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import {
  decryptFile,
  downloadEncryptedMedia,
  mxcUrlToHttp,
  rewriteAuthenticatedMediaUrl,
} from '$utils/matrix';
import { prepareLoopbackImageSource } from '$utils/mediaUrl';
import { setMediaEncryption } from '$utils/tauriMediaEncryption';
import { isTauri } from '@tauri-apps/api/core';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useRenderableMediaUrl } from '$hooks/useRenderableMediaUrl';
import { useCreateObjectURL } from '$hooks/useObjectURL';
import { FALLBACK_MIMETYPE } from '$utils/mimeTypes';

export type ThumbnailContentProps = {
  info: IThumbnailContent;
  renderImage: (src: string) => ReactNode;
};
export function ThumbnailContent({ info, renderImage }: ThumbnailContentProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const encInfo = info.thumbnail_file;
  const thumbMxcUrl = encInfo?.url ?? info.thumbnail_url;

  const rawMediaUrl = useMemo(() => {
    if (typeof thumbMxcUrl !== 'string') return undefined;
    return mxcUrlToHttp(mx, thumbMxcUrl, useAuthentication) ?? undefined;
  }, [mx, thumbMxcUrl, useAuthentication]);

  const tauri = isTauri();
  // Tauri resolves the source inside `loadThumbSrc` instead.
  const resolvedMediaUrl = useRenderableMediaUrl(encInfo || tauri ? undefined : rawMediaUrl);

  const createObjectURL = useCreateObjectURL();

  const [thumbSrcState, loadThumbSrc] = useAsyncCallback(
    useCallback(async () => {
      const thumbInfo = info.thumbnail_info;
      // Only the URL is required: `mimetype` is a decryption hint that already falls back,
      // and other clients routinely omit it.
      if (typeof thumbMxcUrl !== 'string') {
        throw new Error('Failed to load thumbnail');
      }
      if (encInfo) {
        if (!rawMediaUrl) throw new Error('Invalid media URL');
        if (tauri) {
          await setMediaEncryption(rawMediaUrl, encInfo, thumbInfo?.mimetype ?? FALLBACK_MIMETYPE);
          return rewriteAuthenticatedMediaUrl(rawMediaUrl)!;
        }
        return createObjectURL(
          downloadEncryptedMedia(rawMediaUrl, (encBuf) =>
            decryptFile(encBuf, thumbInfo?.mimetype ?? FALLBACK_MIMETYPE, encInfo)
          )
        );
      }
      if (tauri && rawMediaUrl) return prepareLoopbackImageSource(rawMediaUrl);
      return resolvedMediaUrl ?? rawMediaUrl ?? thumbMxcUrl;
    }, [info, thumbMxcUrl, rawMediaUrl, resolvedMediaUrl, tauri, encInfo, createObjectURL])
  );

  useEffect(() => {
    // The failure is already reflected in `thumbSrcState`; swallow the rejection so it
    // does not surface as an unhandled promise rejection.
    loadThumbSrc().catch(() => undefined);
  }, [loadThumbSrc]);

  if (thumbSrcState.status === AsyncStatus.Success) return renderImage(thumbSrcState.data);

  if (thumbSrcState.status === AsyncStatus.Loading) {
    return (
      <Box alignItems="Center" justifyContent="Center">
        <Spinner variant="Secondary" />
      </Box>
    );
  }

  return null;
}
