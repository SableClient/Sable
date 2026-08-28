import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient, MatrixEvent, Thread } from '$types/matrix-sdk';
import { NotificationCountType, ReceiptType } from '$types/matrix-sdk';
import { markAsRead } from './notifications';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));

const userId = '@me:example.com';
const roomId = '!room:example.com';

const event = (id: string, sending = false): MatrixEvent =>
  ({
    getId: () => id,
    isSending: () => sending,
  }) as unknown as MatrixEvent;

type ThreadFixture = {
  id: string;
  replies: MatrixEvent[];
  readUpTo?: string | null;
  total?: number;
  highlight?: number;
};

const makeMx = (
  events: MatrixEvent[],
  readUpTo: string | null,
  threadFixtures: ThreadFixture[] = []
) => {
  const setRoomReadMarkers = vi
    .fn<
      (
        roomId: string,
        eventId: string,
        read?: MatrixEvent,
        fullyRead?: MatrixEvent
      ) => Promise<void>
    >()
    .mockResolvedValue();
  const sendReadReceipt = vi
    .fn<(event: MatrixEvent, receiptType: ReceiptType) => Promise<void>>()
    .mockResolvedValue();
  const setUnreadNotificationCount = vi.fn<(type: NotificationCountType, count: number) => void>();
  const setThreadUnreadNotificationCount =
    vi.fn<(threadId: string, type: NotificationCountType, count: number) => void>();

  const threads = threadFixtures.map(
    (fixture) =>
      ({
        id: fixture.id,
        lastReply: (matches: (ev: MatrixEvent) => boolean) =>
          fixture.replies.findLast(matches) ?? null,
        getEventReadUpTo: () => fixture.readUpTo ?? null,
      }) as unknown as Thread
  );

  const room = {
    roomId,
    getLiveTimeline: () => ({ getEvents: () => events }),
    getEventReadUpTo: () => readUpTo,
    setUnreadNotificationCount,
    getThreads: () => threads,
    getThreadUnreadNotificationCount: (threadId: string, type: NotificationCountType) => {
      const fixture = threadFixtures.find((t) => t.id === threadId);
      return (type === NotificationCountType.Highlight ? fixture?.highlight : fixture?.total) ?? 0;
    },
    setThreadUnreadNotificationCount,
  };

  return {
    mx: {
      getRoom: (id: string) => (id === roomId ? room : null),
      getUserId: () => userId,
      setRoomReadMarkers,
      sendReadReceipt,
    } as unknown as MatrixClient,
    setRoomReadMarkers,
    sendReadReceipt,
    setUnreadNotificationCount,
    setThreadUnreadNotificationCount,
  };
};

