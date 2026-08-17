export type ExternalGifContent = {
  v: 1;
  provider: string;
  media_url: string;
  w: number;
  h: number;
  mimetype?: string;
  size?: number;
  blurhash?: string;
  id?: string;
  title?: string;
};

export type ExternalGif = ExternalGifContent;

export type ExternalGifProvider = {
  id: string;
  isMediaUrlAllowed: (url: URL) => boolean;
};

const MAX_DIMENSION = 8192;
const externalGifProviders: Record<string, ExternalGifProvider> = {
  klipy: {
    id: 'klipy',
    isMediaUrlAllowed: (url) =>
      url.protocol === 'https:' &&
      url.hostname === 'static.klipy.com' &&
      url.port === '' &&
      url.username === '' &&
      url.password === '' &&
      /^\/ii\/.+/.test(url.pathname),
  },
};

export function isAllowedKlipyMediaUrl(value: string | URL): boolean {
  try {
    const url = typeof value === 'string' ? new URL(value) : value;
    return externalGifProviders.klipy?.isMediaUrlAllowed(url) === true;
  } catch {
    return false;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const isValidExternalGifDimension = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= MAX_DIMENSION;

export function parseExternalGif(content: unknown): ExternalGif | undefined {
  if (!isRecord(content) || content.msgtype !== 'm.text') return undefined;
  const raw = content['pet.plz.gif'];
  if (!isRecord(raw) || raw.v !== 1 || typeof raw.provider !== 'string') return undefined;

  const provider = Object.prototype.hasOwnProperty.call(externalGifProviders, raw.provider)
    ? externalGifProviders[raw.provider]
    : undefined;
  if (
    !provider ||
    typeof raw.media_url !== 'string' ||
    !isValidExternalGifDimension(raw.w) ||
    !isValidExternalGifDimension(raw.h)
  ) {
    return undefined;
  }
  let mediaUrl: URL;
  try {
    mediaUrl = new URL(raw.media_url);
  } catch {
    return undefined;
  }
  if (!provider.isMediaUrlAllowed(mediaUrl)) return undefined;

  return {
    v: 1,
    provider: provider.id,
    media_url: raw.media_url,
    w: raw.w,
    h: raw.h,
    ...(typeof raw.mimetype === 'string' ? { mimetype: raw.mimetype } : {}),
    ...(typeof raw.size === 'number' && Number.isSafeInteger(raw.size) && raw.size >= 0
      ? { size: raw.size }
      : {}),
    ...(typeof raw.blurhash === 'string' ? { blurhash: raw.blurhash } : {}),
    ...(typeof raw.id === 'string' ? { id: raw.id } : {}),
    ...(typeof raw.title === 'string' ? { title: raw.title } : {}),
  };
}
