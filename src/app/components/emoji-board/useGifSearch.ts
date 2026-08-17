import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AsyncSearchHandler } from '$utils/AsyncSearch';
import { fetch } from '$utils/fetch';
import { useClientConfig } from '$hooks/useClientConfig';
import type { GifData } from './types';

const SIZE_LIMIT = 3 * 1024 * 1024;

type KlipyFile = {
  url?: string;
  width?: number;
  height?: number;
  size?: number;
};

/** Klipy serves each size as a bag of encodings; we only ever want the gif. */
type KlipyFormat = { gif?: KlipyFile };

type KlipyResult = {
  id?: string | number;
  slug?: string;
  title?: string;
  file?: Partial<Record<'xs' | 'sm' | 'md' | 'hd', KlipyFormat>>;
};

type KlipySearchResponse = { data?: { data?: KlipyResult[] } };

const parseKlipyResult = (klipyResult: KlipyResult): GifData => {
  const formats = klipyResult.file ?? {};
  const preview = formats.xs?.gif ?? formats.sm?.gif ?? formats.md?.gif;

  // Full resolution, dropped to medium when it would be too large to send.
  let fullRes = formats.hd?.gif;
  if (fullRes?.size && fullRes.size > SIZE_LIMIT && formats.md?.gif) {
    fullRes = formats.md.gif;
  }
  fullRes ??= formats.md?.gif ?? preview;

  return {
    id: klipyResult.id === undefined ? '' : String(klipyResult.id),
    title: klipyResult.title || 'GIF',
    shareUrl: klipyResult.slug
      ? `https://klipy.com/gifs/${encodeURIComponent(klipyResult.slug)}`
      : (fullRes?.url ?? ''),
    mediaUrl: fullRes?.url ?? '',
    preview_url: preview?.url ?? fullRes?.url ?? '',
    width: fullRes?.width ?? preview?.width ?? 0,
    height: fullRes?.height ?? preview?.height ?? 0,
    size: fullRes?.size ?? preview?.size ?? 0,
    mimetype: 'image/gif',
  };
};

export function useGifSearch(
  favoriteGifs: GifData[],
  showGifPicker: boolean,
  gifSearch: AsyncSearchHandler
) {
  const [searchResults, setSearchResults] = useState<GifData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientConfig = useClientConfig();
  const klipyApiKey = clientConfig.gifs?.klipyApiKey ?? '';
  const requestGenerationRef = useRef(0);
  const abortControllerRef = useRef<AbortController>();
  const mountedRef = useRef(true);
  const showGifPickerRef = useRef(showGifPicker);
  showGifPickerRef.current = showGifPicker;

  const cancelRequest = useCallback(() => {
    requestGenerationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = undefined;
  }, []);

  const cancelSearch = useCallback(() => {
    cancelRequest();
    if (mountedRef.current) setLoading(false);
  }, [cancelRequest]);

  const searchGifs = useCallback(
    async (query: string) => {
      if (!mountedRef.current || !showGifPickerRef.current) {
        return;
      }

      const trimmedQuery = query.trim();
      cancelRequest();
      const generation = requestGenerationRef.current;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);

      gifSearch(trimmedQuery);

      try {
        const url = new URL('https://api.klipy.com');
        url.pathname = `/api/v1/${klipyApiKey}/gifs/search`;
        url.searchParams.set('q', trimmedQuery);
        url.searchParams.set('per_page', '50'); // TODO: infinite scroll?

        const response = await fetch(url.toString(), { signal: controller.signal });

        if (response.status === 200) {
          const data = (await response.json()) as KlipySearchResponse;
          const results = data.data?.data;

          if (generation === requestGenerationRef.current && mountedRef.current) {
            setSearchResults(results ? results.map(parseKlipyResult) : []);
          }
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch {
        if (generation === requestGenerationRef.current && mountedRef.current) {
          setError('Failed to search GIFs');
          setSearchResults([]);
        }
      } finally {
        if (generation === requestGenerationRef.current && mountedRef.current) {
          abortControllerRef.current = undefined;
          setLoading(false);
        }
      }
    },
    [cancelRequest, klipyApiKey, gifSearch]
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      cancelRequest();
    };
  }, [cancelRequest]);

  useEffect(() => {
    if (!showGifPicker) cancelSearch();
  }, [cancelSearch, showGifPicker]);

  const gifs = useMemo(
    () => ({ gifs: searchResults, favorites: favoriteGifs }),
    [searchResults, favoriteGifs]
  );

  return { gifs, loading, error, searchGifs, cancelSearch };
}
