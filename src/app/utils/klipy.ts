import type { ExternalGifContent } from './externalGif';
import { isAllowedKlipyMediaUrl, isValidExternalGifDimension } from './externalGif';
import { MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME } from '$unstable/prefixes';

const LEGACY_MEDIA_PREFIX = 'klipy_';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function decodeBase64Url(value: string): string | undefined {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    return undefined;
  }
}

export function decodeLegacyKlipyMxc(mxcUrl: string): string | undefined {
  try {
    const mxc = new URL(mxcUrl);
    const encoded = mxc.pathname.slice(1);
    if (
      mxc.protocol !== 'mxc:' ||
      mxc.hostname !== 'gifs.sable.moe' ||
      mxc.port !== '' ||
      mxc.username !== '' ||
      mxc.password !== '' ||
      mxc.search !== '' ||
      mxc.hash !== '' ||
      !encoded.startsWith(LEGACY_MEDIA_PREFIX)
    ) {
      return undefined;
    }

    const path = decodeBase64Url(encoded.slice(LEGACY_MEDIA_PREFIX.length));
    const mediaUrl = path ? `https://static.klipy.com/ii/${path}` : undefined;
    return mediaUrl && isAllowedKlipyMediaUrl(mediaUrl) ? mediaUrl : undefined;
  } catch {
    return undefined;
  }
}

export function parseLegacyKlipyGif(content: unknown): ExternalGifContent | undefined {
  if (!isRecord(content) || content.msgtype !== 'm.image') return undefined;

  const file = content.file;
  const mxcUrl =
    typeof content.url === 'string'
      ? content.url
      : isRecord(file) && typeof file.url === 'string'
        ? file.url
        : undefined;
  const mediaUrl = mxcUrl ? decodeLegacyKlipyMxc(mxcUrl) : undefined;
  const info = isRecord(content.info) ? content.info : undefined;
  const width = info?.w;
  const height = info?.h;
  if (!mediaUrl || !isValidExternalGifDimension(width) || !isValidExternalGifDimension(height)) {
    return undefined;
  }

  return {
    v: 1,
    provider: 'klipy',
    media_url: mediaUrl,
    w: width,
    h: height,
    ...(typeof info?.mimetype === 'string' ? { mimetype: info.mimetype } : {}),
    ...(typeof info?.size === 'number' && Number.isSafeInteger(info.size) && info.size >= 0
      ? { size: info.size }
      : {}),
    ...(typeof info?.[MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME] === 'string'
      ? { blurhash: info[MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME] }
      : {}),
    ...(typeof content.body === 'string' ? { title: content.body } : {}),
  };
}

export { isAllowedKlipyMediaUrl };
