import type { GifData } from '$components/emoji-board/types';

export const GIF_PROVIDER_IDS = ['klipy', 'tenor', 'giphy'] as const;

export type GifProviderId = (typeof GIF_PROVIDER_IDS)[number];

export type GifsConfig = {
  provider?: GifProviderId;
  proxyUrl?: string;
  klipyApiKey?: string;
  tenorApiKey?: string;
  giphyApiKey?: string;
};

export type GifProvider = {
  id: GifProviderId;
  label: string;
  searchHost: string;
  getApiKey: (config: GifsConfig) => string | undefined;
  buildSearchUrl: (apiKey: string, query: string) => string;
  parseResults: (payload: unknown) => GifData[];
  isMediaUrlAllowed: (url: URL) => boolean;
  getProxyPayload: (url: URL, gif: GifData) => string | undefined;
  proxyMimetype: string;
};

const RESULT_LIMIT = 50; // TODO: infinite scroll?

const SIZE_LIMIT = 3 * 1024 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const toPositiveInt = (value: unknown): number | undefined => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : undefined;
};

const idBeforeFilename = (url: URL): string | undefined =>
  url.pathname.split('/').filter(Boolean).at(-2);

const isPlainHttpsUrl = (url: URL): boolean =>
  url.protocol === 'https:' && url.port === '' && url.username === '' && url.password === '';

type GifFile = {
  url: string;
  width?: number;
  height?: number;
  size?: number;
};

const toGifFile = (
  url: unknown,
  width: unknown,
  height: unknown,
  size: unknown
): GifFile | undefined =>
  typeof url === 'string' && url
    ? {
        url,
        width: toPositiveInt(width),
        height: toPositiveInt(height),
        size: toPositiveInt(size),
      }
    : undefined;

/** Full resolution, dropped to a smaller rendition when it would be too large to send. */
const pickFullRes = (candidates: (GifFile | undefined)[]): GifFile | undefined => {
  const available = candidates.filter((file): file is GifFile => !!file);
  return (
    available.find((file) => !file.size || file.size <= SIZE_LIMIT) ??
    available[available.length - 1]
  );
};

const toGifData = (
  id: string,
  title: string,
  shareUrl: string,
  fullRes: GifFile | undefined,
  preview: GifFile | undefined
): GifData => ({
  id,
  title: title || 'GIF',
  shareUrl: shareUrl || fullRes?.url || '',
  mediaUrl: fullRes?.url ?? '',
  preview_url: preview?.url ?? fullRes?.url ?? '',
  width: fullRes?.width ?? preview?.width ?? 0,
  height: fullRes?.height ?? preview?.height ?? 0,
  size: fullRes?.size ?? preview?.size ?? 0,
  mimetype: 'image/gif',
});

/** Klipy serves each size as a bag of encodings; we only ever want the gif. */
const parseKlipyFormat = (format: unknown): GifFile | undefined => {
  if (!isRecord(format) || !isRecord(format.gif)) return undefined;
  const { gif } = format;
  return toGifFile(gif.url, gif.width, gif.height, gif.size);
};

const parseKlipyResults = (payload: unknown): GifData[] => {
  const outer = isRecord(payload) ? payload.data : undefined;
  const results = isRecord(outer) ? outer.data : undefined;
  if (!Array.isArray(results)) return [];

  return results.filter(isRecord).map((result) => {
    const formats = isRecord(result.file) ? result.file : {};
    const preview =
      parseKlipyFormat(formats.xs) ?? parseKlipyFormat(formats.sm) ?? parseKlipyFormat(formats.md);
    const fullRes = pickFullRes([
      parseKlipyFormat(formats.hd),
      parseKlipyFormat(formats.md),
      preview,
    ]);
    const id =
      typeof result.id === 'string' || typeof result.id === 'number' ? String(result.id) : '';
    const shareUrl =
      typeof result.slug === 'string' && result.slug
        ? `https://klipy.com/gifs/${encodeURIComponent(result.slug)}`
        : '';

    return toGifData(
      id,
      typeof result.title === 'string' ? result.title : '',
      shareUrl,
      fullRes,
      preview
    );
  });
};

const parseTenorFormat = (formats: Record<string, unknown>, key: string): GifFile | undefined => {
  const format = formats[key];
  if (!isRecord(format)) return undefined;
  const dims = Array.isArray(format.dims) ? format.dims : [];
  return toGifFile(format.url, dims[0], dims[1], format.size);
};

const parseTenorResults = (payload: unknown): GifData[] => {
  const results = isRecord(payload) ? payload.results : undefined;
  if (!Array.isArray(results)) return [];

  return results.filter(isRecord).map((result) => {
    const formats = isRecord(result.media_formats) ? result.media_formats : {};
    const preview = parseTenorFormat(formats, 'tinygif') ?? parseTenorFormat(formats, 'nanogif');
    const fullRes = pickFullRes([
      parseTenorFormat(formats, 'gif'),
      parseTenorFormat(formats, 'mediumgif'),
      preview,
    ]);
    const title =
      (typeof result.content_description === 'string' && result.content_description) ||
      (typeof result.title === 'string' ? result.title : '');

    return toGifData(
      typeof result.id === 'string' ? result.id : '',
      title,
      typeof result.itemurl === 'string' ? result.itemurl : '',
      fullRes,
      preview
    );
  });
};

const parseGiphyRendition = (images: Record<string, unknown>, key: string): GifFile | undefined => {
  const rendition = images[key];
  if (!isRecord(rendition)) return undefined;
  return toGifFile(rendition.url, rendition.width, rendition.height, rendition.size);
};

