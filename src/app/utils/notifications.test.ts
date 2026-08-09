import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import { NotificationCountType } from '$types/matrix-sdk';
import { markAsRead } from './notifications';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));

const userId = '@me:example.com';
const roomId = '!room:example.com';

const event = (id: string, sending = false): MatrixEvent =>
  ({
    getId: () => id,
    isSending: () => sending,
  }) as unknown as MatrixEvent;

const makeMx = (events: MatrixEvent[], readUpTo: string | null) => {
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
  const setUnreadNotificationCount = vi.fn<(type: NotificationCountType, count: number) => void>();
  const room = {
    getLiveTimeline: () => ({ getEvents: () => events }),
    getEventReadUpTo: () => readUpTo,
    setUnreadNotificationCount,
  };

  return {
    mx: {
      getRoom: (id: string) => (id === roomId ? room : null),
      getUserId: () => userId,
      setRoomReadMarkers,
    } as unknown as MatrixClient,
    setRoomReadMarkers,
    setUnreadNotificationCount,
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
});
