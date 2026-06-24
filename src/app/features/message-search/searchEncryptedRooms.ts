import { EventType } from '$types/matrix-sdk';
import type {
  IEventWithRoomId,
  IResultContext,
  MatrixClient,
  MatrixEvent,
} from '$types/matrix-sdk';
import {
  HAS_TYPE_TO_MSGTYPE,
  SearchHasType,
  type ResultGroup,
  type ResultItem,
} from './useMessageSearch';

/**
 * Searches a single room's live timeline for message events that contain
 * `term` in their body. Returns a ResultGroup or undefined if no matches.
 */
export function searchRoomTimeline(
  room: { roomId: string; getLiveTimeline: () => { getEvents: () => MatrixEvent[] } },
  term: string,
  senders?: string[],
  hasTypes?: SearchHasType[]
): ResultGroup | undefined {
  function toSearchEvent(mEvent: MatrixEvent, roomId: string): IEventWithRoomId {
    return {
      event_id: mEvent.getId() ?? '',
      room_id: roomId,
      sender: mEvent.getSender() ?? '',
      origin_server_ts: mEvent.getTs(),
      content: mEvent.getContent(),
      type: mEvent.getType(),
      unsigned: mEvent.getUnsigned(),
    } as IEventWithRoomId;
  }

  function mEventMatchesHasTypes(mEvent: MatrixEvent, hasTypes: SearchHasType[]): boolean {
    const content = mEvent.getContent() as { msgtype?: string; body?: string };
    for (const type of hasTypes) {
      const msgtype = HAS_TYPE_TO_MSGTYPE[type];
      if (msgtype && content.msgtype === msgtype) return true;
      if (type === 'link' && /https?:\/\//i.test(content.body ?? '')) return true;
    }
    return false;
  }

  const events = room.getLiveTimeline().getEvents();
  const items: ResultItem[] = [];

  for (const event of events) {
    if (event.getType() !== EventType.RoomMessage) continue;
    if (event.isBeingDecrypted() || event.isDecryptionFailure()) continue;

    const sender = event.getSender();
    if (!sender) continue;
    if (senders && !senders.includes(sender)) continue;

    if (hasTypes && hasTypes.length > 0 && !mEventMatchesHasTypes(event, hasTypes)) continue;

    if (!event.getId()) continue;

    if (term !== '') {
      const body: string = event.getContent().body ?? '';
      if (!body || !body.toLowerCase().includes(term.toLowerCase())) continue; // TODO: fuzzy search?
    }

    items.push({
      rank: 1,
      event: toSearchEvent(event, room.roomId),
      context: {
        events_before: [],
        events_after: [],
        profile_info: {},
      },
    });
  }

  if (items.length === 0) return undefined;

  items.sort((a, b) => b.event.origin_server_ts - a.event.origin_server_ts);

  return { roomId: room.roomId, items };
}

/**
 * Searches the in-memory live timeline of each listed encrypted room.
 * Returns one ResultGroup per room that has at least one match.
 */
export function searchEncryptedRoomsInMemory(
  mx: Pick<MatrixClient, 'getRoom'>,
  term: string,
  encryptedRoomIds: string[],
  senders?: string[],
  hasTypes?: SearchHasType[]
): ResultGroup[] {
  const groups: ResultGroup[] = [];

  for (const roomId of encryptedRoomIds) {
    const room = mx.getRoom(roomId);
    if (!room) continue;

    const group = searchRoomTimeline(room, term, senders, hasTypes);
    if (group) groups.push(group);
  }

  return groups;
}

/**
 * Splits the user's room filter into encrypted (in-memory) and plaintext (server) buckets.
 *
 * - When `rooms` is undefined (global search), the server handles plaintext rooms and
 *   we additionally scan all joined encrypted rooms in memory.
 * - When `rooms` is defined, each room is routed to the appropriate search path.
 */
export function partitionRoomsByEncryption(
  mx: Pick<MatrixClient, 'getRooms' | 'isRoomEncrypted'>,
  rooms?: string[]
): { encryptedRoomIds: string[]; serverRooms: string[] | undefined; skipServerSearch: boolean } {
  let allRooms = mx.getRooms();
  if (rooms === undefined) {
    const encryptedRoomIds = allRooms
      .filter((r) => r.hasEncryptionStateEvent())
      .map((r) => r.roomId);
    return { encryptedRoomIds, serverRooms: undefined, skipServerSearch: false };
  }

  const encryptedRoomIds: string[] = [];
  const serverRooms: string[] = [];

  for (const roomId of rooms) {
    if (allRooms.find((r) => r.roomId == roomId)?.hasEncryptionStateEvent()) {
      encryptedRoomIds.push(roomId);
    } else {
      serverRooms.push(roomId);
    }
  }

  return {
    encryptedRoomIds,
    serverRooms: serverRooms.length > 0 ? serverRooms : undefined,
    skipServerSearch: rooms.length > 0 && serverRooms.length === 0,
  };
}
