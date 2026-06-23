import type { AccountDataEvents } from 'matrix-js-sdk';
import { MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS } from '../../unstable/prefixes';
import { useAccountData } from './useAccountData';

const DEFAULT_FAVORITE_GIFS: AccountDataEvents[typeof MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS] = {
  gifs: [],
};

export const useFavoriteGifs =
  (): AccountDataEvents[typeof MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS] => {
    const favoritedGifsData = useAccountData(MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS);
    const favoritedContent =
      favoritedGifsData?.getContent<
        AccountDataEvents[typeof MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS]
      >() ?? DEFAULT_FAVORITE_GIFS;

    return favoritedContent;
  };
