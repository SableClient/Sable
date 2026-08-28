import { describe, expect, it, vi } from 'vitest';
import { KnownMembership, NotificationCountType } from '$types/matrix-sdk';
import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { getUnreadInfo, getUnreadInfosForRooms, isNotificationEvent } from './room/unread';

const SPACE = '!space:example.com';
const ROOM_UNREAD = '!unread:example.com';
const ROOM_EMPTY = '!empty:example.com';
const ROOM_MUTED = '!muted:example.com';
const ROOM_LEFT = '!left:example.com';
const MISSING = '!missing:example.com';
const ME = '@user:example.com';
const OTHER = '@other:example.com';

const createEvent = (
  id: string,
  sender: string,
  type = 'm.room.message',
  relation?: { rel_type: string; event_id?: string }
): MatrixEvent =>
  ({
    getId: () => id,
    getSender: () => sender,
    getType: () => type,
    isRedacted: () => false,
    isSending: () => false,
    getRelation: () => relation,
  }) as unknown as MatrixEvent;

const createClient = (rooms: Record<string, Room>, pushRulesOverride?: unknown[]): MatrixClient =>
  ({
    getUserId: () => '@user:example.com',
    getRoom: (roomId: string) => rooms[roomId],
    getRoomPushRule: () => {
      throw new Error('no rule');
    },
    getAccountData: pushRulesOverride
      ? () => ({ getContent: () => ({ global: { override: pushRulesOverride } }) })
      : () => undefined,
  }) as unknown as MatrixClient;

const createRoom = (
  roomId: string,
  opts: {
    isSpace?: boolean;
    membership?: string;
    total?: number;
    highlight?: number;
    readUpTo?: string | null;
    events?: MatrixEvent[];
    fullyRead?: string;
    paginationToken?: string | null;
    rawReceipt?: boolean;
  } = {}
): Room => {
  const {
    isSpace = false,
    membership = KnownMembership.Join,
    total = 0,
    highlight = 0,
    readUpTo = '$read',
    events = [],
    fullyRead,
    paginationToken = 't0',
    rawReceipt = false,
  } = opts;

  const client = createClient({ [roomId]: null as unknown as Room });

  return {
    roomId,
    isSpaceRoom: () => isSpace,
    getMyMembership: () => membership,
    getJoinedMemberCount: () => 10,
    getUnreadNotificationCount: vi.fn<(type: string) => number>((type: string) => {
      if (type === NotificationCountType.Highlight) return highlight;
      return total;
    }),
    getEventReadUpTo: () => readUpTo,
    getReadReceiptForUserId: () => (rawReceipt ? { eventId: '$receipt-target' } : null),
    findEventById: (eventId: string) => events.find((event) => event.getId() === eventId),
    getLiveTimeline: () => ({
      getEvents: () => events,
      getPaginationToken: () => paginationToken,
    }),
    getRoomUnreadNotificationCount: (type: string) =>
      type === NotificationCountType.Highlight ? highlight : total,
    hasUserReadEvent: () => false,
    getAccountData: (type: string) =>
      fullyRead && type === 'm.fully_read'
        ? { getContent: () => ({ event_id: fullyRead }) }
        : undefined,
    client,
  } as unknown as Room;
};

const bindRoom = (room: Room): MatrixClient => {
  const mx = createClient({ [room.roomId]: room });
  (room as unknown as { client: MatrixClient }).client = mx;
  return mx;
};