// The live timeline is in timeline order, so the newest event is last. Ordering
// defects belong in the sliding-sync layer, not here.
describe('markAsRead', () => {
  it('marks read up to the last event in the timeline', async () => {
    const { mx, setRoomReadMarkers, setUnreadNotificationCount } = makeMx(
      [event('$older'), event('$newest')],
      null
    );

    await markAsRead(mx, roomId, false);

    expect(setRoomReadMarkers).toHaveBeenCalledWith(roomId, '$newest', expect.anything());
    expect(setUnreadNotificationCount).toHaveBeenCalledWith(NotificationCountType.Total, 0);
    expect(setUnreadNotificationCount).toHaveBeenCalledWith(NotificationCountType.Highlight, 0);
  });

  it('does nothing when the last event is already read', async () => {
    const { mx, setRoomReadMarkers, setUnreadNotificationCount } = makeMx(
      [event('$older'), event('$newest')],
      '$newest'
    );

    await markAsRead(mx, roomId, false);

    expect(setRoomReadMarkers).not.toHaveBeenCalled();
    expect(setUnreadNotificationCount).not.toHaveBeenCalled();
  });

  it('ignores events that are still sending', async () => {
    const { mx, setRoomReadMarkers } = makeMx([event('$confirmed'), event('$local', true)], null);

    await markAsRead(mx, roomId, false);

    expect(setRoomReadMarkers.mock.calls[0]?.[1]).toBe('$confirmed');
  });

  it('sends a private receipt when reads are hidden', async () => {
    const { mx, setRoomReadMarkers } = makeMx([event('$newest')], null);

    await markAsRead(mx, roomId, true);

    expect(setRoomReadMarkers).toHaveBeenCalledWith(
      roomId,
      '$newest',
      undefined,
      expect.anything()
    );
  });

  it('does nothing for an empty timeline', async () => {
    const { mx, setRoomReadMarkers, setUnreadNotificationCount } = makeMx([], null);

    await markAsRead(mx, roomId, false);

    expect(setRoomReadMarkers).not.toHaveBeenCalled();
    expect(setUnreadNotificationCount).not.toHaveBeenCalled();
  });

  it('leaves threads alone by default', async () => {
    const { mx, sendReadReceipt, setThreadUnreadNotificationCount } = makeMx(
      [event('$newest')],
      null,
      [{ id: '$root', replies: [event('$reply')], total: 1 }]
    );

    await markAsRead(mx, roomId, false);

    expect(sendReadReceipt).not.toHaveBeenCalled();
    expect(setThreadUnreadNotificationCount).not.toHaveBeenCalled();
  });

  it('clears unread threads when asked, even if the main timeline is already read', async () => {
    const { mx, setRoomReadMarkers, sendReadReceipt, setThreadUnreadNotificationCount } = makeMx(
      [event('$newest')],
      '$newest',
      [{ id: '$root', replies: [event('$reply')], total: 1 }]
    );

    await markAsRead(mx, roomId, false, true);

    expect(setRoomReadMarkers).not.toHaveBeenCalled();
    expect(sendReadReceipt).toHaveBeenCalledWith(expect.anything(), ReceiptType.Read);
    expect(sendReadReceipt.mock.calls[0]?.[0].getId()).toBe('$reply');
    expect(setThreadUnreadNotificationCount).toHaveBeenCalledWith(
      '$root',
      NotificationCountType.Total,
      0
    );
    expect(setThreadUnreadNotificationCount).toHaveBeenCalledWith(
      '$root',
      NotificationCountType.Highlight,
      0
    );
  });

  it('skips threads that have no unread count', async () => {
    const { mx, sendReadReceipt, setThreadUnreadNotificationCount } = makeMx(
      [event('$newest')],
      '$newest',
      [{ id: '$root', replies: [event('$reply')], total: 0, highlight: 0 }]
    );

    await markAsRead(mx, roomId, false, true);

    expect(sendReadReceipt).not.toHaveBeenCalled();
    expect(setThreadUnreadNotificationCount).not.toHaveBeenCalled();
  });

  it('clears a thread already read up to its last reply without resending a receipt', async () => {
    const { mx, sendReadReceipt, setThreadUnreadNotificationCount } = makeMx(
      [event('$newest')],
      '$newest',
      [{ id: '$root', replies: [event('$reply')], readUpTo: '$reply', highlight: 1 }]
    );

    await markAsRead(mx, roomId, false, true);

    expect(sendReadReceipt).not.toHaveBeenCalled();
    expect(setThreadUnreadNotificationCount).toHaveBeenCalledWith(
      '$root',
      NotificationCountType.Total,
      0
    );
  });

  it('sends private thread receipts when reads are hidden', async () => {
    const { mx, sendReadReceipt } = makeMx([event('$newest')], '$newest', [
      { id: '$root', replies: [event('$reply')], total: 1 },
    ]);

    await markAsRead(mx, roomId, true, true);

    expect(sendReadReceipt).toHaveBeenCalledWith(expect.anything(), ReceiptType.ReadPrivate);
  });

  it('ignores thread replies that are still sending', async () => {
    const { mx, sendReadReceipt } = makeMx([event('$newest')], '$newest', [
      { id: '$root', replies: [event('$reply'), event('$local', true)], total: 1 },
    ]);

    await markAsRead(mx, roomId, false, true);

    expect(sendReadReceipt.mock.calls[0]?.[0].getId()).toBe('$reply');
  });

  it('keeps the thread count when the receipt is rejected', async () => {
    const { mx, sendReadReceipt, setThreadUnreadNotificationCount } = makeMx(
      [event('$newest')],
      '$newest',
      [{ id: '$root', replies: [event('$reply')], total: 1 }]
    );
    sendReadReceipt.mockRejectedValue(new Error('nope'));

    await markAsRead(mx, roomId, false, true);

    expect(setThreadUnreadNotificationCount).not.toHaveBeenCalled();
  });
});
