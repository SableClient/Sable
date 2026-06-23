import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { EventType, NotificationCountType, ReceiptType } from '$types/matrix-sdk';
import { markAsRead } from './notifications';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
}));

const ROOM_ID = '!room:example.com';
const USER_ID = '@alice:example.com';

function makeEvent(eventId: string, options?: { sending?: boolean }): MatrixEvent {
  return {
    getId: () => eventId,
    isSending: () => options?.sending ?? false,
  } as unknown as MatrixEvent;
}

function makeRoom(params: {
  events: MatrixEvent[];
  readEventId?: string;
  fullyReadEventId?: string;
  unreadTotal?: number;
  roomUnreadTotal?: number;
  unreadHighlight?: number;
}): Room {
  return {
    getLiveTimeline: () => ({
      getEvents: () => params.events,
    }),
    getEventReadUpTo: () => params.readEventId,
    getAccountData: (eventType: string) =>
      eventType === EventType.FullyRead && params.fullyReadEventId
        ? ({
            getContent: () => ({ event_id: params.fullyReadEventId }),
          } as MatrixEvent)
        : undefined,
    getUnreadNotificationCount: (type: NotificationCountType) =>
      type === NotificationCountType.Highlight
        ? (params.unreadHighlight ?? 0)
        : (params.unreadTotal ?? 0),
    getRoomUnreadNotificationCount: () => params.roomUnreadTotal ?? params.unreadTotal ?? 0,
  } as unknown as Room;
}

describe('markAsRead', () => {
  it('still writes read markers when stale unread counts remain on the current receipt target', async () => {
    const latestEvent = makeEvent('$event2');
    const room = makeRoom({
      events: [makeEvent('$event1'), latestEvent],
      readEventId: '$event2',
      fullyReadEventId: '$event2',
      unreadTotal: 1,
      roomUnreadTotal: 1,
    });

    const setRoomReadMarkers = vi
      .fn<(roomId: string, eventId: string, event: MatrixEvent) => Promise<void>>()
      .mockResolvedValue(undefined);
    const sendReadReceipt = vi.fn<MatrixClient['sendReadReceipt']>().mockResolvedValue(undefined);

    const mx = {
      getRoom: () => room,
      getUserId: () => USER_ID,
      setRoomReadMarkers,
      sendReadReceipt,
    } as unknown as MatrixClient;

    await markAsRead(mx, ROOM_ID, false);

    expect(setRoomReadMarkers).toHaveBeenCalledWith(ROOM_ID, '$event2', latestEvent);
    expect(sendReadReceipt).toHaveBeenCalledWith(latestEvent, ReceiptType.Read);
  });

  it('skips already-read rooms without stale unread counts or read markers', async () => {
    const latestEvent = makeEvent('$event2');
    const room = makeRoom({
      events: [makeEvent('$event1'), latestEvent],
      readEventId: '$event2',
      fullyReadEventId: '$event2',
    });

    const setRoomReadMarkers = vi
      .fn<(roomId: string, eventId: string, event: MatrixEvent) => Promise<void>>()
      .mockResolvedValue(undefined);
    const sendReadReceipt = vi.fn<MatrixClient['sendReadReceipt']>().mockResolvedValue(undefined);

    const mx = {
      getRoom: () => room,
      getUserId: () => USER_ID,
      setRoomReadMarkers,
      sendReadReceipt,
    } as unknown as MatrixClient;

    await markAsRead(mx, ROOM_ID, false);

    expect(setRoomReadMarkers).not.toHaveBeenCalled();
    expect(sendReadReceipt).not.toHaveBeenCalled();
  });

  it('skips already-read rooms when the fully-read marker is missing', async () => {
    const latestEvent = makeEvent('$event2');
    const room = makeRoom({
      events: [makeEvent('$event1'), latestEvent],
      readEventId: '$event2',
    });

    const setRoomReadMarkers = vi
      .fn<(roomId: string, eventId: string, event: MatrixEvent) => Promise<void>>()
      .mockResolvedValue(undefined);
    const sendReadReceipt = vi.fn<MatrixClient['sendReadReceipt']>().mockResolvedValue(undefined);

    const mx = {
      getRoom: () => room,
      getUserId: () => USER_ID,
      setRoomReadMarkers,
      sendReadReceipt,
    } as unknown as MatrixClient;

    await markAsRead(mx, ROOM_ID, false);

    expect(setRoomReadMarkers).not.toHaveBeenCalled();
    expect(sendReadReceipt).not.toHaveBeenCalled();
  });

  it('skips already-read rooms when the fully-read marker is ahead of the receipt', async () => {
    const latestReadEvent = makeEvent('$event2');
    const room = makeRoom({
      events: [makeEvent('$event1'), latestReadEvent, makeEvent('$event3', { sending: true })],
      readEventId: '$event2',
      fullyReadEventId: '$event3',
    });

    const setRoomReadMarkers = vi
      .fn<(roomId: string, eventId: string, event: MatrixEvent) => Promise<void>>()
      .mockResolvedValue(undefined);
    const sendReadReceipt = vi.fn<MatrixClient['sendReadReceipt']>().mockResolvedValue(undefined);

    const mx = {
      getRoom: () => room,
      getUserId: () => USER_ID,
      setRoomReadMarkers,
      sendReadReceipt,
    } as unknown as MatrixClient;

    await markAsRead(mx, ROOM_ID, false);

    expect(setRoomReadMarkers).not.toHaveBeenCalled();
    expect(sendReadReceipt).not.toHaveBeenCalled();
  });

  it('still writes read markers when the fully-read marker is behind the receipt', async () => {
    const latestEvent = makeEvent('$event2');
    const room = makeRoom({
      events: [makeEvent('$event1'), latestEvent],
      readEventId: '$event2',
      fullyReadEventId: '$event1',
    });

    const setRoomReadMarkers = vi
      .fn<(roomId: string, eventId: string, event: MatrixEvent) => Promise<void>>()
      .mockResolvedValue(undefined);
    const sendReadReceipt = vi.fn<MatrixClient['sendReadReceipt']>().mockResolvedValue(undefined);

    const mx = {
      getRoom: () => room,
      getUserId: () => USER_ID,
      setRoomReadMarkers,
      sendReadReceipt,
    } as unknown as MatrixClient;

    await markAsRead(mx, ROOM_ID, false);

    expect(setRoomReadMarkers).toHaveBeenCalledWith(ROOM_ID, '$event2', latestEvent);
    expect(sendReadReceipt).toHaveBeenCalledWith(latestEvent, ReceiptType.Read);
  });

  it('ignores thread-only unread counts when the room is already read', async () => {
    const latestEvent = makeEvent('$event2');
    const room = makeRoom({
      events: [makeEvent('$event1'), latestEvent],
      readEventId: '$event2',
      fullyReadEventId: '$event2',
      unreadTotal: 3,
      roomUnreadTotal: 0,
    });

    const setRoomReadMarkers = vi
      .fn<(roomId: string, eventId: string, event: MatrixEvent) => Promise<void>>()
      .mockResolvedValue(undefined);
    const sendReadReceipt = vi.fn<MatrixClient['sendReadReceipt']>().mockResolvedValue(undefined);

    const mx = {
      getRoom: () => room,
      getUserId: () => USER_ID,
      setRoomReadMarkers,
      sendReadReceipt,
    } as unknown as MatrixClient;

    await markAsRead(mx, ROOM_ID, false);

    expect(setRoomReadMarkers).not.toHaveBeenCalled();
    expect(sendReadReceipt).not.toHaveBeenCalled();
  });
});
