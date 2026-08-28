import { describe, expect, it } from 'vitest';
import type { Room } from '$types/matrix-sdk';
import type { RoomToUnread } from '$types/matrix/room';
import { countInboxNotifications } from './useInboxNotificationCount';

const room = (roomId: string): Room =>
  ({
    roomId,
    isSpaceRoom: () => false,
    getJoinedMemberCount: () => 3,
  }) as unknown as Room;

describe('countInboxNotifications', () => {
  it('counts all DM notifications and only highlights elsewhere', () => {
    const rooms = [room('!dm'), room('!room')];
    const unread = new Map([
      ['!dm', { total: 4, highlight: 1, from: null }],
      ['!room', { total: 8, highlight: 2, from: null }],
    ]) as RoomToUnread;

    expect(countInboxNotifications(rooms, unread, new Set(['!dm']))).toBe(6);
  });

  it('skips space rooms so aggregated space counts are not double-counted', () => {
    const space = {
      roomId: '!space',
      isSpaceRoom: () => true,
      getJoinedMemberCount: () => 3,
    } as unknown as Room;
    const rooms = [room('!room'), space];
    const unread = new Map([
      ['!room', { total: 4, highlight: 1, from: null }],
      ['!space', { total: 4, highlight: 1, from: new Set(['!room']) }],
    ]) as RoomToUnread;

    expect(countInboxNotifications(rooms, unread, new Set())).toBe(1);
  });
});
