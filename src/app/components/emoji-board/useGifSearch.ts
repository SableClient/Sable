import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AsyncSearchHandler } from '$utils/AsyncSearch';
import { fetch } from '$utils/fetch';
import { useClientConfig } from '$hooks/useClientConfig';
import { getGifProvider } from '$utils/gifProviders';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import type { GifData } from './types';

export function useGifSearch(
  favoriteGifs: GifData[],
  showGifPicker: boolean,
  gifSearch: AsyncSearchHandler
) {
  const [searchResults, setSearchResults] = useState<GifData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientConfig = useClientConfig();
  const [gifProvider] = useSetting(settingsAtom, 'gifProvider');
  const provider = getGifProvider(clientConfig.gifs, gifProvider);
  const apiKey = provider.getApiKey(clientConfig.gifs ?? {}) ?? '';
  const requestGenerationRef = useRef(0);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
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
        const url = provider.buildSearchUrl(apiKey, trimmedQuery);
        const response = await fetch(url, { signal: controller.signal });

        if (response.status === 200) {
          const results = provider.parseResults(await response.json());

          if (generation === requestGenerationRef.current && mountedRef.current) {
            setSearchResults(results);
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
    [cancelRequest, provider, apiKey, gifSearch]
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
