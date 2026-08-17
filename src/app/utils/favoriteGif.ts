import type { GifData } from '$components/emoji-board/types';
import type { IImageInfo } from '$types/matrix/common';
import { MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME } from '$unstable/prefixes';
import { parseExternalGif } from './externalGif';
import { parseLegacyKlipyGif } from './klipy';

const getIncomingMediaMxcUrl = (url: unknown): string | undefined =>
  typeof url === 'string' && url.startsWith('mxc://') ? url : undefined;

export const getFavoriteGifFromMessageContent = (
  content: Record<string, unknown>
): Omit<GifData, 'id'> | undefined => {
  const externalGif = parseExternalGif(content);
  const legacyGif = externalGif ? undefined : parseLegacyKlipyGif(content);
  const gif = externalGif ?? legacyGif;
  if (gif) {
    return {
      title: gif.title ?? '',
      shareUrl: externalGif && typeof content.body === 'string' ? content.body : gif.media_url,
      mediaUrl: gif.media_url,
      width: gif.w,
      height: gif.h,
      ...(gif.size !== undefined ? { size: gif.size } : {}),
      ...(gif.mimetype ? { mimetype: gif.mimetype } : {}),
      ...(gif.blurhash ? { blurhash: gif.blurhash } : {}),
    };
  }

  const file = content.file;
  const fileUrl =
    file && typeof file === 'object' && !Array.isArray(file)
      ? (file as { url?: unknown }).url
      : undefined;
  const url = getIncomingMediaMxcUrl(fileUrl ?? content.url);
  if (!url) return undefined;
  const info = content.info as IImageInfo | undefined;
  return {
    title: typeof content.body === 'string' ? content.body : '',
    shareUrl: url,
    mediaUrl: url,
    ...(info?.w !== undefined ? { width: info.w } : {}),
    ...(info?.h !== undefined ? { height: info.h } : {}),
    ...(info?.size !== undefined ? { size: info.size } : {}),
    ...(info?.mimetype ? { mimetype: info.mimetype } : {}),
    ...(info?.[MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME]
      ? { blurhash: info[MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME] }
      : {}),
  };
};
