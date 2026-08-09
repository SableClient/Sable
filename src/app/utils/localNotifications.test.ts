import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient, MatrixEvent, PushProcessor, Room } from '$types/matrix-sdk';
import { NotificationType } from '$types/matrix/room';
import {
  evaluateNotification,
  isStoredNotificationRead,
  sliceNotificationPage,
  type StoredNotification,
} from './localNotifications';

const ROOM_ID = '!room:example.org';
const USER_ID = '@me:example.org';

const event = (overrides: Partial<MatrixEvent> = {}): MatrixEvent =>
  ({
    getId: () => '$event',
    getSender: () => '@alice:example.org',
    getType: () => 'm.room.message',
    getContent: () => ({ msgtype: 'm.text', body: 'Hello' }),
    getTs: () => 100,
    getRelation: () => undefined,
    isRedacted: () => false,
    isSending: () => false,
    ...overrides,
  }) as unknown as MatrixEvent;

const room = (overrides: Partial<Room> = {}): Room =>
  ({
    roomId: ROOM_ID,
    isSpaceRoom: () => false,
    getJoinedMemberCount: () => 3,
    ...overrides,
  }) as unknown as Room;

const client = (actions = { notify: true, tweaks: {} }): MatrixClient =>
  ({
    getSafeUserId: () => USER_ID,
    getUserId: () => USER_ID,
    pushRules: { global: {} },
    pushProcessor: {
      actionsForEvent: vi.fn<PushProcessor['actionsForEvent']>().mockReturnValue(actions),
    } as unknown as PushProcessor,
  }) as unknown as MatrixClient;

describe('evaluateNotification', () => {
  it('records notifying events and their highlight/DM classification', () => {
    const result = evaluateNotification(
      client({ notify: true, tweaks: { highlight: true } }),
      room(),
      event(),
      new Set([ROOM_ID]),
      NotificationType.AllMessages
    );

    expect(result).toMatchObject({
      room_id: ROOM_ID,
      highlight: true,
      isDM: true,
    });
  });

  it('applies the DM policy when push rules do not notify', () => {
    const result = evaluateNotification(
      client({ notify: false, tweaks: {} }),
      room(),
      event(),
      new Set([ROOM_ID]),
      NotificationType.AllMessages
    );

    expect(result?.isDM).toBe(true);
  });

  it.each([
    ['muted room', room(), event(), NotificationType.Mute],
    ['space', room({ isSpaceRoom: () => true }), event(), NotificationType.AllMessages],
    ['self event', room(), event({ getSender: () => USER_ID }), NotificationType.AllMessages],
  ])('rejects a %s', (_name, targetRoom, targetEvent, notificationType) => {
    expect(
      evaluateNotification(
        client(),
        targetRoom as Room,
        targetEvent as MatrixEvent,
        new Set(),
        notificationType as NotificationType
      )
    ).toBeUndefined();
  });
});

const stored = (
  id: string,
  ts: number,
  options: Partial<StoredNotification> = {}
): StoredNotification =>
  ({
    room_id: ROOM_ID,
    event: { event_id: id, type: 'm.room.message' },
    ts,
    highlight: false,
    isDM: false,
    ...options,
  }) as StoredNotification;

describe('sliceNotificationPage', () => {
  const entries = [
    stored('$dm', 3, { isDM: true }),
    stored('$mention', 2, { highlight: true }),
    stored('$other', 1),
  ];

  it.each([
    ['dms', ['$dm']],
    ['mentions', ['$mention']],
    ['all', ['$dm', '$mention', '$other']],
  ] as const)('implements the %s tab', (tab, ids) => {
    const result = sliceNotificationPage(entries, 0, 10, tab, true, () => false);
    expect(result.page.map((entry) => entry.event.event_id)).toEqual(ids);
  });

  it('filters read entries and paginates newest first', () => {
    const result = sliceNotificationPage(entries, 0, 1, 'all', false, (entry) => entry.ts === 3);
    expect(result.page[0]?.event.event_id).toBe('$mention');
    expect(result.nextToken).toBe('1');
  });
});

describe('isStoredNotificationRead', () => {
  it('uses the SDK read relation when the event is loaded', () => {
    const targetRoom = room({
      findEventById: () => event(),
      hasUserReadEvent: () => true,
    });
    expect(isStoredNotificationRead(targetRoom, USER_ID, stored('$event', 100))).toBe(true);
  });

  it('falls back to receipt timestamps for cached events', () => {
    const targetRoom = room({
      findEventById: () => undefined,
      getReadReceiptForUserId: () => ({ data: { ts: 100 } }) as never,
    });
    expect(isStoredNotificationRead(targetRoom, USER_ID, stored('$event', 100))).toBe(true);
  });
});
