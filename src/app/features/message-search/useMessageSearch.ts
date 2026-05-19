import type {
  IEventWithRoomId,
  IResultContext,
  ISearchRequestBody,
  ISearchResponse,
  ISearchResult,
  SearchOrderBy,
} from '$types/matrix-sdk';
import { useCallback } from 'react';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useClientConfig } from '$hooks/useClientConfig';
import { useAtomValue } from 'jotai';
import { settingsAtom } from '$state/settings';
import {
  searchEncryptedRoomsInMemory,
  partitionRoomsByEncryption,
  mergeSearchGroups,
} from './searchEncryptedRooms';
import type { SearchHasType } from './searchEncryptedRooms';

export type { SearchHasType };

export type ResultItem = {
  rank: number;
  event: IEventWithRoomId;
  context: IResultContext;
};

export type ResultGroup = {
  roomId: string;
  items: ResultItem[];
};

export type SearchResult = {
  nextToken?: string;
  highlights: string[];
  groups: ResultGroup[];
  /** Number of encrypted rooms whose in-memory timeline was searched. */
  inMemoryRoomCount?: number;
};

const groupSearchResult = (results: ISearchResult[]): ResultGroup[] => {
  const groups: ResultGroup[] = [];

  results.forEach((item) => {
    const roomId = item.result.room_id;
    const resultItem: ResultItem = {
      rank: item.rank,
      event: item.result,
      context: item.context,
    };

    const lastAddedGroup: ResultGroup | undefined = groups[groups.length - 1];
    if (lastAddedGroup && roomId === lastAddedGroup.roomId) {
      lastAddedGroup.items.push(resultItem);
      return;
    }
    groups.push({
      roomId,
      items: [resultItem],
    });
  });

  return groups;
};

const parseSearchResult = (result: ISearchResponse): SearchResult => {
  const roomEvents = result.search_categories.room_events;

  const searchResult: SearchResult = {
    nextToken: roomEvents?.next_batch,
    highlights: roomEvents?.highlights ?? [],
    groups: groupSearchResult(roomEvents?.results ?? []),
  };

  return searchResult;
};

export type MessageSearchParams = {
  term?: string;
  order?: string;
  rooms?: string[];
  senders?: string[];
  hasTypes?: SearchHasType[];
};
export const useMessageSearch = (params: MessageSearchParams) => {
  const mx = useMatrixClient();
  const { features } = useClientConfig();
  const settings = useAtomValue(settingsAtom);
  const { term, order, rooms, senders, hasTypes } = params;

  const filterGroupsByHasType = useCallback(
    (grps: ResultGroup[]): ResultGroup[] => {
      if (!hasTypes || hasTypes.length === 0) return grps;
      const withMsgtype = hasTypes.filter((t) => t !== 'link');
      return grps
        .map((g) => ({
          ...g,
          items: g.items.filter((item) => {
            const content = item.event.content as { msgtype?: string; body?: string };
            if (withMsgtype.length > 0) {
              const msgtypeMap: Record<string, string> = {
                image: 'm.image',
                file: 'm.file',
                audio: 'm.audio',
                video: 'm.video',
              };
              if (withMsgtype.some((t) => content.msgtype === msgtypeMap[t])) return true;
            }
            if (hasTypes.includes('link') && /https?:\/\//i.test(content.body ?? '')) return true;
            return false;
          }),
        }))
        .filter((g) => g.items.length > 0);
    },
    [hasTypes]
  );

  const searchMessages = useCallback(
    async (nextBatch?: string) => {
      if (!term)
        return {
          highlights: [],
          groups: [],
        };
      const limit = 20;

      // Operator kill switch takes priority; user toggle controls the rest.
      const encryptedSearchEnabled =
        features?.encryptedSearch !== false && settings.encryptedSearch;
      const isFirstPage = !nextBatch || nextBatch === '';

      const { encryptedRoomIds, serverRooms, skipServerSearch } = encryptedSearchEnabled
        ? partitionRoomsByEncryption(mx, rooms)
        : { encryptedRoomIds: [], serverRooms: rooms, skipServerSearch: false };

      // In-memory search only runs on the first page — encrypted rooms have no pagination.
      const inMemoryGroups =
        encryptedSearchEnabled && isFirstPage && encryptedRoomIds.length > 0
          ? searchEncryptedRoomsInMemory(mx, term, encryptedRoomIds, senders, hasTypes)
          : [];

      if (skipServerSearch) {
        return {
          highlights: term.split(/\s+/).filter(Boolean),
          groups: filterGroupsByHasType(inMemoryGroups),
          inMemoryRoomCount: encryptedRoomIds.length,
        };
      }

      const requestBody: ISearchRequestBody = {
        search_categories: {
          room_events: {
            event_context: {
              before_limit: 0,
              after_limit: 0,
              include_profile: false,
            },
            filter: {
              limit,
              rooms: serverRooms,
              senders,
              ...(hasTypes?.includes('link') && { contains_url: true }),
            },
            include_state: false,
            order_by: order as SearchOrderBy.Recent,
            search_term: term,
          },
        },
      };

      const r = await mx.search({
        body: requestBody,
        next_batch: nextBatch === '' ? undefined : nextBatch,
      });
      const serverResult = parseSearchResult(r);
      const filteredServerResult = {
        ...serverResult,
        groups: filterGroupsByHasType(serverResult.groups),
      };

      if (inMemoryGroups.length === 0) {
        return filteredServerResult;
      }

      const termWords = term.split(/\s+/).filter(Boolean);
      return {
        ...filteredServerResult,
        groups: mergeSearchGroups(filteredServerResult.groups, filterGroupsByHasType(inMemoryGroups), order),
        highlights: Array.from(new Set([...filteredServerResult.highlights, ...termWords])),
        inMemoryRoomCount: encryptedRoomIds.length,
      };
    },
    [mx, features, settings.encryptedSearch, term, order, rooms, senders, hasTypes, filterGroupsByHasType]
  );

  return searchMessages;
};
