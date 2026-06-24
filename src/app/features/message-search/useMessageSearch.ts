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
import { searchEncryptedRoomsInMemory, partitionRoomsByEncryption } from './searchEncryptedRooms';

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
};

export type SearchHasType = 'image' | 'file' | 'audio' | 'video' | 'link';

export const VALID_HAS_TYPES: SearchHasType[] = ['image', 'file', 'audio', 'video', 'link'];
export const HAS_TYPE_TO_MSGTYPE: Partial<Record<SearchHasType, string>> = {
  image: 'm.image',
  file: 'm.file',
  audio: 'm.audio',
  video: 'm.video',
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
  const { term, order, rooms, senders, hasTypes } = params;

  const filterGroupsByHasType = useCallback(
    (grps: ResultGroup[]): ResultGroup[] => {
      if (!hasTypes || hasTypes.length === 0) return grps;
      const withMsgtype = hasTypes.filter((t) => t !== 'link');
      return grps
        .map((g) => ({
          ...g,
          items: g.items.filter((item) => {
            const content = item.event.content;
            if (
              withMsgtype.length > 0 &&
              withMsgtype.some((t) => content.msgtype === HAS_TYPE_TO_MSGTYPE[t])
            )
              return true;

            if (hasTypes.includes('link') && /https?:\/\//i.test(content.body ?? '')) return true; // TODO: maybe regex isn't the best idea
            return false;
          }),
        }))
        .filter((g) => g.items.length > 0);
    },
    [hasTypes]
  );

  const mergeSearchGroups = (
    serverGroups: ResultGroup[],
    inMemoryGroups: ResultGroup[],
    order?: string
  ): ResultGroup[] => {
    if (inMemoryGroups.length === 0) return serverGroups;
    if (serverGroups.length === 0) return inMemoryGroups;

    const all = [...serverGroups, ...inMemoryGroups];

    if (order === 'rank') {
      return all;
    }

    return all.toSorted((a, b) => {
      const aTs = a.items[0]?.event.origin_server_ts ?? 0;
      const bTs = b.items[0]?.event.origin_server_ts ?? 0;
      return bTs - aTs;
    });
  };

  const searchMessages = useCallback(
    async (nextBatch?: string) => {
      if (!term)
        return {
          highlights: [],
          groups: [],
        };
      const limit = 20;
      const isFirstPage = !nextBatch || nextBatch === '';

      const { encryptedRoomIds, serverRooms, skipServerSearch } = partitionRoomsByEncryption(
        mx,
        rooms
      );
      const inMemoryGroups =
        isFirstPage && encryptedRoomIds.length > 0
          ? searchEncryptedRoomsInMemory(mx, term ?? '', encryptedRoomIds, senders, hasTypes)
          : [];

      if (skipServerSearch) {
        return {
          groups: inMemoryGroups,
          highlights: [],
        };
      }

      // TODO: handle search w/o text with IndexedDB (search part 2)
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
              senders,
              rooms: serverRooms,
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
        groups: mergeSearchGroups(
          filterGroupsByHasType(serverResult.groups),
          inMemoryGroups,
          order
        ),
      };
      return filteredServerResult;
    },
    [mx, term, order, rooms, senders, hasTypes, filterGroupsByHasType]
  );

  return searchMessages;
};
