import { useMemo } from 'react';
import type { AccountDataEvents } from 'matrix-js-sdk';
import type { GifData } from '$components/emoji-board/types';
import { isAllowedKlipyMediaUrl } from '$utils/externalGif';
import { decodeLegacyKlipyMxc } from '$utils/klipy';
import { MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS } from '../../unstable/prefixes';
import { useAccountData } from './useAccountData';

type FavoriteGif = Omit<GifData, 'id'>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isMatrixMediaUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'mxc:' &&
      url.hostname !== '' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname.length > 1 &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
};

const normalizeMediaUrl = (value: string): string | undefined => {
  if (isAllowedKlipyMediaUrl(value)) return value;
  return decodeLegacyKlipyMxc(value) ?? (isMatrixMediaUrl(value) ? value : undefined);
};

export const normalizeFavoriteGifs = (value: unknown): FavoriteGif[] => {
  if (!isRecord(value) || !Array.isArray(value.gifs)) return [];

  const gifs = value.gifs.flatMap((entry): FavoriteGif[] => {
    if (!isRecord(entry)) return [];
    const legacyUrl = typeof entry.url === 'string' ? entry.url : undefined;
    const rawMediaUrl = typeof entry.mediaUrl === 'string' ? entry.mediaUrl : undefined;
    const legacyMediaUrl =
      (rawMediaUrl && decodeLegacyKlipyMxc(rawMediaUrl)) ??
      (legacyUrl && decodeLegacyKlipyMxc(legacyUrl));
    const mediaUrl = rawMediaUrl ? normalizeMediaUrl(rawMediaUrl) : undefined;
    const migratedMediaUrl = mediaUrl ?? (legacyUrl ? normalizeMediaUrl(legacyUrl) : undefined);
    if (!migratedMediaUrl) return [];
    const shareUrl =
      (typeof entry.shareUrl === 'string' && entry.shareUrl
        ? (decodeLegacyKlipyMxc(entry.shareUrl) ?? entry.shareUrl)
        : undefined) ?? migratedMediaUrl;

    return [
      {
        title: typeof entry.title === 'string' ? entry.title : 'GIF',
        shareUrl: legacyMediaUrl ?? shareUrl,
        mediaUrl: migratedMediaUrl,
        ...(typeof entry.width === 'number' ? { width: entry.width } : {}),
        ...(typeof entry.height === 'number' ? { height: entry.height } : {}),
        ...(typeof entry.size === 'number' ? { size: entry.size } : {}),
        ...(typeof entry.mimetype === 'string' ? { mimetype: entry.mimetype } : {}),
        ...(typeof entry.blurhash === 'string' ? { blurhash: entry.blurhash } : {}),
      },
    ];
  });

  return gifs;
};

export const useFavoriteGifs =
  (): AccountDataEvents[typeof MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS] => {
    const favoritedGifsData = useAccountData(MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS);
    const gifs = useMemo(
      () => normalizeFavoriteGifs(favoritedGifsData?.getContent()),
      [favoritedGifsData]
    );

    return { gifs };
  };
