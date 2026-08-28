import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MatrixClient, Room, RoomMember } from '$types/matrix-sdk';
import { EventType } from '$types/matrix-sdk';

import {
  hydrateAllRoomMembers,
  hydrateRoomMember,
  hydrateRoomMembers,
} from './roomMemberHydration';

const ROOM_ID = '!room:server';
const USER_ID = '@ghost:server';

type FakeSetup = {
  mx: MatrixClient;
  room: Room;
  getStateEvent: ReturnType<typeof vi.fn>;
  setStateEvents: ReturnType<typeof vi.fn>;
  getMember: ReturnType<typeof vi.fn>;
};

const makeFakes = (): FakeSetup => {
  const getMember = vi.fn<() => RoomMember | null>(() => null);
  const setStateEvents = vi.fn<() => void>();
  const room = {
    roomId: ROOM_ID,
    getMember,
    currentState: { setStateEvents },
  } as unknown as Room;
  const getStateEvent = vi.fn<() => Promise<object>>(() =>
    Promise.resolve({ membership: 'join', avatar_url: 'mxc://server/abc' })
  );
  const mx = {
    getRoom: () => room,
    getStateEvent,
  } as unknown as MatrixClient;
  return { mx, room, getStateEvent, setStateEvents, getMember };
};

describe('hydrateRoomMember', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches and injects a missing member', async () => {
    const { mx, getStateEvent, setStateEvents } = makeFakes();

    await hydrateRoomMember(mx, ROOM_ID, USER_ID);

    expect(getStateEvent).toHaveBeenCalledWith(ROOM_ID, EventType.RoomMember, USER_ID);
    expect(setStateEvents).toHaveBeenCalledTimes(1);
    const [events] = setStateEvents.mock.calls[0] as [Array<{ getType: () => string }>];
    expect(events[0]?.getType()).toBe(EventType.RoomMember);
  });

  it('does nothing when the member already exists', async () => {
    const { mx, getStateEvent, getMember } = makeFakes();
    getMember.mockReturnValue({} as RoomMember);

    await hydrateRoomMember(mx, ROOM_ID, USER_ID);

    expect(getStateEvent).not.toHaveBeenCalled();
  });

  it('skips injection when the member appears while the fetch is in flight', async () => {
    const { mx, getMember, setStateEvents } = makeFakes();
    const promise = hydrateRoomMember(mx, ROOM_ID, USER_ID);
    getMember.mockReturnValue({} as RoomMember);

    await promise;

    expect(setStateEvents).not.toHaveBeenCalled();
  });

  it('dedups concurrent requests for the same member', async () => {
    const { mx, getStateEvent } = makeFakes();

    await Promise.all([
      hydrateRoomMember(mx, ROOM_ID, USER_ID),
      hydrateRoomMember(mx, ROOM_ID, USER_ID),
    ]);

    expect(getStateEvent).toHaveBeenCalledTimes(1);
  });

  it('negative-caches failed fetches and retries after the TTL', async () => {
    const { mx, getStateEvent } = makeFakes();
    getStateEvent.mockRejectedValueOnce(new Error('404'));

    await expect(hydrateRoomMember(mx, ROOM_ID, USER_ID)).resolves.toBeUndefined();
    expect(getStateEvent).toHaveBeenCalledTimes(1);

    // Within the TTL the failure is cached — no refetch.
    await hydrateRoomMember(mx, ROOM_ID, USER_ID);
    expect(getStateEvent).toHaveBeenCalledTimes(1);

    // After the TTL the fetch is retried.
    vi.advanceTimersByTime(5 * 60_000 + 1);
    await hydrateRoomMember(mx, ROOM_ID, USER_ID);
    expect(getStateEvent).toHaveBeenCalledTimes(2);
  });

  it('clears the failure entry on a later success', async () => {
    const { mx, getStateEvent, setStateEvents, getMember } = makeFakes();
    getStateEvent.mockRejectedValueOnce(new Error('404'));

    await hydrateRoomMember(mx, ROOM_ID, USER_ID);
    vi.advanceTimersByTime(5 * 60_000 + 1);
    await hydrateRoomMember(mx, ROOM_ID, USER_ID);
    expect(setStateEvents).toHaveBeenCalledTimes(1);

    // The stale failure no longer blocks further hydration attempts.
    getMember.mockReturnValue(null);
    await hydrateRoomMember(mx, ROOM_ID, USER_ID);
    expect(getStateEvent).toHaveBeenCalledTimes(3);
  });
});

describe('hydrateRoomMember (force)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-fetches and injects state when force=true even if the member exists', async () => {
    const { mx, getStateEvent, setStateEvents, getMember } = makeFakes();
    getMember.mockReturnValue({ rawDisplayName: 'OldName' } as RoomMember);

    await hydrateRoomMember(mx, ROOM_ID, USER_ID, true);

    expect(getStateEvent).toHaveBeenCalledTimes(1);
    expect(setStateEvents).toHaveBeenCalledTimes(1);
  });

  it('respects the refresh cooldown so repeated force calls do not refetch', async () => {
    const { mx, getStateEvent, getMember } = makeFakes();
    getMember.mockReturnValue({ rawDisplayName: 'OldName' } as RoomMember);

    await hydrateRoomMember(mx, ROOM_ID, USER_ID, true);
    await hydrateRoomMember(mx, ROOM_ID, USER_ID, true);

    expect(getStateEvent).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10 * 60_000 + 1);
    await hydrateRoomMember(mx, ROOM_ID, USER_ID, true);

    expect(getStateEvent).toHaveBeenCalledTimes(2);
  });
});

