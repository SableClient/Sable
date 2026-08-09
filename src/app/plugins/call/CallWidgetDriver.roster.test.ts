import { describe, expect, it, vi } from 'vitest';
import type { Room } from '$types/matrix-sdk';
import { hydrateWidgetRoster } from './CallWidgetDriver';

type RoomStub = {
  loadMembersIfNeeded: () => Promise<boolean>;
  joinedInState?: number;
  joinedCount?: number;
};

const makeRoom = ({ loadMembersIfNeeded, joinedInState = 4, joinedCount = 4 }: RoomStub): Room =>
  ({
    roomId: '!room:example.org',
    loadMembersIfNeeded,
    getMembersWithMembership: () => Array.from({ length: joinedInState }, () => ({})),
    getJoinedMemberCount: () => joinedCount,
  }) as unknown as Room;

describe('hydrateWidgetRoster', () => {
  it('fetches the roster before the widget reads member state', async () => {
    const loadMembersIfNeeded = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);

    await hydrateWidgetRoster(makeRoom({ loadMembersIfNeeded }));

    expect(loadMembersIfNeeded).toHaveBeenCalledOnce();
  });

  it('still serves state when the roster request fails', async () => {
    const loadMembersIfNeeded = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValue(new Error('roster request failed'));

    await expect(hydrateWidgetRoster(makeRoom({ loadMembersIfNeeded }))).resolves.toBeUndefined();
  });

  it('does not throw when the hydrated roster is still short', async () => {
    const room = makeRoom({
      loadMembersIfNeeded: () => Promise.resolve(false),
      joinedInState: 2,
      joinedCount: 7,
    });

    await expect(hydrateWidgetRoster(room)).resolves.toBeUndefined();
  });
});
