import { describe, it, expect } from 'vitest';
import { EventType } from '$types/matrix-sdk';
import type { IEventWithRoomId, MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import {
  searchRoomTimeline,
  searchEncryptedRoomsInMemory,
  partitionRoomsByEncryption,
  mergeSearchGroups,
} from './searchEncryptedRooms';
import type { ResultGroup } from './useMessageSearch';

// Minimal MatrixEvent stub — only the methods used by searchRoomTimeline
function makeEvent(overrides: {
  type?: string;
  body?: string;
  sender?: string;
  ts?: number;
  id?: string;
  redacted?: boolean;
}): MatrixEvent {
  return {
    getType: () => overrides.type ?? EventType.RoomMessage,
    getContent: () => ({ body: overrides.body ?? '', msgtype: 'm.text' }),
    getSender: () => overrides.sender ?? '@alice:example.org',
    getTs: () => overrides.ts ?? 1000,
    getId: () => overrides.id ?? '$event1',
    isRedacted: () => overrides.redacted ?? false,
    getUnsigned: () => ({}),
    event: {},
  } as unknown as MatrixEvent;
}

function makeRoom(roomId: string, events: MatrixEvent[]) {
  return {
    roomId,
    getLiveTimeline: () => ({ getEvents: () => events }),
  };
}

describe('searchRoomTimeline', () => {
  it('returns undefined when no events match', () => {
    const room = makeRoom('!room:example.org', [makeEvent({ body: 'hello world' })]);
    expect(searchRoomTimeline(room, 'goodbye')).toBeUndefined();
  });

  it('matches a simple substring (case-insensitive)', () => {
    const room = makeRoom('!room:example.org', [makeEvent({ body: 'Hello World', id: '$e1' })]);
    const group = searchRoomTimeline(room, 'hello world');
    expect(group).toBeDefined();
    expect(group!.items).toHaveLength(1);
    expect(group!.items[0]!.event.event_id).toBe('$e1');
  });

  it('is case-insensitive', () => {
    const room = makeRoom('!room:example.org', [makeEvent({ body: 'MATRIX ENCRYPTED' })]);
    expect(searchRoomTimeline(room, 'matrix encrypted')).toBeDefined();
  });

  it('skips non-message events', () => {
    const room = makeRoom('!room:example.org', [
      makeEvent({ type: 'm.room.encrypted', body: 'search me' }),
      makeEvent({ type: 'm.room.member', body: 'search me' }),
    ]);
    expect(searchRoomTimeline(room, 'search me')).toBeUndefined();
  });

  it('skips redacted events', () => {
    const room = makeRoom('!room:example.org', [makeEvent({ body: 'match', redacted: true })]);
    expect(searchRoomTimeline(room, 'match')).toBeUndefined();
  });

  it('filters by sender when senders list is provided', () => {
    const room = makeRoom('!room:example.org', [
      makeEvent({ body: 'match', sender: '@alice:example.org', id: '$e1' }),
      makeEvent({ body: 'match', sender: '@bob:example.org', id: '$e2' }),
    ]);
    const group = searchRoomTimeline(room, 'match', ['@alice:example.org']);
    expect(group!.items).toHaveLength(1);
    expect(group!.items[0]!.event.sender).toBe('@alice:example.org');
  });

  it('sorts results most-recent-first', () => {
    const room = makeRoom('!room:example.org', [
      makeEvent({ body: 'match', ts: 1000, id: '$old' }),
      makeEvent({ body: 'match', ts: 3000, id: '$new' }),
      makeEvent({ body: 'match', ts: 2000, id: '$mid' }),
    ]);
    const group = searchRoomTimeline(room, 'match');
    expect(group!.items.map((i) => i.event.event_id)).toEqual(['$new', '$mid', '$old']);
  });

  it('uses decrypted event type and content (getType/getContent)', () => {
    // Simulates an e2ee event: underlying type is m.room.encrypted but
    // getType()/getContent() return the decrypted values.
    const room = makeRoom('!room:example.org', [
      makeEvent({ type: EventType.RoomMessage, body: 'secret message', id: '$enc' }),
    ]);
    const group = searchRoomTimeline(room, 'secret');
    expect(group!.items[0]!.event.type).toBe(EventType.RoomMessage);
    expect(group!.items[0]!.event.content.body).toBe('secret message');
  });
});

describe('searchEncryptedRoomsInMemory', () => {
  it('searches across multiple rooms and returns matching groups', () => {
    const mx = {
      getRoom: (id: string) => {
        const rooms = [
          makeRoom('!room1:example.org', [makeEvent({ body: 'hello', id: '$e1' })]),
          makeRoom('!room2:example.org', [makeEvent({ body: 'goodbye', id: '$e2' })]),
        ];
        return rooms.find((r) => r.roomId === id) ?? null;
      },
    };
    const groups = searchEncryptedRoomsInMemory(mx as unknown as MatrixClient, 'hello', [
      '!room1:example.org',
      '!room2:example.org',
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.roomId).toBe('!room1:example.org');
  });

  it('returns empty array when no rooms match', () => {
    const mx = {
      getRoom: () => makeRoom('!room:example.org', [makeEvent({ body: 'unrelated content' })]),
    };
    const groups = searchEncryptedRoomsInMemory(mx as unknown as MatrixClient, 'notfound', [
      '!room:example.org',
    ]);
    expect(groups).toHaveLength(0);
  });

  it('skips rooms not found in the client', () => {
    const mx = { getRoom: () => null };
    const groups = searchEncryptedRoomsInMemory(mx as unknown as MatrixClient, 'match', [
      '!ghost:example.org',
    ]);
    expect(groups).toHaveLength(0);
  });
});

describe('partitionRoomsByEncryption', () => {
  const mx = {
    getRooms: () => [{ roomId: '!enc:example.org' }, { roomId: '!plain:example.org' }],
    isRoomEncrypted: (id: string) => id === '!enc:example.org',
  };

  it('returns all encrypted rooms and undefined serverRooms for global search', () => {
    const result = partitionRoomsByEncryption(mx as unknown as MatrixClient, undefined);
    expect(result.encryptedRoomIds).toEqual(['!enc:example.org']);
    expect(result.serverRooms).toBeUndefined();
    expect(result.skipServerSearch).toBe(false);
  });

  it('splits a mixed room list correctly', () => {
    const result = partitionRoomsByEncryption(mx as unknown as MatrixClient, [
      '!enc:example.org',
      '!plain:example.org',
    ]);
    expect(result.encryptedRoomIds).toEqual(['!enc:example.org']);
    expect(result.serverRooms).toEqual(['!plain:example.org']);
    expect(result.skipServerSearch).toBe(false);
  });

  it('sets skipServerSearch when all specified rooms are encrypted', () => {
    const result = partitionRoomsByEncryption(mx as unknown as MatrixClient, ['!enc:example.org']);
    expect(result.skipServerSearch).toBe(true);
    expect(result.serverRooms).toBeUndefined();
  });
});

const makeGroup = (roomId: string, ts: number): ResultGroup => ({
  roomId,
  items: [
    {
      rank: 1,
      event: { room_id: roomId, origin_server_ts: ts } as unknown as IEventWithRoomId,
      context: { events_before: [], events_after: [], profile_info: {} },
    },
  ],
});

describe('mergeSearchGroups', () => {
  it('returns server groups unchanged when there are no in-memory groups', () => {
    const server = [makeGroup('!a:x', 2000)];
    expect(mergeSearchGroups(server, [])).toBe(server);
  });

  it('returns in-memory groups unchanged when there are no server groups', () => {
    const mem = [makeGroup('!b:x', 1000)];
    expect(mergeSearchGroups([], mem)).toBe(mem);
  });

  it('sorts by timestamp for recent order', () => {
    const server = [makeGroup('!a:x', 1000)];
    const mem = [makeGroup('!b:x', 3000)];
    const merged = mergeSearchGroups(server, mem, 'recent');
    expect(merged[0]!.roomId).toBe('!b:x');
    expect(merged[1]!.roomId).toBe('!a:x');
  });

  it('puts server results first for rank order', () => {
    const server = [makeGroup('!a:x', 1000)];
    const mem = [makeGroup('!b:x', 3000)];
    const merged = mergeSearchGroups(server, mem, 'rank');
    expect(merged[0]!.roomId).toBe('!a:x');
    expect(merged[1]!.roomId).toBe('!b:x');
  });
});
