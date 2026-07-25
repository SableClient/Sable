import { useCallback, useState } from 'react';
import type { AsyncSearchHandler } from '$utils/AsyncSearch';
import { fetch } from '$utils/fetch';
import { useClientConfig } from '$hooks/useClientConfig';
import type { GifData } from './types';

/* oxlint-disable typescript/no-explicit-any */
// TODO: type klipy api properly

const SIZE_LIMIT = 3 * 1024 * 1024;

const parseKlipyResult = (klipyResult: any): GifData => {
  const formats = klipyResult.file || {};
  const preview = formats.xs.gif || formats.sm.gif || formats.md.gif;

  // Start with full resolution GIF
  let fullRes = formats.hd.gif;
  // If full res is too large and medium exists, use medium instead
  if (fullRes && fullRes.size > SIZE_LIMIT && formats.md) {
    fullRes = formats.md.gif;
  }

  // Fallback if no suitable format found
  if (!fullRes) {
    fullRes = formats.md || preview;
  }

  // Get dimensions from the selected full resolution format
  const width = fullRes?.width || preview?.width || 0;
  const height = fullRes?.height || preview?.height || 0;

  return {
    id: klipyResult.id,
    title: klipyResult.title || 'GIF',
    url: fullRes?.url || '',
    preview_url: preview?.url || fullRes?.url || '',
    width,
    height,
    size: fullRes?.size || preview?.size || 0,
    mimetype: 'image/gif',
  };
};

export function useGifSearch(
  favoriteGifs: GifData[],
  showGifPicker: boolean,
  gifSearch: AsyncSearchHandler
) {
  const [gifs, setGifs] = useState<{ gifs: GifData[]; favorites: GifData[] }>({
    gifs: [],
    favorites: favoriteGifs,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientConfig = useClientConfig();
  const klipyApiKey = clientConfig.gifs?.klipyApiKey ?? '';

  const searchGifs = useCallback(
    async (query: string) => {
      if (!showGifPicker) {
        return;
      }

      const trimmedQuery = query.trim();

      setLoading(true);
      setError(null);

      gifSearch(trimmedQuery);

      try {
        const url = new URL('https://api.klipy.com');
        url.pathname = `/api/v1/${klipyApiKey}/gifs/search`;
        url.searchParams.set('q', trimmedQuery);
        url.searchParams.set('per_page', '50'); // TODO: infinite scroll?

        const response = await fetch(url.toString());

        if (response.status === 200) {
          const data = await response.json();
          const results = data.data.data as any[] | undefined;

          setGifs((old) => ({
            ...old,
            gifs: results ? results.map(parseKlipyResult) : [],
          }));
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch {
        setError('Failed to search GIFs');
        setGifs((old) => ({
          ...old,
          gifs: [],
        }));
      } finally {
        setLoading(false);
      }
    },
    [klipyApiKey, showGifPicker, gifSearch]
  );

  return { gifs, loading, error, searchGifs };
}