describe('getUnreadInfosForRooms', () => {
  it('skips space rooms instead of deleting them', () => {
    const unreadRoom = createRoom(ROOM_UNREAD, {
      total: 5,
      events: [createEvent('$unread', '@other:example.com')],
    });
    const spaceRoom = createRoom(SPACE, { isSpace: true });
    const mx = createClient({ [SPACE]: spaceRoom, [ROOM_UNREAD]: unreadRoom });
    (unreadRoom as unknown as { client: MatrixClient }).client = mx;
    (spaceRoom as unknown as { client: MatrixClient }).client = mx;

    const { unread, deleted } = getUnreadInfosForRooms(mx, [SPACE, ROOM_UNREAD]);

    expect(deleted).not.toContain(SPACE);
    expect(unread.find((u) => u.roomId === SPACE)).toBeUndefined();
    expect(unread.find((u) => u.roomId === ROOM_UNREAD)).toBeDefined();
    expect(unread.find((u) => u.roomId === ROOM_UNREAD)?.total).toBe(5);
  });

  it('does not delete a space even when it is the only dirty room', () => {
    const spaceRoom = createRoom(SPACE, { isSpace: true });
    const mx = createClient({ [SPACE]: spaceRoom });
    (spaceRoom as unknown as { client: MatrixClient }).client = mx;

    const { unread, deleted } = getUnreadInfosForRooms(mx, [SPACE]);

    expect(deleted).toEqual([]);
    expect(unread).toEqual([]);
  });

  it('deletes rooms that no longer exist', () => {
    const mx = createClient({});
    const { deleted } = getUnreadInfosForRooms(mx, [MISSING]);
    expect(deleted).toContain(MISSING);
  });

  it('deletes rooms the user has left', () => {
    const leftRoom = createRoom(ROOM_LEFT, { membership: KnownMembership.Leave });
    const mx = createClient({ [ROOM_LEFT]: leftRoom });
    (leftRoom as unknown as { client: MatrixClient }).client = mx;

    const { deleted } = getUnreadInfosForRooms(mx, [ROOM_LEFT]);
    expect(deleted).toContain(ROOM_LEFT);
  });

  it('deletes muted rooms', () => {
    const mutedRoom = createRoom(ROOM_MUTED);
    const mx = createClient({ [ROOM_MUTED]: mutedRoom }, [
      { rule_id: ROOM_MUTED, actions: ['dont_notify'] },
    ]);
    (mutedRoom as unknown as { client: MatrixClient }).client = mx;

    const { deleted } = getUnreadInfosForRooms(mx, [ROOM_MUTED]);
    expect(deleted).toContain(ROOM_MUTED);
  });

  it('badges an unvisited room that has no read data at all', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: null,
      events: [createEvent('$a', OTHER)],
    });
    const mx = bindRoom(room);

    const { unread } = getUnreadInfosForRooms(mx, [ROOM_UNREAD]);
    expect(unread.find((u) => u.roomId === ROOM_UNREAD)?.total).toBe(1);
  });

  it('marks the unread count of unvisited rooms as estimated', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: null,
      events: [createEvent('$a', OTHER)],
    });
    bindRoom(room);

    expect(getUnreadInfo(room)).toEqual({
      roomId: ROOM_UNREAD,
      highlight: 0,
      total: 1,
      estimated: true,
    });
  });

  it('counts real unreads when the timeline is fully loaded without read data', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: null,
      paginationToken: null,
      events: [createEvent('$a', OTHER), createEvent('$b', OTHER), createEvent('$c', OTHER)],
    });
    bindRoom(room);

    const unreadInfo = getUnreadInfo(room);
    expect(unreadInfo.total).toBe(3);
    expect(unreadInfo.estimated).toBeFalsy();
  });

  it('counts real unreads after the fully-read marker once it is loaded', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: null,
      fullyRead: '$a',
      events: [createEvent('$a', OTHER), createEvent('$b', OTHER), createEvent('$c', OTHER)],
    });
    bindRoom(room);

    const unreadInfo = getUnreadInfo(room);
    expect(unreadInfo.total).toBe(2);
    expect(unreadInfo.estimated).toBeFalsy();
  });

  it('stops counting at our own message when no read data exists', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: null,
      paginationToken: null,
      events: [createEvent('$a', OTHER), createEvent('$b', ME), createEvent('$c', OTHER)],
    });
    bindRoom(room);

    expect(getUnreadInfo(room).total).toBe(1);
  });

  it('stays badgeless but estimated when read evidence is outside the window', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: null,
      rawReceipt: true,
      events: [createEvent('$a', OTHER, 'm.room.topic')],
    });
    bindRoom(room);

    expect(getUnreadInfo(room)).toEqual({
      roomId: ROOM_UNREAD,
      highlight: 0,
      total: 0,
      estimated: true,
    });
  });

  it('marks the count as estimated when the receipt is below the loaded window', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: '$missing',
      events: [createEvent('$a', OTHER), createEvent('$b', OTHER)],
    });
    bindRoom(room);

    expect(getUnreadInfo(room)).toEqual({
      roomId: ROOM_UNREAD,
      highlight: 0,
      total: 2,
      estimated: true,
    });
  });

  it('counts exactly once the receipt is inside the loaded window', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: '$a',
      events: [createEvent('$a', OTHER), createEvent('$b', OTHER), createEvent('$c', OTHER)],
    });
    bindRoom(room);

    const unreadInfo = getUnreadInfo(room);
    expect(unreadInfo.total).toBe(2);
    expect(unreadInfo.estimated).toBe(false);
  });

  it('does not badge a room whose fully-read marker is outside the loaded window', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: null,
      fullyRead: '$older',
      events: [createEvent('$a', OTHER)],
    });
    const mx = bindRoom(room);

    const { unread, deleted } = getUnreadInfosForRooms(mx, [ROOM_UNREAD]);
    expect(unread).toHaveLength(0);
    expect(deleted).toContain(ROOM_UNREAD);
  });

  it('does not badge a room without receipts where our own message is newest', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: null,
      events: [createEvent('$a', OTHER), createEvent('$b', ME)],
    });
    const mx = bindRoom(room);

    const { unread, deleted } = getUnreadInfosForRooms(mx, [ROOM_UNREAD]);
    expect(unread).toHaveLength(0);
    expect(deleted).toContain(ROOM_UNREAD);
  });

  it('does not badge a room whose only activity is its creation event', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: null,
      events: [createEvent('$create', OTHER, 'm.room.create')],
    });
    const mx = bindRoom(room);

    const { unread, deleted } = getUnreadInfosForRooms(mx, [ROOM_UNREAD]);
    expect(unread).toHaveLength(0);
    expect(deleted).toContain(ROOM_UNREAD);
  });

  it('does not badge a room where our own message follows the last foreign message', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: '$missing',
      events: [
        createEvent('$a', OTHER),
        createEvent('$b', ME),
        createEvent('$c', OTHER, 'm.room.member'),
      ],
    });
    const mx = bindRoom(room);

    const { unread, deleted } = getUnreadInfosForRooms(mx, [ROOM_UNREAD]);
    expect(unread).toHaveLength(0);
    expect(deleted).toContain(ROOM_UNREAD);
  });

  // readUpTo is null because the receipt does not survive a restart on some servers.
  it('does not badge a room whose fully-read marker covers the loaded timeline', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: null,
      total: 3,
      fullyRead: '$b',
      events: [createEvent('$a', OTHER), createEvent('$b', OTHER)],
    });
    const mx = bindRoom(room);

    const { unread, deleted } = getUnreadInfosForRooms(mx, [ROOM_UNREAD]);
    expect(unread).toHaveLength(0);
    expect(deleted).toContain(ROOM_UNREAD);
  });

  it('clamps a stale highlight count when the fully-read marker covers the timeline', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: null,
      total: 2,
      highlight: 2,
      fullyRead: '$b',
      events: [createEvent('$a', OTHER), createEvent('$b', OTHER)],
    });
    const mx = bindRoom(room);

    const { unread, deleted } = getUnreadInfosForRooms(mx, [ROOM_UNREAD]);
    expect(unread).toHaveLength(0);
    expect(deleted).toContain(ROOM_UNREAD);
  });

  it('still badges when the fully-read marker is behind newer messages', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: null,
      total: 2,
      fullyRead: '$a',
      events: [createEvent('$a', OTHER), createEvent('$b', OTHER), createEvent('$c', OTHER)],
    });
    const mx = bindRoom(room);

    const { unread } = getUnreadInfosForRooms(mx, [ROOM_UNREAD]);
    expect(unread.find((u) => u.roomId === ROOM_UNREAD)?.total).toBe(2);
  });

  it('deletes rooms whose unread has dropped to zero', () => {
    const emptyRoom = createRoom(ROOM_EMPTY, { total: 0, highlight: 0, events: [] });
    const mx = createClient({ [ROOM_EMPTY]: emptyRoom });
    (emptyRoom as unknown as { client: MatrixClient }).client = mx;

    const { unread, deleted } = getUnreadInfosForRooms(mx, [ROOM_EMPTY]);
    expect(unread).toHaveLength(0);
    expect(deleted).toContain(ROOM_EMPTY);
  });
});

