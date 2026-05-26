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
 *
 * For "recent" order, items within each group and the groups themselves are
 * sorted newest-first so that mergeSearchGroups' timestamp-based interleaving
 * (and its single-source early-return fast paths) both produce correct order.
 */
function idbEventsToGroups(
  mx: Pick<MatrixClient, 'getRoom'>,
  events: IndexableEvent[],
  order?: string
): ResultGroup[] {
  const byRoom = new Map<string, ResultItem[]>();
  for (const ev of events) {
    const liveEvent = mx.getRoom(ev.roomId)?.findEventById(ev.eventId);
    const eventData: IEventWithRoomId = liveEvent
      ? toSearchEvent(liveEvent, ev.roomId)
      : ({
          event_id: ev.eventId,
          room_id: ev.roomId,
          sender: ev.sender,
          origin_server_ts: ev.ts,
          // Reconstruct full content from IDB-stored fields so media events
          // (m.image, m.file, m.audio, m.video) render correctly even when
          // the event is no longer in the live timeline window.
          // Fall back to m.text only for pre-v3 index entries that lack media fields.
          content: {
            msgtype: ev.url !== undefined || ev.file !== undefined ? ev.msgtype : 'm.text',
            body: ev.body,
            ...(ev.url !== undefined && { url: ev.url }),
            ...(ev.file !== undefined && { file: ev.file }),
            ...(ev.info !== undefined && { info: ev.info }),
            ...(ev.filename !== undefined && { filename: ev.filename }),
          },
          type: 'm.room.message',
          unsigned: {},
        } as IEventWithRoomId);
    const item: ResultItem = {
      rank: 1,
      event: eventData,
      context: EMPTY_CONTEXT,
    };
    const arr = byRoom.get(ev.roomId) ?? [];
    arr.push(item);
    byRoom.set(ev.roomId, arr);
  }

  const groups = Array.from(byRoom.entries()).map(([roomId, items]) => ({
    roomId,
    // Sort items newest-first so items[0] is always the most recent — required
    // for mergeSearchGroups' timestamp comparisons to be correct.
    items:
      order !== 'rank'
        ? items.toSorted(
            (a, b) => (b.event.origin_server_ts ?? 0) - (a.event.origin_server_ts ?? 0)
          )
        : items,
  }));

  // Sort groups newest-first so single-source fast-paths in mergeSearchGroups
  // (which return the array unchanged) still produce correct recent order.
  return order !== 'rank'
    ? groups.toSorted(
        (a, b) =>
          (b.items[0]?.event.origin_server_ts ?? 0) - (a.items[0]?.event.origin_server_ts ?? 0)
      )
    : groups;
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
          const idbEvents = await searchIndex.query(term ?? '', {
            roomIds: encryptedRoomIds,
            senders,
            hasTypes: hasHasTypes ? hasTypes : undefined,
          });
          inMemoryGroups = idbEventsToGroups(mx, idbEvents, order);
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
              const idbEvents = await searchIndex.query('', {
                roomIds: unencryptedRooms,
                senders,
                hasTypes,
              });
              unencryptedMemoryGroups = idbEventsToGroups(mx, idbEvents, order);
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

        // Generate highlights from search term
        // For exact match (quoted), keep as single phrase; otherwise split into words
        const isQuotedExactMatch = term?.startsWith('"') && term.endsWith('"') && term.length > 1;
        const termForHighlights = isQuotedExactMatch && term ? term.slice(1, -1) : term;
        const termWords = termForHighlights
          ? isQuotedExactMatch
            ? [termForHighlights] // Keep exact match as single phrase
            : termForHighlights.split(/\s+/).filter(Boolean) // Split fuzzy search into words
          : [];

        return {
          highlights: termWords,
          groups: mergeSearchGroups(
            filterGroupsByHasType(inMemoryGroups),
            unencryptedMemoryGroups,
            order
          ),
          // Only report local-cache count for rooms that were actually searched in-memory.
          inMemoryRoomCount:
            (usedIdb ? 0 : encryptedRoomIds.length) +
              (usedIdbForUnencrypted ? 0 : unencryptedRoomCount) || undefined,
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

      // Generate highlights from search term
      // For exact match (quoted), keep as single phrase; otherwise split into words
      const isQuotedExactMatch = term.startsWith('"') && term.endsWith('"') && term.length > 1;
      const termForHighlights = isQuotedExactMatch ? term.slice(1, -1) : term;
      const termWords = isQuotedExactMatch
        ? [termForHighlights] // Keep exact match as single phrase
        : termForHighlights.split(/\s+/).filter(Boolean); // Split fuzzy search into words

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
