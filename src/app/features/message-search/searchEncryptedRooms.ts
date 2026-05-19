import { EventType } from '$types/matrix-sdk';
import type { IEventWithRoomId, IResultContext, MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import type { ResultGroup, ResultItem } from './useMessageSearch';

// Shared empty context — in-memory results have no surrounding-event context.
const EMPTY_CONTEXT: IResultContext = {
  events_before: [],
  events_after: [],
  profile_info: {},
};

/**
 * Builds an IEventWithRoomId from a live MatrixEvent, using the decrypted
 * content and event type. This is what makes encrypted-room search work:
 * getContent() returns plaintext even for e2ee events that have been decrypted.
 */
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

/**
 * Searches a single room's live timeline for message events that contain
 * `lowerTerm` in their body. Returns a ResultGroup or undefined if no matches.
 */
export function searchRoomTimeline(
  room: { roomId: string; getLiveTimeline: () => { getEvents: () => MatrixEvent[] } },
  lowerTerm: string,
  senders?: string[]
): ResultGroup | undefined {
  const events = room.getLiveTimeline().getEvents();
  const items: ResultItem[] = [];

  for (const mEvent of events) {
    // Skip non-message events and still-encrypted events (decryption failed or not yet decrypted)
    if (mEvent.getType() !== EventType.RoomMessage) continue;
    if (mEvent.isRedacted()) continue;

    const sender = mEvent.getSender();
    if (!sender) continue;
    if (senders && !senders.includes(sender)) continue;

    const body: string = mEvent.getContent().body ?? '';
    if (!body || !body.toLowerCase().includes(lowerTerm)) continue;

    items.push({
      rank: 1,
      event: toSearchEvent(mEvent, room.roomId),
      context: EMPTY_CONTEXT,
    });
  }

  if (items.length === 0) return undefined;

  // Most recent first, consistent with server "recent" ordering
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
  senders?: string[]
): ResultGroup[] {
  const lowerTerm = term.toLowerCase();
  const groups: ResultGroup[] = [];

  for (const roomId of encryptedRoomIds) {
    const room = mx.getRoom(roomId);
    if (!room) continue;

    const group = searchRoomTimeline(room, lowerTerm, senders);
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
  if (rooms === undefined) {
    // Global: server handles everything it can; we supplement with all encrypted rooms
    const encryptedRoomIds = mx
      .getRooms()
      .filter((r) => mx.isRoomEncrypted(r.roomId))
      .map((r) => r.roomId);
    return { encryptedRoomIds, serverRooms: undefined, skipServerSearch: false };
  }

  const encryptedRoomIds: string[] = [];
  const serverRooms: string[] = [];

  for (const roomId of rooms) {
    if (mx.isRoomEncrypted(roomId)) {
      encryptedRoomIds.push(roomId);
    } else {
      serverRooms.push(roomId);
    }
  }

  return {
    encryptedRoomIds,
    serverRooms: serverRooms.length > 0 ? serverRooms : undefined,
    // All specified rooms are encrypted — skip the server call entirely
    skipServerSearch: rooms.length > 0 && serverRooms.length === 0,
  };
}

/**
 * Merges server-side and in-memory ResultGroups.
 * For "recent" order: interleaved by each group's most recent event timestamp.
 * For "rank" order: server results first (real relevance scores), then in-memory.
 */
export function mergeSearchGroups(
  serverGroups: ResultGroup[],
  inMemoryGroups: ResultGroup[],
  order?: string
): ResultGroup[] {
  if (inMemoryGroups.length === 0) return serverGroups;
  if (serverGroups.length === 0) return inMemoryGroups;

  const all = [...serverGroups, ...inMemoryGroups];

  if (order === 'rank') {
    // Keep server results first — they have real rank scores
    return all;
  }

  // Recent order: sort groups by the most recent event in each
  return all.toSorted((a, b) => {
    const aTs = a.items[0]?.event.origin_server_ts ?? 0;
    const bTs = b.items[0]?.event.origin_server_ts ?? 0;
    return bTs - aTs;
  });
}