describe('isNotificationEvent', () => {
  const room = createRoom(ROOM_UNREAD, {
    events: [createEvent('$mine', ME), createEvent('$theirs', OTHER)],
  });

  it('counts messages, encrypted messages and stickers', () => {
    expect(isNotificationEvent(createEvent('$a', OTHER, 'm.room.message'))).toBe(true);
    expect(isNotificationEvent(createEvent('$a', OTHER, 'm.room.encrypted'))).toBe(true);
    expect(isNotificationEvent(createEvent('$a', OTHER, 'm.sticker'))).toBe(true);
  });

  it('ignores membership and other state events', () => {
    expect(isNotificationEvent(createEvent('$a', OTHER, 'm.room.member'))).toBe(false);
    expect(isNotificationEvent(createEvent('$a', OTHER, 'm.room.topic'))).toBe(false);
    expect(isNotificationEvent(createEvent('$a', OTHER, 'm.room.create'))).toBe(false);
  });

  it('ignores edits', () => {
    const edit = createEvent('$a', OTHER, 'm.room.message', {
      rel_type: 'm.replace',
      event_id: '$theirs',
    });
    expect(isNotificationEvent(edit, room, ME)).toBe(false);
  });

  it('counts a reaction only when it targets our own message', () => {
    const toMine = createEvent('$a', OTHER, 'm.reaction', {
      rel_type: 'm.annotation',
      event_id: '$mine',
    });
    const toTheirs = createEvent('$b', OTHER, 'm.reaction', {
      rel_type: 'm.annotation',
      event_id: '$theirs',
    });

    expect(isNotificationEvent(toMine, room, ME)).toBe(true);
    expect(isNotificationEvent(toTheirs, room, ME)).toBe(false);
  });

  it('ignores a reaction when the target is unknown or there is no context', () => {
    const relation = { rel_type: 'm.annotation', event_id: '$gone' };
    expect(isNotificationEvent(createEvent('$a', OTHER, 'm.reaction', relation), room, ME)).toBe(
      false
    );
    expect(isNotificationEvent(createEvent('$a', OTHER, 'm.reaction', relation))).toBe(false);
    expect(
      isNotificationEvent(
        createEvent('$a', OTHER, 'm.reaction', { rel_type: 'm.annotation' }),
        room,
        ME
      )
    ).toBe(false);
  });

  it('counts a threaded reply like a plain message', () => {
    const reply = createEvent('$a', OTHER, 'm.room.message', {
      rel_type: 'm.thread',
      event_id: '$theirs',
    });
    expect(isNotificationEvent(reply, room, ME)).toBe(true);
  });
});

describe('getUnreadInfo count sources', () => {
  it('keeps the SDK counts for a room with activity but no receipt', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: null,
      total: 7,
      highlight: 2,
      events: [createEvent('$a', OTHER)],
    });
    bindRoom(room);

    expect(getUnreadInfo(room)).toEqual({ roomId: ROOM_UNREAD, highlight: 2, total: 7 });
  });

  it('does not recount from the boundary while a highlight count survives', () => {
    const room = createRoom(ROOM_UNREAD, {
      readUpTo: '$a',
      total: 0,
      highlight: 4,
      events: [createEvent('$a', OTHER), createEvent('$b', OTHER), createEvent('$c', OTHER)],
    });
    bindRoom(room);

    expect(getUnreadInfo(room)).toEqual({ roomId: ROOM_UNREAD, highlight: 4, total: 4 });
  });
});