type BulkFakeSetup = {
  mx: MatrixClient;
  members: ReturnType<typeof vi.fn>;
  setStateEvents: ReturnType<typeof vi.fn>;
};

const makeBulkFakes = (
  joinedMembers: number,
  joinedCount: number,
  knownMemberIds: string[] = []
): BulkFakeSetup => {
  const setStateEvents = vi.fn<() => void>();
  const room = {
    roomId: ROOM_ID,
    getJoinedMembers: () => Array.from({ length: joinedMembers }, () => ({}) as RoomMember),
    getJoinedMemberCount: () => joinedCount,
    getMember: (userId: string) => (knownMemberIds.includes(userId) ? ({} as RoomMember) : null),
    currentState: { setStateEvents },
  } as unknown as Room;
  const members = vi.fn<() => Promise<object>>(() =>
    Promise.resolve({
      chunk: [
        {
          type: EventType.RoomMember,
          state_key: USER_ID,
          room_id: ROOM_ID,
          sender: USER_ID,
          content: { membership: 'join' },
        },
      ],
    })
  );
  const mx = {
    getRoom: () => room,
    members,
  } as unknown as MatrixClient;
  return { mx, members, setStateEvents };
};

describe('hydrateAllRoomMembers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches the full member list when the roster is short of the joined count', async () => {
    const { mx, members, setStateEvents } = makeBulkFakes(2, 20);

    await hydrateAllRoomMembers(mx, ROOM_ID);

    expect(members).toHaveBeenCalledWith(ROOM_ID, undefined, 'leave');
    const [events] = setStateEvents.mock.calls[0] as [Array<{ getType: () => string }>];
    expect(events[0]?.getType()).toBe(EventType.RoomMember);
  });

  it('skips members the room already knows', async () => {
    const { mx, setStateEvents } = makeBulkFakes(2, 20, [USER_ID]);

    await hydrateAllRoomMembers(mx, ROOM_ID);

    expect(setStateEvents).not.toHaveBeenCalled();
  });

  it('does nothing when the roster already matches the joined count', async () => {
    const { mx, members } = makeBulkFakes(20, 20);

    await hydrateAllRoomMembers(mx, ROOM_ID);

    expect(members).not.toHaveBeenCalled();
  });

  it('does not refetch within the TTL and retries after it', async () => {
    const { mx, members } = makeBulkFakes(2, 20);

    await hydrateAllRoomMembers(mx, ROOM_ID);
    await hydrateAllRoomMembers(mx, ROOM_ID);
    expect(members).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60_000 + 1);
    await hydrateAllRoomMembers(mx, ROOM_ID);
    expect(members).toHaveBeenCalledTimes(2);
  });

  it('retries within the TTL when the joined count grows', async () => {
    let joinedCount = 3;
    const setStateEvents = vi.fn<() => void>();
    const room = {
      roomId: ROOM_ID,
      getJoinedMembers: () => [{}, {}] as RoomMember[],
      getJoinedMemberCount: () => joinedCount,
      getMember: () => null,
      currentState: { setStateEvents },
    } as unknown as Room;
    const members = vi.fn<() => Promise<object>>(() => Promise.resolve({ chunk: [] }));
    const mx = { getRoom: () => room, members } as unknown as MatrixClient;

    await hydrateAllRoomMembers(mx, ROOM_ID);
    await hydrateAllRoomMembers(mx, ROOM_ID);
    expect(members).toHaveBeenCalledTimes(1);

    joinedCount = 20;
    await hydrateAllRoomMembers(mx, ROOM_ID);
    expect(members).toHaveBeenCalledTimes(2);
  });

  it('swallows a failed fetch', async () => {
    const { mx, members, setStateEvents } = makeBulkFakes(2, 20);
    members.mockRejectedValueOnce(new Error('403'));

    await expect(hydrateAllRoomMembers(mx, ROOM_ID)).resolves.toBeUndefined();
    expect(setStateEvents).not.toHaveBeenCalled();
  });
});

describe('hydrateRoomMembers', () => {
  it('dedups user ids and filters non-user ids', async () => {
    const { mx, getStateEvent } = makeFakes();

    await hydrateRoomMembers(mx, ROOM_ID, [USER_ID, USER_ID, 'not-a-user', '@other:server']);

    expect(getStateEvent).toHaveBeenCalledTimes(2);
    expect(getStateEvent).toHaveBeenCalledWith(ROOM_ID, EventType.RoomMember, USER_ID);
    expect(getStateEvent).toHaveBeenCalledWith(ROOM_ID, EventType.RoomMember, '@other:server');
  });

  it('limits concurrent member requests', async () => {
    const { mx, getStateEvent } = makeFakes();
    const resolveRequests: Array<() => void> = [];
    getStateEvent.mockImplementation(
      () =>
        new Promise<object>((resolve) => {
          resolveRequests.push(() => resolve({ membership: 'join' }));
        })
    );

    const requests = Array.from({ length: 6 }, (_, index) =>
      hydrateRoomMember(mx, ROOM_ID, `@user-${index}:server`)
    );

    expect(getStateEvent).toHaveBeenCalledTimes(4);
    resolveRequests.splice(0).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(getStateEvent).toHaveBeenCalledTimes(6));
    resolveRequests.splice(0).forEach((resolve) => resolve());
    await Promise.all(requests);
  });
});
