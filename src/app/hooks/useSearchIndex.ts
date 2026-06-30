import { SearchIndexEvent, WorkerMessageTypeIn } from '$plugins/search-indexer/types';
import { EventType, MatrixEvent, MatrixEventEvent, MsgType } from 'matrix-js-sdk';
import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { useMatrixClient } from './useMatrixClient';

export type SearchIndexState = {
  indexedEventsCount: number;
  roomCount: number;
  backfillingRoomCount: number;
};

export type SearchIndexContextType = {
  clearIndex(): unknown;
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
