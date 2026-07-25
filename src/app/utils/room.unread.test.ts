import { describe, expect, it, vi } from 'vitest';
import { KnownMembership, NotificationCountType } from '$types/matrix-sdk';
import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { getUnreadInfosForRooms } from './room/unread';

const SPACE = '!space:example.com';
const ROOM_UNREAD = '!unread:example.com';
const ROOM_EMPTY = '!empty:example.com';
const ROOM_MUTED = '!muted:example.com';
const ROOM_LEFT = '!left:example.com';
const MISSING = '!missing:example.com';

const createEvent = (id: string, sender: string, type = 'm.room.message'): MatrixEvent =>
  ({
    getId: () => id,
    getSender: () => sender,
    getType: () => type,
    isRedacted: () => false,
    getRelation: () => undefined,
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
  } = {}
): Room => {
  const {
    isSpace = false,
    membership = KnownMembership.Join,
    total = 0,
    highlight = 0,
    readUpTo = '$read',
    events = [],
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
    getLiveTimeline: () => ({ getEvents: () => events }),
    getAccountData: () => undefined,
    client,
  } as unknown as Room;
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

  it('deletes rooms whose unread has dropped to zero', () => {
    const emptyRoom = createRoom(ROOM_EMPTY, { total: 0, highlight: 0, events: [] });
    const mx = createClient({ [ROOM_EMPTY]: emptyRoom });
    (emptyRoom as unknown as { client: MatrixClient }).client = mx;

    const { unread, deleted } = getUnreadInfosForRooms(mx, [ROOM_EMPTY]);
    expect(unread).toHaveLength(0);
    expect(deleted).toContain(ROOM_EMPTY);
  });
});
