import type {
  IEventWithRoomId,
  IResultContext,
  ISearchRequestBody,
  ISearchResponse,
  ISearchResult,
  MatrixClient,
  MatrixEvent,
  SearchOrderBy,
} from '$types/matrix-sdk';
import { useCallback } from 'react';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { searchEncryptedRoomsInMemory, partitionRoomsByEncryption } from './searchEncryptedRooms';
import { useSearchIndex } from '$hooks/useSearchIndex';
import { useAtomValue } from 'jotai';
import { settingsAtom } from '$state/settings';
import { SearchIndexEvent } from '$plugins/search-indexer/types';

export function toSearchEvent(mEvent: MatrixEvent, roomId: string): IEventWithRoomId {
  return {
    event_id: mEvent.getId() ?? '',
    room_id: roomId,
    sender: mEvent.getSender() ?? '',
    origin_server_ts: mEvent.getTs(),
    content: mEvent.getContent(), // decrypted content for e2ee events
    type: mEvent.getType(), // decrypted event type (e.g. m.room.message, not m.room.encrypted)
    unsigned: mEvent.getUnsigned(),
  } as IEventWithRoomId;
}

function idbEventsToGroups(
  mx: MatrixClient,
  events: SearchIndexEvent[],
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
          content: {
            msgtype: ev.msgtype,
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
      context: {
        events_before: [],
        events_after: [],
        profile_info: {},
      },
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
};

export type SearchHasType = 'image' | 'file' | 'audio' | 'video' | 'link';

export const VALID_HAS_TYPES: SearchHasType[] = ['image', 'file', 'audio', 'video', 'link'];
export const HAS_TYPE_TO_MSGTYPE: Record<string, string> = {
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
  const searchIndex = useSearchIndex();
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
      const idbSearchAvailable =
        settings.idbSearchIndex && !!searchIndex?.ready;
      const hasHasTypes = hasTypes && hasTypes.length > 0;
      if (!(term || (idbSearchAvailable && hasHasTypes)))
        return {
          highlights: [],
          groups: [],
        };

      const isFirstPage = !nextBatch || nextBatch === '';

      if (idbSearchAvailable) {
        const idbEvents = await searchIndex.query(term ?? '', {
          roomIds: rooms ?? [],
          senders,
          hasTypes: hasHasTypes ? hasTypes : undefined,
        });

        let foundGroups = idbEventsToGroups(mx, idbEvents, order);
        return {
          highlights: [],
          groups: foundGroups,
        };
      }

      const { encryptedRoomIds, serverRooms } = partitionRoomsByEncryption(mx, rooms);
      let skipServerSearch = !!!serverRooms;

      let foundGroups: ResultGroup[] = [];

      if (isFirstPage && (rooms ?? []).length > 0) {
        if (term || hasHasTypes) {
          foundGroups = searchEncryptedRoomsInMemory(
            mx,
            term ?? '',
            encryptedRoomIds,
            senders,
            hasTypes
          );
        }
      }

      if (skipServerSearch) {
        return {
          groups: foundGroups,
          highlights: [],
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
              senders,
              rooms: serverRooms,
            },
            include_state: false,
            order_by: order as SearchOrderBy.Recent,
            search_term: term ?? '',
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
        groups: mergeSearchGroups(foundGroups, serverResult.groups),
      };
      return filteredServerResult;
    },
    [mx, term, order, rooms, senders, hasTypes, filterGroupsByHasType]
  );

  return searchMessages;
};
