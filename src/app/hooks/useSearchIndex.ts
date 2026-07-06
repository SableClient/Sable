import type { SearchIndexEvent } from '$plugins/search-indexer/types';
import { createContext, useContext } from 'react';

export type SearchIndexState = {
  indexedEventsCount: number;
  roomCount: number;
  backfillingRoomCount: number;
};

export type SearchIndexContextType = {
  clearIndex: () => Promise<void>;
  query: (
    term: string,
    opts?: { roomIds?: string[]; senders?: string[]; hasTypes?: string[] }
  ) => Promise<SearchIndexEvent[]>;
  state: () => Promise<SearchIndexState>;
  isBackfilling: boolean;
  ready: boolean;
};

export const SearchIndexContext = createContext<SearchIndexContextType | null>(null);

export function useSearchIndex(): SearchIndexContextType | null {
  return useContext(SearchIndexContext);
}