const parseGiphyResults = (payload: unknown): GifData[] => {
  const results = isRecord(payload) ? payload.data : undefined;
  if (!Array.isArray(results)) return [];

  return results.filter(isRecord).map((result) => {
    const images = isRecord(result.images) ? result.images : {};
    const preview =
      parseGiphyRendition(images, 'fixed_width') ?? parseGiphyRendition(images, 'preview_gif');
    const fullRes =
      parseGiphyRendition(images, 'original') ??
      parseGiphyRendition(images, 'downsized') ??
      preview;

    return toGifData(
      typeof result.id === 'string' ? result.id : '',
      typeof result.title === 'string' ? result.title : '',
      typeof result.url === 'string' ? result.url : '',
      fullRes,
      preview
    );
  });
};

export const GIF_PROVIDERS: Record<GifProviderId, GifProvider> = {
  klipy: {
    id: 'klipy',
    label: 'Klipy',
    searchHost: 'klipy.com',
    getApiKey: (config) => config.klipyApiKey,
    buildSearchUrl: (apiKey, query) => {
      const url = new URL(`https://api.klipy.com/api/v1/${encodeURIComponent(apiKey)}/gifs/search`);
      url.searchParams.set('q', query);
      url.searchParams.set('per_page', String(RESULT_LIMIT));
      return url.toString();
    },
    parseResults: parseKlipyResults,
    isMediaUrlAllowed: (url) =>
      isPlainHttpsUrl(url) && url.hostname === 'static.klipy.com' && /^\/ii\/.+/.test(url.pathname),
    getProxyPayload: (url) => url.pathname.slice('/ii/'.length) || undefined,
    proxyMimetype: 'image/gif',
  },
  tenor: {
    id: 'tenor',
    label: 'Tenor',
    searchHost: 'tenor.googleapis.com',
    getApiKey: (config) => config.tenorApiKey,
    buildSearchUrl: (apiKey, query) => {
      const url = new URL('https://tenor.googleapis.com/v2/search');
      url.searchParams.set('key', apiKey);
      url.searchParams.set('client_key', 'tenor_web');
      url.searchParams.set('q', query);
      url.searchParams.set('limit', String(RESULT_LIMIT));
      url.searchParams.set('media_filter', 'gif,mediumgif,tinygif,nanogif');
      return url.toString();
    },
    parseResults: parseTenorResults,
    isMediaUrlAllowed: (url) =>
      isPlainHttpsUrl(url) && /^(?:c|media\d*)\.tenor\.com$/.test(url.hostname),
    getProxyPayload: (url) => idBeforeFilename(url),
    proxyMimetype: 'image/gif',
  },
  giphy: {
    id: 'giphy',
    label: 'Giphy',
    searchHost: 'giphy.com',
    getApiKey: (config) => config.giphyApiKey,
    buildSearchUrl: (apiKey, query) => {
      const url = new URL('https://api.giphy.com/v1/gifs/search');
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('q', query);
      url.searchParams.set('limit', String(RESULT_LIMIT));
      return url.toString();
    },
    parseResults: parseGiphyResults,
    isMediaUrlAllowed: (url) =>
      isPlainHttpsUrl(url) && /^(?:i|media\d*)\.giphy\.com$/.test(url.hostname),
    getProxyPayload: (url, gif) => gif.id || idBeforeFilename(url),
    proxyMimetype: 'image/webp',
  },
};

export const DEFAULT_GIF_PROVIDER_ID: GifProviderId = 'tenor';

export type GifProviderSetting = GifProviderId | 'default';

const configuredProvider = (config: GifsConfig | undefined): GifProvider => {
  const id = config?.provider;
  return (id && GIF_PROVIDERS[id]) || GIF_PROVIDERS[DEFAULT_GIF_PROVIDER_ID];
};

export const getGifProvider = (
  config: GifsConfig | undefined,
  override: GifProviderSetting = 'default'
): GifProvider => {
  const picked = override === 'default' ? undefined : GIF_PROVIDERS[override];
  // A provider without a key cannot search, so keep the configured one.
  return picked?.getApiKey(config ?? {}) ? picked : configuredProvider(config);
};

export const getGifProviderOptions = (
  config: GifsConfig | undefined
): { value: GifProviderSetting; label: string; disabled?: boolean }[] => [
  { value: 'default', label: `Client Default (${configuredProvider(config).label})` },
  ...GIF_PROVIDER_IDS.map((id) => ({
    value: id,
    label: GIF_PROVIDERS[id].getApiKey(config ?? {})
      ? GIF_PROVIDERS[id].label
      : `${GIF_PROVIDERS[id].label} (no API key)`,
    disabled: !GIF_PROVIDERS[id].getApiKey(config ?? {}),
  })),
];

const toBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll(/=+$/g, '');
};

export type ProxiedGif = { mxcUrl: string; mimetype: string };

export const getProxiedGif = (gif: GifData, proxyUrl?: string): ProxiedGif | undefined => {
  if (!proxyUrl?.trim()) return undefined;

  let url: URL;
  try {
    url = new URL(gif.mediaUrl);
  } catch {
    return undefined;
  }

  const provider = Object.values(GIF_PROVIDERS).find((candidate) =>
    candidate.isMediaUrlAllowed(url)
  );
  const payload = provider?.getProxyPayload(url, gif);
  if (!provider || !payload) return undefined;

  return {
    mxcUrl: `mxc://${proxyUrl.trim()}/${provider.id}_${toBase64Url(payload)}`,
    mimetype: provider.proxyMimetype,
  };
};

export const isAllowedGifMediaUrl = (value: string | URL): boolean => {
  try {
    const url = typeof value === 'string' ? new URL(value) : value;
    return Object.values(GIF_PROVIDERS).some((provider) => provider.isMediaUrlAllowed(url));
  } catch {
    return false;
  }
};
