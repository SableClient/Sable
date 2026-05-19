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
  EMPTY_CONTEXT,
  toSearchEvent,
} from './searchEncryptedRooms';
import type { SearchHasType } from './searchEncryptedRooms';
import type { MatrixClient } from '$types/matrix-sdk';
import type { IndexableEvent } from '$plugins/search-worker/types';
import { useSearchIndex } from '$hooks/useSearchIndex';

export type { SearchHasType };

/**
 * Convert IDB-indexed events back to the ResultGroup format used by the search UI.
 *
 * Prefers the live MatrixEvent from the room cache so that media messages
 * (m.image, m.file, m.audio, m.video) render with their full content
 * (url, file, info, …). Falls back to a plain-text synthetic event showing
 * the stored filename/body when the event is no longer in memory.
 */
function idbEventsToGroups(mx: Pick<MatrixClient, 'getRoom'>, events: IndexableEvent[]): ResultGroup[] {
  const byRoom = new Map<string, ResultItem[]>();
  for (const ev of events) {
    const liveEvent = mx.getRoom(ev.roomId)?.findEventById(ev.eventId);
    const eventData: IEventWithRoomId = liveEvent
      ? toSearchEvent(liveEvent, ev.roomId)
      : {
          event_id: ev.eventId,
          room_id: ev.roomId,
          sender: ev.sender,
          origin_server_ts: ev.ts,
          // Fall back to m.text so media renderers don't show "Broken message"
          // when the event has scrolled out of the in-memory timeline.
          content: { msgtype: 'm.text', body: ev.body },
          type: 'm.room.message',
          unsigned: {},
        } as IEventWithRoomId;
    const item: ResultItem = {
      rank: 1,
      event: eventData,
      context: EMPTY_CONTEXT as IResultContext,
    };
    const arr = byRoom.get(ev.roomId) ?? [];
    arr.push(item);
    byRoom.set(ev.roomId, arr);
  }
  return Array.from(byRoom.entries()).map(([roomId, items]) => ({ roomId, items }));
}

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
  const searchIndex = useSearchIndex();
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
      const hasHasTypes = hasTypes && hasTypes.length > 0;
      if (!term && !hasHasTypes)
        return {
          highlights: [],
          groups: [],
        };
      const limit = 20;

      // Operator kill switch takes priority; user toggle controls the rest.
      const encryptedSearchEnabled =
        features?.encryptedSearch !== false && settings.encryptedSearch;
      // Use IDB index when the user has enabled it and the index is ready.
      const useIdbSearch = settings.idbSearchIndex && searchIndex?.isReady === true;
      const isFirstPage = !nextBatch || nextBatch === '';

      const { encryptedRoomIds, serverRooms, skipServerSearch } = encryptedSearchEnabled
        ? partitionRoomsByEncryption(mx, rooms)
        : { encryptedRoomIds: [], serverRooms: rooms, skipServerSearch: false };

      // For IDB search: only run on first page (IDB has no pagination cursor here).
      // Prefer IDB when available; fall back to in-memory live timeline.
      let inMemoryGroups: ResultGroup[] = [];
      let usedIdb = false;
      if (encryptedSearchEnabled && isFirstPage && encryptedRoomIds.length > 0) {
        if (useIdbSearch && (term || hasHasTypes)) {
          const idbEvents = await searchIndex!.query(term ?? '', {
            roomIds: encryptedRoomIds,
            senders,
            hasTypes: hasHasTypes ? hasTypes : undefined,
          });
          inMemoryGroups = idbEventsToGroups(mx, idbEvents);
          usedIdb = true;
        } else {
          inMemoryGroups = searchEncryptedRoomsInMemory(
            mx,
            term ?? '',
            encryptedRoomIds,
            senders,
            hasTypes
          );
        }
      }

      // When there's no text term, skip server search (server requires search_term).
      // For has: filters, scan all rooms' timelines (encrypted + unencrypted).
      if (skipServerSearch || !term) {
        let unencryptedMemoryGroups: ResultGroup[] = [];
        let unencryptedRoomCount = 0;
        let usedIdbForUnencrypted = false;
        if (hasHasTypes && isFirstPage) {
          // When scoped (rooms defined), use only unencrypted rooms within scope (may be empty
          // when all scoped rooms are encrypted). When global (rooms undefined), fall back to
          // all non-encrypted joined rooms.
          const unencryptedRooms =
            rooms !== undefined
              ? (serverRooms ?? [])
              : mx
                  .getRooms()
                  .filter((r) => !mx.isRoomEncrypted(r.roomId))
                  .map((r) => r.roomId);
          unencryptedRoomCount = unencryptedRooms.length;
          if (unencryptedRooms.length > 0) {
            if (useIdbSearch) {
              const idbEvents = await searchIndex!.query('', {
                roomIds: unencryptedRooms,
                senders,
                hasTypes,
              });
              unencryptedMemoryGroups = idbEventsToGroups(mx, idbEvents);
              usedIdbForUnencrypted = true;
            } else {
              unencryptedMemoryGroups = searchEncryptedRoomsInMemory(
                mx,
                '',
                unencryptedRooms,
                senders,
                hasTypes
              );
            }
          }
        }
        return {
          highlights: [],
          groups: mergeSearchGroups(
            filterGroupsByHasType(inMemoryGroups),
            unencryptedMemoryGroups,
            order
          ),
          // Only report local-cache count for rooms that were actually searched in-memory.
          inMemoryRoomCount:
            ((usedIdb ? 0 : encryptedRoomIds.length) +
              (usedIdbForUnencrypted ? 0 : unencryptedRoomCount)) ||
            undefined,
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
        groups: mergeSearchGroups(
          filteredServerResult.groups,
          filterGroupsByHasType(inMemoryGroups),
          order
        ),
        highlights: Array.from(new Set([...filteredServerResult.highlights, ...termWords])),
        inMemoryRoomCount: usedIdb ? undefined : encryptedRoomIds.length,
      };
    },
    [
      mx,
      features,
      settings.encryptedSearch,
      settings.idbSearchIndex,
      searchIndex,
      term,
      order,
      rooms,
      senders,
      hasTypes,
      filterGroupsByHasType,
    ]
  );

  return searchMessages;
};
