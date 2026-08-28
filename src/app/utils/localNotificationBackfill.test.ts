import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient, MatrixEvent, PushProcessor, Room } from '$types/matrix-sdk';
import { Direction } from '$types/matrix-sdk';
import { NotificationType } from '$types/matrix/room';
import {
  clearLocalNotificationCache,
  getLocalNotificationCache,
} from '$client/localNotificationCache';

const state = vi.hoisted(() => ({ unread: 1, directRooms: new Set<string>() }));

vi.mock('$utils/room/hierarchy', () => ({
  getAccountData: () => ({ getContent: () => ({}) }),
  getStateEvent: () => undefined,
}));

vi.mock('$utils/room/unread', () => ({
  getMDirects: () => new Set<string>(),
  getNotificationType: () => NotificationType.AllMessages,
  getUnreadInfo: () => ({
    roomId: '!room',
    total: state.unread,
    highlight: state.unread,
  }),
  isDMRoom: (room: Room) => state.directRooms.has(room.roomId),
  isNotificationEvent: () => true,
}));

import { backfillLocalNotifications } from './localNotificationBackfill';

const USER_ID = '@me:example.org';

const notificationEvent = {
  getId: () => '$event',
  getSender: () => '@alice:example.org',
  getType: () => 'm.room.message',
  getContent: () => ({ msgtype: 'm.text', body: 'hello' }),
  getTs: () => 100,
  getRelation: () => undefined,
  isRedacted: () => false,
  isSending: () => false,
  isEncrypted: () => false,
} as unknown as MatrixEvent;

const setup = () => {
  let token: string | null = 'before';
  const timeline = {
    getEvents: () => [notificationEvent],
    getPaginationToken: (direction: Direction) => (direction === Direction.Backward ? token : null),
  };
  const room = {
    roomId: '!room',
    isSpaceRoom: () => false,
    getJoinedMemberCount: () => 3,
    getLastActiveTimestamp: () => 100,
    getLiveTimeline: () => timeline,
    hasUserReadEvent: () => false,
  } as unknown as Room;
  const scrollback = vi.fn<MatrixClient['scrollback']>(async () => {
    token = null;
    return room;
  });
  const mx = {
    getRooms: () => [room],
    getUserId: () => USER_ID,
    getSafeUserId: () => USER_ID,
    getRoomPushRule: () => undefined,
    pushRules: { global: {} },
    pushProcessor: {
      actionsForEvent: vi
        .fn<PushProcessor['actionsForEvent']>()
        .mockReturnValue({ notify: true, tweaks: { highlight: true } }),
    } as unknown as PushProcessor,
    scrollback,
  } as unknown as MatrixClient;
  return { mx, scrollback };
};

const makeHistoryRoom = (roomId: string, timestamp: number) => {
  let token: string | null = 'before';
  let frontier = timestamp;
  const roomEvent = {
    getId: () => `$${roomId}`,
    getSender: () => '@alice:example.org',
    getType: () => 'm.room.message',
    getContent: () => ({ msgtype: 'm.text', body: 'hello' }),
    getTs: () => frontier,
    getRelation: () => undefined,
    isRedacted: () => false,
    isSending: () => false,
    isEncrypted: () => false,
  } as unknown as MatrixEvent;
  const timeline = {
    getEvents: () => [roomEvent],
    getPaginationToken: () => token,
  };
  const room = {
    roomId,
    isSpaceRoom: () => false,
    getJoinedMemberCount: () => 3,
    getLastActiveTimestamp: () => timestamp,
    getLiveTimeline: () => timeline,
    hasUserReadEvent: () => false,
  } as unknown as Room;
  return {
    room,
    advance: (nextFrontier: number, nextToken: string | null) => {
      frontier = nextFrontier;
      token = nextToken;
    },
  };
};

afterEach(() => {
  clearLocalNotificationCache(USER_ID);
  localStorage.clear();
  state.unread = 1;
  state.directRooms.clear();
});

describe('backfillLocalNotifications', () => {
  it('loads and records only when sync reports unread notifications', async () => {
    const { mx, scrollback } = setup();
    await backfillLocalNotifications(mx, USER_ID, {
      storeContent: true,
      storeEncryptedContent: true,
    });

    expect(scrollback).toHaveBeenCalledOnce();
    expect(getLocalNotificationCache(USER_ID).getEntries()).toHaveLength(1);
  });

  it('does not paginate a read room', async () => {
    state.unread = 0;
    const { mx, scrollback } = setup();
    await backfillLocalNotifications(mx, USER_ID, {
      storeContent: true,
      storeEncryptedContent: true,
    });

    expect(scrollback).not.toHaveBeenCalled();
  });

  it('advances the newest room frontier instead of exhausting one room', async () => {
    const older = makeHistoryRoom('older', 100);
    const newer = makeHistoryRoom('newer', 500);
    const order: string[] = [];
    let newerPages = 0;
    const mx = Object.assign(setup().mx, {
      getRooms: () => [older.room, newer.room],
      scrollback: vi.fn<MatrixClient['scrollback']>(async (room) => {
        order.push(room.roomId);
        if (room === newer.room && newerPages === 0) {
          newerPages += 1;
          newer.advance(50, 'more');
        } else {
          (room === newer.room ? newer : older).advance(0, null);
        }
        return room;
      }),
    });

    await backfillLocalNotifications(
      mx,
      USER_ID,
      { storeContent: true, storeEncryptedContent: true },
      { includeRead: true }
    );

    expect(order).toEqual(['newer', 'older', 'newer']);
  });

  it('scans only direct rooms for DM history', async () => {
    const publicRoom = makeHistoryRoom('public', 500);
    const directRoom = makeHistoryRoom('direct', 100);
    state.directRooms.add('direct');
    const order: string[] = [];
    const mx = Object.assign(setup().mx, {
      getRooms: () => [publicRoom.room, directRoom.room],
      scrollback: vi.fn<MatrixClient['scrollback']>(async (room) => {
        order.push(room.roomId);
        (room === directRoom.room ? directRoom : publicRoom).advance(0, null);
        return room;
      }),
    });

    await backfillLocalNotifications(
      mx,
      USER_ID,
      { storeContent: true, storeEncryptedContent: true },
      { includeRead: true, tab: 'dms' }
    );

    expect(order).toEqual(['direct']);
  });
});
