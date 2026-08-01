/**
 * Unit tests for SlidingSyncManager memory management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MatrixClient, MatrixEvent, MSC3575List } from '$types/matrix-sdk';
import { EventType, KnownMembership, SlidingSyncEvent, SlidingSyncState } from '$types/matrix-sdk';

import { scopeEphemeralExtensions, SlidingSyncManager } from './slidingSync';
import type { SlidingSyncSidebarCache } from './slidingSyncSidebarCache';

// ── vi.hoisted mocks ─────────────────────────────────────────────────────────
// Must be defined via vi.hoisted
const mocks = vi.hoisted(() => ({
  slidingSyncConstructorArgs: undefined as unknown[] | undefined,
  slidingSyncInstance: {
    on: vi.fn<(event: unknown, handler: unknown) => void>(),
    off: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
    stop: vi.fn<() => void>(),
    modifyRoomSubscriptions: vi.fn<() => void>(),
    modifyRoomSubscriptionInfo: vi.fn<() => void>(),
    addCustomSubscription: vi.fn<() => void>(),
    useCustomSubscription: vi.fn<() => void>(),
    registerExtension: vi.fn<() => void>(),
    getListData: vi.fn<(key: string) => null>(),
    getListParams: vi.fn<(key: string) => null>(),
    setList: vi.fn<() => void>(),
    setListRanges: vi.fn<(key: string, ranges: number[][]) => void>(),
  },
}));

// ── Sentry stub ──────────────────────────────────────────────────────────────
vi.mock('@sentry/react', () => ({
  metrics: {
    count: vi.fn<() => void>(),
    gauge: vi.fn<() => void>(),
    distribution: vi.fn<() => void>(),
  },
  addBreadcrumb: vi.fn<() => void>(),
  startInactiveSpan:
    vi.fn<() => { setAttribute: () => void; setAttributes: () => void; end: () => void }>(),
  startSpan: vi.fn<() => Promise<unknown>>(),
}));

// ── SlidingSync SDK mock ─────────────────────────────────────────────────────
// A plain function constructor is the correct pattern
vi.mock('$types/matrix-sdk', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  function MockSlidingSync(...args: unknown[]) {
    mocks.slidingSyncConstructorArgs = args;
    return mocks.slidingSyncInstance;
  }
  return { ...actual, SlidingSync: MockSlidingSync };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMockMx(overrides: Record<string, unknown> = {}) {
  return {
    getUserId: vi.fn<() => string>().mockReturnValue('@user:example.com'),
    getSafeUserId: vi.fn<() => string>().mockReturnValue('@user:example.com'),
    isRoomEncrypted: vi.fn<() => boolean>().mockReturnValue(false),
    getRoom: vi.fn<() => null>().mockReturnValue(null),
    getJoinedRooms: vi.fn<() => Promise<{ joined_rooms: string[] }>>().mockResolvedValue({
      joined_rooms: [],
    }),
    store: {
      removeRoom: vi.fn<() => void>(),
    },
    on: vi.fn<() => void>(),
    off: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
    ...overrides,
  } as unknown as MatrixClient;
}

function makeManager(mx: ReturnType<typeof makeMockMx>): SlidingSyncManager {
  return new SlidingSyncManager(mx, 'https://sliding.example.com');
}

function makeMemberRoom(roomId: string, initialMembership: string = KnownMembership.Invite) {
  // Tracked separately, as in the SDK: updateMyMembership() touches only the former.
  let selfMembership = initialMembership;
  let memberEventMembership = initialMembership;
  const setStateEvents = vi.fn<(events: MatrixEvent[]) => void>((events) => {
    const membership = events[0]?.getContent().membership;
    if (typeof membership === 'string') memberEventMembership = membership;
  });
  return {
    roomId,
    setStateEvents,
    /** Simulate Room.recalculate() reading a stale invite back out. */
    setMembership: (next: string) => {
      selfMembership = next;
      memberEventMembership = next;
    },
    getMyMembership: vi.fn<() => string>(() => selfMembership),
    updateMyMembership: vi.fn<(next: string) => void>((next) => {
      selfMembership = next;
    }),
    getLiveTimeline: vi.fn<() => unknown>(() => ({
      getEvents: () => [],
      getState: () => ({
        getStateEvents: () => ({
          getContent: () => ({
            membership: memberEventMembership,
            displayname: 'Alice',
          }),
        }),
        setStateEvents,
      }),
    })),
  };
}

const trackedJoins = (manager: SlidingSyncManager): Map<string, unknown> =>
  (manager as unknown as { optimisticallyJoinedRoomIds: Map<string, unknown> })
    .optimisticallyJoinedRoomIds;

function makeRoomWithTimeline(eventCount: number) {
  const events = Array.from({ length: eventCount }, () => ({ status: null }));
  return {
    getLiveTimeline: vi.fn<() => { getEvents: () => typeof events }>(() => ({
      getEvents: () => events,
    })),
    resetLiveTimeline: vi.fn<() => void>(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.slidingSyncInstance.getListData.mockReset().mockReturnValue(null);
  mocks.slidingSyncInstance.getListParams.mockReset().mockReturnValue(null);
  mocks.slidingSyncInstance.setListRanges.mockReset();
  mocks.slidingSyncConstructorArgs = undefined;
});

function fireLifecycle(state: SlidingSyncState, response: unknown = {}) {
  const lifecycleCall = mocks.slidingSyncInstance.on.mock.calls.find(
    ([event]) => event === SlidingSyncEvent.Lifecycle
  );
  const lifecycle = lifecycleCall?.[1] as
    | ((nextState: SlidingSyncState, nextResponse: unknown, error?: Error) => void)
    | undefined;
  lifecycle?.(state, response);
}

function fireRoomData(roomId: string, data: Record<string, unknown> = {}) {
  const roomDataHandler = mocks.slidingSyncInstance.on.mock.calls
    .toReversed()
    .find(([event]) => event === SlidingSyncEvent.RoomData)?.[1] as
    | ((dataRoomId: string, data: unknown) => void)
    | undefined;
  roomDataHandler?.(roomId, data);
}

describe('SlidingSyncManager initial request', () => {
  it('starts with a small room-list range and only row-level state', () => {
    makeManager(makeMockMx());

    const lists = mocks.slidingSyncConstructorArgs?.[1] as Map<string, MSC3575List>;
    const joined = lists.get('joined');
    const updates = lists.get('updates');
    const defaultSubscription = mocks.slidingSyncConstructorArgs?.[2] as {
      timeline_limit: number;
      required_state: string[][];
    };

    expect(joined?.ranges).toEqual([[0, 29]]);
    expect(joined?.timeline_limit).toBe(1);
    expect(joined?.required_state).toHaveLength(10);
    expect(joined?.required_state).toContainEqual([EventType.RoomJoinRules, '']);
    expect(joined?.required_state).not.toContainEqual(['m.space.child', '*']);
    expect(updates).toMatchObject({
      ranges: [[0, 29]],
      timeline_limit: 1,
      required_state: [[EventType.RoomMember, '$ME']],
      filters: { is_invite: false },
    });
    expect(defaultSubscription.timeline_limit).toBe(50);
    expect(defaultSubscription.required_state).toContainEqual([EventType.RoomMember, '$LAZY']);
    expect(defaultSubscription.required_state).not.toContainEqual([EventType.RoomMember, '*']);
    expect(mocks.slidingSyncConstructorArgs?.[4]).toBe(45000);
  });

  it('settles response processing after post-response work can finish', async () => {
    const manager = makeManager(makeMockMx());
    const settled = vi.fn<(dirtyRoomIds: ReadonlySet<string>) => void>();
    manager.subscribeToResponseSettled(settled);
    manager.attach();

    fireLifecycle(SlidingSyncState.RequestFinished, {});
    expect(manager.isResponseProcessing()).toBe(true);

    fireLifecycle(SlidingSyncState.Complete, {});
    expect(manager.isResponseProcessing()).toBe(true);
    expect(settled).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(manager.isResponseProcessing()).toBe(false);
    expect(settled).toHaveBeenCalledOnce();
  });

  it('includes receipt-only and account-data-only rooms in the settled unread delta', async () => {
    const manager = makeManager(makeMockMx());
    const settled = vi.fn<(dirtyRoomIds: ReadonlySet<string>) => void>();
    manager.subscribeToResponseSettled(settled);
    manager.attach();

    fireLifecycle(SlidingSyncState.RequestFinished, {});
    fireLifecycle(SlidingSyncState.Complete, {
      rooms: {},
      extensions: {
        receipts: {
          rooms: {
            '!receipt:example.com': {
              type: 'm.receipt',
              content: {},
            },
          },
        },
        account_data: {
          rooms: {
            '!account-data:example.com': [
              {
                type: EventType.FullyRead,
                content: { event_id: '$event' },
              },
            ],
          },
        },
      },
    });

    await Promise.resolve();

    expect(settled).toHaveBeenCalledOnce();
    expect([...settled.mock.calls[0]![0]]).toEqual([
      '!receipt:example.com',
      '!account-data:example.com',
    ]);
  });

  it('excludes account_data rooms with no events from the dirty set', async () => {
    const manager = makeManager(makeMockMx());
    const settled = vi.fn<(dirtyRoomIds: ReadonlySet<string>) => void>();
    manager.subscribeToResponseSettled(settled);
    manager.attach();

    fireLifecycle(SlidingSyncState.RequestFinished, {});
    fireLifecycle(SlidingSyncState.Complete, {
      rooms: {},
      extensions: {
        account_data: {
          rooms: {
            '!unchanged:example.com': [],
            '!changed:example.com': [
              {
                type: EventType.FullyRead,
                content: { event_id: '$event' },
              },
            ],
          },
        },
      },
    });

    await Promise.resolve();

    expect(settled).toHaveBeenCalledOnce();
    expect([...settled.mock.calls[0]![0]]).toEqual(['!changed:example.com']);
  });

  it('marks only rooms with real data dirty across a full sync response', async () => {
    const manager = makeManager(makeMockMx());
    const settled = vi.fn<(dirtyRoomIds: ReadonlySet<string>) => void>();
    manager.subscribeToResponseSettled(settled);
    manager.attach();

    fireLifecycle(SlidingSyncState.RequestFinished, {});
    fireRoomData('!real:example.com', { initial: false });
    fireLifecycle(SlidingSyncState.Complete, {
      rooms: {
        '!real:example.com': { name: 'Real Room', notification_count: 0, highlight_count: 0 },
      },
      extensions: {
        account_data: {
          rooms: Object.fromEntries(
            Array.from({ length: 50 }, (_, i) => [`!empty${i}:example.com`, []])
          ),
        },
        receipts: {
          rooms: {
            '!real:example.com': {
              type: 'm.receipt',
              content: {},
            },
          },
        },
      },
    });

    await Promise.resolve();

    expect(settled).toHaveBeenCalledOnce();
    const dirty = [...settled.mock.calls[0]![0]];
    // Only the room that actually received data — not the 50 empty echoes.
    expect(dirty).toEqual(['!real:example.com']);
    expect(dirty).toHaveLength(1);
  });

  it('does not fan out member requests for users referenced by startup sync', async () => {
    const getStateEvent = vi.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({
      membership: KnownMembership.Join,
    });
    const room = {
      getMember: vi.fn<() => undefined>(),
      currentState: { setStateEvents: vi.fn<() => void>() },
    };
    const manager = makeManager(
      makeMockMx({
        getRoom: vi.fn<() => typeof room>().mockReturnValue(room),
        getStateEvent,
      })
    );
    manager.attach();

    fireLifecycle(SlidingSyncState.Complete, {
      rooms: {
        '!room:example.com': {
          required_state: [
            {
              type: EventType.RoomMember,
              state_key: '@user:example.com',
              sender: '@user:example.com',
              content: { membership: KnownMembership.Join },
            },
          ],
          timeline: [{ sender: '@timeline-user:example.com' }],
        },
      },
      extensions: {
        receipts: {
          rooms: {
            '!room:example.com': {
              content: {
                $event: { 'm.read': { '@receipt-user:example.com': { ts: 1 } } },
              },
            },
          },
        },
      },
    });
    await Promise.resolve();

    expect(getStateEvent).not.toHaveBeenCalled();
  });

  it('includes the selected room subscription before the first request', () => {
    const manager = new SlidingSyncManager(makeMockMx(), 'https://sliding.example.com', {
      initialRoomIds: ['!selected:example.com'],
    });

    expect(manager.isRoomActive('!selected:example.com')).toBe(true);
    expect(mocks.slidingSyncInstance.useCustomSubscription).toHaveBeenCalledWith(
      '!selected:example.com',
      'active_room'
    );
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledWith(
      new Set(['!selected:example.com'])
    );
  });

  it('expands by one page after the first response instead of jumping to all rooms', () => {
    const manager = makeManager(makeMockMx());
    mocks.slidingSyncInstance.getListData.mockImplementation((key: string) =>
      key === 'joined' ? ({ joinedCount: 1000 } as never) : null
    );
    mocks.slidingSyncInstance.getListParams.mockReturnValue({
      ranges: [[0, 29]],
    } as never);
    manager.attach();

    const lifecycleCall = mocks.slidingSyncInstance.on.mock.calls.find(
      ([event]) => event === SlidingSyncEvent.Lifecycle
    );
    const lifecycle = lifecycleCall?.[1] as
      | ((state: SlidingSyncState, response: unknown, error?: Error) => void)
      | undefined;
    lifecycle?.(SlidingSyncState.Complete, {});

    expect(mocks.slidingSyncInstance.setListRanges).toHaveBeenCalledWith('joined', [[0, 59]]);
  });

  it('does not expand lists synchronously while adding an active-room subscription', () => {
    const manager = makeManager(makeMockMx());
    mocks.slidingSyncInstance.getListData.mockImplementation((key: string) =>
      key === 'joined' ? ({ joinedCount: 1000 } as never) : null
    );
    mocks.slidingSyncInstance.getListParams.mockReturnValue({
      ranges: [[0, 29]],
    } as never);
    manager.attach();
    manager.subscribeToRoom('!active:example.com');

    expect(mocks.slidingSyncInstance.setListRanges).not.toHaveBeenCalledWith('joined', [[0, 59]]);

    const lifecycleCall = mocks.slidingSyncInstance.on.mock.calls.find(
      ([event]) => event === SlidingSyncEvent.Lifecycle
    );
    const lifecycle = lifecycleCall?.[1] as
      | ((state: SlidingSyncState, response: unknown, error?: Error) => void)
      | undefined;
    lifecycle?.(SlidingSyncState.Complete, {});

    expect(mocks.slidingSyncInstance.setListRanges).toHaveBeenCalledWith('joined', [[0, 59]]);
  });

  it('prioritizes active subscriptions while an expanded range is awaiting its response', () => {
    let joinedRange: [number, number][] = [[0, 29]];
    const manager = makeManager(makeMockMx());
    mocks.slidingSyncInstance.getListData.mockImplementation((key: string) =>
      key === 'joined' ? ({ joinedCount: 193 } as never) : null
    );
    mocks.slidingSyncInstance.getListParams.mockImplementation((key: string) =>
      key === 'joined' ? ({ ranges: joinedRange } as never) : ({ ranges: [[0, 29]] } as never)
    );
    mocks.slidingSyncInstance.setListRanges.mockImplementation((key, ranges) => {
      if (key === 'joined') joinedRange = ranges as [number, number][];
    });
    manager.attach();

    fireLifecycle(SlidingSyncState.Complete);
    manager.subscribeToRoom('!active:example.com');

    const diagnostics = manager.getDiagnostics();
    expect(manager.isRoomActive('!active:example.com')).toBe(true);
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledWith(
      new Set(['!active:example.com'])
    );
    expect(mocks.slidingSyncInstance.useCustomSubscription).toHaveBeenCalledWith(
      '!active:example.com',
      'active_room'
    );
    expect(diagnostics.lists.find((list) => list.key === 'joined')).toMatchObject({
      rangeEnd: 29,
    });
  });

  it('keeps full lightweight event coverage after narrowing the detailed joined list', () => {
    const listRanges = new Map<string, [number, number][]>([
      ['joined', [[0, 29]]],
      ['updates', [[0, 29]]],
    ]);
    const manager = makeManager(makeMockMx());
    mocks.slidingSyncInstance.getListData.mockImplementation((key: string) =>
      key === 'joined' || key === 'updates' ? ({ joinedCount: 45 } as never) : null
    );
    mocks.slidingSyncInstance.getListParams.mockImplementation(
      (key: string) => ({ ranges: listRanges.get(key) ?? [[0, 29]] }) as never
    );
    mocks.slidingSyncInstance.setListRanges.mockImplementation((key, ranges) => {
      if (key === 'joined' || key === 'updates') {
        listRanges.set(key, ranges as [number, number][]);
      }
    });
    manager.attach();

    fireLifecycle(SlidingSyncState.Complete);
    expect(listRanges.get('joined')).toEqual([[0, 44]]);
    expect(listRanges.get('updates')).toEqual([[0, 44]]);

    fireLifecycle(SlidingSyncState.Complete);
    fireLifecycle(SlidingSyncState.Complete);
    expect(listRanges.get('joined')).toEqual([[0, 2]]);
    expect(listRanges.get('updates')).toEqual([[0, 44]]);
  });

  it('keeps detailed coverage when the homeserver does not provide the updates list', () => {
    let joinedRange: [number, number][] = [[0, 29]];
    const manager = makeManager(makeMockMx());
    mocks.slidingSyncInstance.getListData.mockImplementation((key: string) =>
      key === 'joined' ? ({ joinedCount: 45 } as never) : null
    );
    mocks.slidingSyncInstance.getListParams.mockImplementation((key: string) =>
      key === 'joined' ? ({ ranges: joinedRange } as never) : ({ ranges: [[0, 29]] } as never)
    );
    mocks.slidingSyncInstance.setListRanges.mockImplementation((key, ranges) => {
      if (key === 'joined') joinedRange = ranges as [number, number][];
    });
    manager.attach();

    fireLifecycle(SlidingSyncState.Complete);
    fireLifecycle(SlidingSyncState.Complete);

    expect(joinedRange).toEqual([[0, 44]]);
  });
});

describe('SlidingSyncManager room subscription coordination', () => {
  it('uses the full-membership subscription for the lifetime of a call', () => {
    const manager = makeManager(makeMockMx());
    const roomId = '!call:example.com';

    const subscription = manager.subscribeToCallRoom(roomId);

    expect(mocks.slidingSyncInstance.useCustomSubscription).toHaveBeenLastCalledWith(
      roomId,
      'call_room'
    );
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenLastCalledWith(
      new Set([roomId])
    );

    subscription();

    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenLastCalledWith(new Set());
  });

  it('restores an active room subscription after a call ends', () => {
    const manager = makeManager(makeMockMx());
    const roomId = '!call:example.com';
    manager.subscribeToRoom(roomId);

    const subscription = manager.subscribeToCallRoom(roomId);
    subscription();

    expect(mocks.slidingSyncInstance.useCustomSubscription).toHaveBeenLastCalledWith(
      roomId,
      'active_room'
    );
  });

  it('replaces route subscriptions atomically without cycling the retained space', () => {
    const manager = makeManager(makeMockMx());
    const spaceId = '!space:example.com';
    const oldRoomId = '!old:example.com';
    const newRoomId = '!new:example.com';

    manager.setActiveRoomSubscriptions([spaceId, oldRoomId]);
    mocks.slidingSyncInstance.modifyRoomSubscriptions.mockClear();

    manager.setActiveRoomSubscriptions([spaceId, newRoomId]);

    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledOnce();
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledWith(
      new Set([spaceId, newRoomId])
    );
    expect(manager.isRoomActive(spaceId)).toBe(true);
    expect(manager.isRoomActive(oldRoomId)).toBe(false);
    expect(manager.isRoomActive(newRoomId)).toBe(true);
  });

  it('reports loading until the subscribed room returns data', () => {
    const manager = makeManager(makeMockMx());
    const roomId = '!slow:example.com';
    const loadingStates: boolean[] = [];

    manager.onRoomSubscriptionStatus(roomId, (loading) => loadingStates.push(loading));
    manager.subscribeToRoom(roomId);

    fireRoomData(roomId);
    expect(loadingStates).toEqual([false, true]);
    expect(manager.isRoomSubscriptionLoading(roomId)).toBe(true);

    manager.attach();
    fireLifecycle(SlidingSyncState.Complete);

    expect(loadingStates).toEqual([false, true, false]);
    expect(manager.isRoomSubscriptionLoading(roomId)).toBe(false);
  });

  it('stops reporting loading for a room the server never sends data for', () => {
    const manager = makeManager(makeMockMx());
    const roomId = '!quiet:example.com';
    const loadingStates: boolean[] = [];

    manager.onRoomSubscriptionStatus(roomId, (loading) => loadingStates.push(loading));
    manager.subscribeToRoom(roomId);
    manager.attach();
    expect(manager.isRoomSubscriptionLoading(roomId)).toBe(true);

    // The cycle the subscription was requested in carries no data for it.
    fireLifecycle(SlidingSyncState.Complete);
    expect(manager.isRoomSubscriptionLoading(roomId)).toBe(true);

    // A full cycle later the room is quiet: nothing is coming.
    fireLifecycle(SlidingSyncState.Complete);
    expect(manager.isRoomSubscriptionLoading(roomId)).toBe(false);
    expect(loadingStates).toEqual([false, true, false]);
  });

  it('stops reporting loading as soon as the subscription is dropped', () => {
    const manager = makeManager(makeMockMx());
    const roomId = '!quiet:example.com';

    manager.subscribeToRoom(roomId);
    manager.attach();
    expect(manager.isRoomSubscriptionLoading(roomId)).toBe(true);

    manager.unsubscribeFromRoom(roomId);

    expect(manager.isRoomSubscriptionLoading(roomId)).toBe(false);
  });

  it('keeps reporting loading for a resubscribed room until its cycles elapse', () => {
    const manager = makeManager(makeMockMx());
    const roomId = '!quiet:example.com';

    manager.subscribeToRoom(roomId);
    manager.attach();
    fireLifecycle(SlidingSyncState.Complete);
    fireLifecycle(SlidingSyncState.Complete);
    expect(manager.isRoomSubscriptionLoading(roomId)).toBe(false);

    manager.unsubscribeFromRoom(roomId);
    manager.subscribeToRoom(roomId);
    expect(manager.isRoomSubscriptionLoading(roomId)).toBe(true);

    fireLifecycle(SlidingSyncState.Complete);
    fireLifecycle(SlidingSyncState.Complete);
    expect(manager.isRoomSubscriptionLoading(roomId)).toBe(false);
  });

  it('uses the active subscription while a room is also an image-pack room', () => {
    const manager = makeManager(makeMockMx());
    const roomId = '!pack:example.com';
    (manager as unknown as { listsFullyLoaded: boolean }).listsFullyLoaded = true;

    manager.setImagePackSubscriptions([roomId]);
    manager.subscribeToRoom(roomId);

    expect(mocks.slidingSyncInstance.useCustomSubscription).toHaveBeenLastCalledWith(
      roomId,
      'active_room'
    );
  });

  it('restores the image-pack subscription when the room is no longer active', () => {
    const manager = makeManager(makeMockMx());
    const roomId = '!pack:example.com';
    (manager as unknown as { listsFullyLoaded: boolean }).listsFullyLoaded = true;

    manager.setImagePackSubscriptions([roomId]);
    manager.subscribeToRoom(roomId);
    manager.unsubscribeFromRoom(roomId);

    expect(mocks.slidingSyncInstance.useCustomSubscription).toHaveBeenLastCalledWith(
      roomId,
      'image_packs'
    );
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenLastCalledWith(
      new Set([roomId])
    );
  });

  it('keeps space subscriptions active for future hierarchy changes', async () => {
    const manager = makeManager(makeMockMx());
    const roomId = '!space:example.com';
    (manager as unknown as { listsFullyLoaded: boolean }).listsFullyLoaded = true;
    manager.attach();

    manager.setSpaceSubscriptions([roomId]);
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenLastCalledWith(
      new Set([roomId])
    );

    fireRoomData(roomId);
    await Promise.resolve();
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenLastCalledWith(
      new Set([roomId])
    );
  });

  it('hydrates sidebar state once for rooms first seen after startup', async () => {
    const manager = makeManager(makeMockMx());
    const roomId = '!new:example.com';
    (
      manager as unknown as { initialListHydrationCompleted: boolean }
    ).initialListHydrationCompleted = true;
    manager.attach();

    fireRoomData(roomId, { initial: true, notification_count: 0, highlight_count: 0 });
    await Promise.resolve();
    expect(mocks.slidingSyncInstance.useCustomSubscription).toHaveBeenLastCalledWith(
      roomId,
      'sidebar_room'
    );

    fireRoomData(roomId, { initial: true });
    await Promise.resolve();
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenLastCalledWith(new Set());
  });

  it('removes image-pack subscriptions which are no longer configured', () => {
    const manager = makeManager(makeMockMx());
    (manager as unknown as { listsFullyLoaded: boolean }).listsFullyLoaded = true;

    manager.setImagePackSubscriptions(['!old:example.com', '!current:example.com']);
    manager.setImagePackSubscriptions(['!current:example.com']);

    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenLastCalledWith(
      new Set(['!current:example.com'])
    );
  });

  it('defers image-pack subscriptions until lists are loaded so pack spaces get the composite key', () => {
    const manager = makeManager(makeMockMx());
    const roomId = '!spacepack:example.com';

    manager.setImagePackSubscriptions([roomId]);
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).not.toHaveBeenCalled();

    manager.setSpaceSubscriptions([roomId]);
    (manager as unknown as { listsFullyLoaded: boolean }).listsFullyLoaded = true;
    (manager as unknown as { flushDeferredSubscriptions: () => void }).flushDeferredSubscriptions();

    expect(mocks.slidingSyncInstance.useCustomSubscription).toHaveBeenLastCalledWith(
      roomId,
      'space_image_packs'
    );
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenLastCalledWith(
      new Set([roomId])
    );
  });

  it('registers a 50-event active room subscription and a single-event sidebar subscription', () => {
    makeManager(makeMockMx());

    const calls = mocks.slidingSyncInstance.addCustomSubscription.mock.calls as unknown as [
      string,
      { timeline_limit: number; required_state: [string, string][] },
    ][];
    const activeRoom = calls.find(([name]) => name === 'active_room');
    const callRoom = calls.find(([name]) => name === 'call_room');
    const sidebarRoom = calls.find(([name]) => name === 'sidebar_room');

    expect(activeRoom).toBeDefined();
    expect(activeRoom![1].timeline_limit).toBe(50);
    expect(activeRoom![1].required_state).toContainEqual([EventType.RoomMember, '$LAZY']);

    expect(callRoom).toBeDefined();
    expect(callRoom![1].timeline_limit).toBe(50);
    expect(callRoom![1].required_state).toContainEqual([EventType.RoomMember, '*']);

    expect(sidebarRoom).toBeDefined();
    expect(sidebarRoom![1].timeline_limit).toBe(1);
  });

  it('registers the composite space+image-pack subscription', () => {
    makeManager(makeMockMx());

    const call = (
      mocks.slidingSyncInstance.addCustomSubscription.mock.calls as unknown as [
        string,
        { timeline_limit: number; required_state: [string, string][] },
      ][]
    ).find(([name]) => name === 'space_image_packs');
    expect(call).toBeDefined();
    const [, subscription] = call!;
    expect(subscription.timeline_limit).toBe(0);
    expect(subscription.required_state).toEqual(
      expect.arrayContaining([
        ['m.space.child', '*'],
        ['m.room.image_pack', '*'],
        ['im.ponies.room_emotes', '*'],
      ])
    );
  });

  it('uses the composite subscription when a pack room is also a space', () => {
    const manager = makeManager(makeMockMx());
    const roomId = '!spacepack:example.com';
    (manager as unknown as { listsFullyLoaded: boolean }).listsFullyLoaded = true;

    manager.setImagePackSubscriptions([roomId]);
    manager.setSpaceSubscriptions([roomId]);

    expect(mocks.slidingSyncInstance.useCustomSubscription).toHaveBeenLastCalledWith(
      roomId,
      'space_image_packs'
    );
  });

  it('uses the composite subscription regardless of registration order', () => {
    const manager = makeManager(makeMockMx());
    const roomId = '!spacepack:example.com';
    (manager as unknown as { listsFullyLoaded: boolean }).listsFullyLoaded = true;

    manager.setSpaceSubscriptions([roomId]);
    manager.setImagePackSubscriptions([roomId]);

    expect(mocks.slidingSyncInstance.useCustomSubscription).toHaveBeenLastCalledWith(
      roomId,
      'space_image_packs'
    );
  });

  it('prefers the active subscription over the composite and falls back on unsubscribe', () => {
    const manager = makeManager(makeMockMx());
    const roomId = '!spacepack:example.com';
    (manager as unknown as { listsFullyLoaded: boolean }).listsFullyLoaded = true;

    manager.setImagePackSubscriptions([roomId]);
    manager.setSpaceSubscriptions([roomId]);
    manager.subscribeToRoom(roomId);
    expect(mocks.slidingSyncInstance.useCustomSubscription).toHaveBeenLastCalledWith(
      roomId,
      'active_room'
    );

    manager.unsubscribeFromRoom(roomId);
    expect(mocks.slidingSyncInstance.useCustomSubscription).toHaveBeenLastCalledWith(
      roomId,
      'space_image_packs'
    );
  });

  it('reverts to the plain subscription when the other role is removed', () => {
    const manager = makeManager(makeMockMx());
    const roomId = '!spacepack:example.com';
    (manager as unknown as { listsFullyLoaded: boolean }).listsFullyLoaded = true;

    manager.setImagePackSubscriptions([roomId]);
    manager.setSpaceSubscriptions([roomId]);

    manager.setImagePackSubscriptions([]);
    expect(mocks.slidingSyncInstance.useCustomSubscription).toHaveBeenLastCalledWith(
      roomId,
      'space'
    );
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenLastCalledWith(
      new Set([roomId])
    );

    manager.setImagePackSubscriptions([roomId]);
    manager.setSpaceSubscriptions([]);
    expect(mocks.slidingSyncInstance.useCustomSubscription).toHaveBeenLastCalledWith(
      roomId,
      'image_packs'
    );
  });
});

describe('scopeEphemeralExtensions', () => {
  it('limits typing and receipts to active rooms without changing other extensions', () => {
    const extensions = {
      typing: { enabled: true },
      receipts: { enabled: true },
      account_data: { enabled: true },
    };

    scopeEphemeralExtensions(extensions, ['!space:example.com', '!room:example.com']);

    expect(extensions).toEqual({
      typing: {
        enabled: true,
        lists: [],
        rooms: ['!space:example.com', '!room:example.com'],
      },
      receipts: {
        enabled: true,
        lists: [],
        rooms: ['!space:example.com', '!room:example.com'],
      },
      account_data: { enabled: true },
    });
  });

  it('uses an empty room scope when no timeline is open', () => {
    const extensions = {
      typing: { enabled: true, lists: ['joined'], rooms: ['!old:example.com'] },
      receipts: { enabled: true, lists: ['joined'], rooms: ['!old:example.com'] },
    };

    scopeEphemeralExtensions(extensions, []);

    expect(extensions.typing).toMatchObject({ lists: [], rooms: [] });
    expect(extensions.receipts).toMatchObject({ lists: [], rooms: [] });
  });
});

describe('SlidingSyncManager local membership reconciliation', () => {
  it('updates an existing invite immediately after a successful join', () => {
    const room = makeMemberRoom('!invite:example.com');
    const manager = makeManager(makeMockMx({ getRoom: () => room }));

    manager.reconcileRoomMembership('!invite:example.com', KnownMembership.Join);

    expect(room.updateMyMembership).toHaveBeenCalledWith(KnownMembership.Join);
  });

  it('updates and unsubscribes a room immediately after a successful leave', () => {
    const room = makeMemberRoom('!room:example.com', KnownMembership.Join);
    const manager = makeManager(makeMockMx({ getRoom: () => room }));
    manager.subscribeToRoom('!room:example.com');

    manager.reconcileRoomMembership('!room:example.com', KnownMembership.Leave);

    expect(room.updateMyMembership).toHaveBeenCalledWith(KnownMembership.Leave);
    expect(manager.isRoomActive('!room:example.com')).toBe(false);
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenLastCalledWith(new Set());
  });

  it('waits for cache hydration and unions authoritative joined rooms before reconciling', async () => {
    let finishHydration: ((hydrated: boolean) => void) | undefined;
    const hydration = new Promise<boolean>((resolve) => {
      finishHydration = resolve;
    });
    const getJoinedRooms = vi.fn<() => Promise<{ joined_rooms: string[] }>>().mockResolvedValue({
      joined_rooms: ['!authoritative:example.com'],
    });
    const manager = makeManager(makeMockMx({ getJoinedRooms }));
    const internals = manager as unknown as {
      cacheHydrationPromise: Promise<boolean>;
      reconcileSidebarCacheMembership: () => void;
      serverMembershipRoomIds: Set<string>;
      sidebarCache: { reconcileRooms: (roomIds: ReadonlySet<string>) => string[] };
    };
    internals.cacheHydrationPromise = hydration;
    internals.serverMembershipRoomIds.add('!observed:example.com');
    const reconcileRooms = vi.spyOn(internals.sidebarCache, 'reconcileRooms').mockReturnValue([]);

    internals.reconcileSidebarCacheMembership();
    expect(getJoinedRooms).not.toHaveBeenCalled();

    finishHydration?.(true);
    await vi.waitFor(() => expect(reconcileRooms).toHaveBeenCalledOnce());

    expect(getJoinedRooms).toHaveBeenCalledOnce();
    expect(reconcileRooms).toHaveBeenCalledWith(
      new Set(['!observed:example.com', '!authoritative:example.com'])
    );
  });

  it('keeps cached rooms when authoritative membership cannot be fetched', async () => {
    const getJoinedRooms = vi
      .fn<() => Promise<{ joined_rooms: string[] }>>()
      .mockRejectedValue(new Error('offline'));
    const manager = makeManager(makeMockMx({ getJoinedRooms }));
    const internals = manager as unknown as {
      reconcileSidebarCacheMembership: () => void;
      sidebarCache: { reconcileRooms: (roomIds: ReadonlySet<string>) => string[] };
    };
    const reconcileRooms = vi.spyOn(internals.sidebarCache, 'reconcileRooms').mockReturnValue([]);

    internals.reconcileSidebarCacheMembership();
    await vi.waitFor(() => expect(getJoinedRooms).toHaveBeenCalledOnce());

    expect(reconcileRooms).not.toHaveBeenCalled();
  });

  it('re-asserts join for a joined room hydrated from cache as invite', async () => {
    const room = makeMemberRoom('!joined:example.com');
    const getJoinedRooms = vi
      .fn<() => Promise<{ joined_rooms: string[] }>>()
      .mockResolvedValue({ joined_rooms: ['!joined:example.com'] });
    const manager = makeManager(
      makeMockMx({
        getJoinedRooms,
        getRoom: vi.fn<() => typeof room>().mockReturnValue(room),
      })
    );
    const internals = manager as unknown as {
      reconcileSidebarCacheMembership: () => void;
      sidebarCache: { reconcileRooms: (roomIds: ReadonlySet<string>) => string[] };
    };
    vi.spyOn(internals.sidebarCache, 'reconcileRooms').mockReturnValue([]);

    internals.reconcileSidebarCacheMembership();
    await vi.waitFor(() => expect(getJoinedRooms).toHaveBeenCalledOnce());

    expect(room.updateMyMembership).toHaveBeenCalledWith(KnownMembership.Join);
    // Repaired too, otherwise the next Room.recalculate() reverts it.
    expect(room.setStateEvents).toHaveBeenCalledOnce();
  });

  it('clears the persisted invite when joining, so a reload cannot resurrect it', () => {
    const room = makeMemberRoom('!invite:example.com');
    const manager = makeManager(makeMockMx({ getRoom: () => room }));
    const clearInviteStateForRooms = vi.spyOn(
      (manager as unknown as { sidebarCache: SlidingSyncSidebarCache }).sidebarCache,
      'clearInviteStateForRooms'
    );

    manager.reconcileRoomMembership('!invite:example.com', KnownMembership.Join);

    expect(clearInviteStateForRooms).toHaveBeenCalledWith(['!invite:example.com']);
  });

  it('subscribes an optimistically joined room and tracks it for re-assertion', () => {
    const room = makeMemberRoom('!invite:example.com');
    const manager = makeManager(makeMockMx({ getRoom: () => room }));

    manager.reconcileRoomMembership('!invite:example.com', KnownMembership.Join);

    expect(room.updateMyMembership).toHaveBeenCalledWith(KnownMembership.Join);
    // Room is now an active subscription so the next sync pulls real joined state
    expect(manager.isRoomActive('!invite:example.com')).toBe(true);
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenLastCalledWith(
      new Set(['!invite:example.com'])
    );
  });

  it('re-asserts join after a sync cycle when the SDK reverted to invite', () => {
    const room = makeMemberRoom('!invite:example.com');
    const manager = makeManager(makeMockMx({ getRoom: () => room }));
    manager.attach();

    // Optimistic join
    manager.reconcileRoomMembership('!invite:example.com', KnownMembership.Join);
    expect(room.getMyMembership()).toBe(KnownMembership.Join);

    // Simulate the SDK reverting to invite during a sync cycle, then fire Complete.
    // (room.recalculate() in the SDK would set this back to invite via invite_state)
    room.setMembership(KnownMembership.Invite);

    fireLifecycle(SlidingSyncState.Complete, {
      rooms: { '!invite:example.com': {} },
    });

    // The manager re-asserted join
    expect(room.updateMyMembership).toHaveBeenLastCalledWith(KnownMembership.Join);
    expect(room.getMyMembership()).toBe(KnownMembership.Join);
  });

  it('leaves tracking to the response sanitiser rather than the SDK membership', () => {
    const room = makeMemberRoom('!invite:example.com', KnownMembership.Join);
    const manager = makeManager(makeMockMx({ getRoom: () => room }));
    manager.attach();

    manager.reconcileRoomMembership('!invite:example.com', KnownMembership.Join);
    fireLifecycle(SlidingSyncState.Complete, {
      rooms: { '!invite:example.com': {} },
    });

    // Membership reading "join" is not proof the server caught up.
    expect(trackedJoins(manager).has('!invite:example.com')).toBe(true);
    // Only the optimistic write; nothing re-asserted.
    expect(room.updateMyMembership).toHaveBeenCalledOnce();
    expect(room.setStateEvents).not.toHaveBeenCalled();
  });

  it('stops re-asserting a join for a room the server stops reporting', () => {
    const room = makeMemberRoom('!invite:example.com');
    const manager = makeManager(makeMockMx({ getRoom: () => room }));
    manager.attach();

    manager.reconcileRoomMembership('!invite:example.com', KnownMembership.Join);
    // Never appears in a response, so sanitisation cannot release it. The
    // deadline counts cycles *after* the join.
    for (let cycle = 0; cycle <= 10; cycle += 1) {
      fireLifecycle(SlidingSyncState.Complete, { rooms: {} });
    }

    expect(trackedJoins(manager).has('!invite:example.com')).toBe(false);
  });

  const runStaleInviteCycles = (
    manager: SlidingSyncManager,
    room: ReturnType<typeof makeMemberRoom>,
    cycles: number
  ) => {
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      const response = respond(room.roomId, {
        invite_state: [selfMember(KnownMembership.Invite)],
      });
      manager.sanitizeOptimisticJoinResponse(response as never);
      room.setMembership(KnownMembership.Invite);
      fireLifecycle(SlidingSyncState.Complete, response);
    }
  };

  it('keeps correcting a server that sends a stale invite past the deadline', async () => {
    const room = makeMemberRoom('!invite:example.com');
    const getJoinedRooms = vi
      .fn<() => Promise<{ joined_rooms: string[] }>>()
      .mockResolvedValue({ joined_rooms: ['!invite:example.com'] });
    const manager = makeManager(makeMockMx({ getRoom: () => room, getJoinedRooms }));
    manager.attach();

    manager.reconcileRoomMembership('!invite:example.com', KnownMembership.Join);

    // The deadline must not expire while the server is still sending the room.
    runStaleInviteCycles(manager, room, 21);
    await vi.waitFor(() => expect(getJoinedRooms).toHaveBeenCalled());

    expect(trackedJoins(manager).has('!invite:example.com')).toBe(true);
    expect(room.getMyMembership()).toBe(KnownMembership.Join);
  });

  it('defers to the server once it confirms we are not actually joined', async () => {
    const room = makeMemberRoom('!invite:example.com');
    // Kicked and re-invited inside one sync gap: the new invite is real.
    const getJoinedRooms = vi
      .fn<() => Promise<{ joined_rooms: string[] }>>()
      .mockResolvedValue({ joined_rooms: [] });
    const manager = makeManager(makeMockMx({ getRoom: () => room, getJoinedRooms }));
    manager.attach();

    manager.reconcileRoomMembership('!invite:example.com', KnownMembership.Join);
    runStaleInviteCycles(manager, room, 4);
    await vi.waitFor(() => expect(getJoinedRooms).toHaveBeenCalledOnce());

    expect(trackedJoins(manager).has('!invite:example.com')).toBe(false);
  });

  it('keeps assuming joined when the membership check cannot be made', async () => {
    const room = makeMemberRoom('!invite:example.com');
    const getJoinedRooms = vi
      .fn<() => Promise<{ joined_rooms: string[] }>>()
      .mockRejectedValue(new Error('offline'));
    const manager = makeManager(makeMockMx({ getRoom: () => room, getJoinedRooms }));
    manager.attach();

    manager.reconcileRoomMembership('!invite:example.com', KnownMembership.Join);
    runStaleInviteCycles(manager, room, 4);
    await vi.waitFor(() => expect(getJoinedRooms).toHaveBeenCalledOnce());

    // Must not strand the user back on the invite.
    expect(trackedJoins(manager).has('!invite:example.com')).toBe(true);
    expect(room.getMyMembership()).toBe(KnownMembership.Join);
  });

  it('clears optimistic join tracking on leave', () => {
    const room = makeMemberRoom('!room:example.com');
    const manager = makeManager(makeMockMx({ getRoom: () => room }));
    manager.subscribeToRoom('!room:example.com');

    manager.reconcileRoomMembership('!room:example.com', KnownMembership.Join);
    manager.reconcileRoomMembership('!room:example.com', KnownMembership.Leave);

    expect(trackedJoins(manager).has('!room:example.com')).toBe(false);
    expect(room.updateMyMembership).toHaveBeenCalledWith(KnownMembership.Leave);
    expect(manager.isRoomActive('!room:example.com')).toBe(false);
  });
});

const selfMember = (membership: string) => ({
  type: EventType.RoomMember,
  state_key: '@user:example.com',
  sender: '@inviter:example.com',
  content: { membership },
});

const respond = (roomId: string, roomData: Record<string, unknown>) => ({
  rooms: { [roomId]: roomData },
});

const sanitizedSelfMember = (roomData: Record<string, unknown> | undefined) =>
  (roomData?.required_state as { state_key?: string; content?: unknown }[] | undefined)?.find(
    (event) => event.state_key === '@user:example.com'
  );

describe('SlidingSyncManager optimistic join sanitisation', () => {
  const ROOM_ID = '!invite:example.com';

  it('replaces stale invite data with a join for an optimistically joined room', () => {
    const manager = makeManager(makeMockMx());
    manager.reconcileRoomMembership(ROOM_ID, KnownMembership.Join);
    const invite = selfMember(KnownMembership.Invite);

    const response = respond(ROOM_ID, {
      required_state: [invite],
      invite_state: [invite],
      timeline: [],
    });
    manager.sanitizeOptimisticJoinResponse(response as never);

    expect(response.rooms[ROOM_ID]?.invite_state).toBeUndefined();
    // Replaced, not removed: the cache clears its invite only on a join here.
    expect(sanitizedSelfMember(response.rooms[ROOM_ID])?.content).toMatchObject({
      membership: KnownMembership.Join,
    });
    expect(trackedJoins(manager).has(ROOM_ID)).toBe(true);
  });

  it('replaces the invite when the server omits our member event entirely', () => {
    // Continuwuity does not substitute "$ME", so our member event never appears.
    const manager = makeManager(makeMockMx());
    manager.reconcileRoomMembership(ROOM_ID, KnownMembership.Join);

    const response = respond(ROOM_ID, {
      required_state: [{ type: EventType.RoomName, state_key: '', content: { name: 'Room' } }],
      invite_state: [selfMember(KnownMembership.Invite)],
    });
    manager.sanitizeOptimisticJoinResponse(response as never);

    expect(response.rooms[ROOM_ID]?.invite_state).toBeUndefined();
    expect(sanitizedSelfMember(response.rooms[ROOM_ID])?.content).toMatchObject({
      membership: KnownMembership.Join,
    });
    expect(response.rooms[ROOM_ID]?.required_state).toHaveLength(2);
    expect(trackedJoins(manager).has(ROOM_ID)).toBe(true);
  });

  it('drops a stale invite that accompanies a real join and stops tracking', () => {
    const manager = makeManager(makeMockMx());
    manager.reconcileRoomMembership(ROOM_ID, KnownMembership.Join);
    const join = selfMember(KnownMembership.Join);

    // The SDK ignores required_state whenever invite_state is present.
    const response = respond(ROOM_ID, {
      required_state: [join],
      invite_state: [selfMember(KnownMembership.Invite)],
    });
    manager.sanitizeOptimisticJoinResponse(response as never);

    expect(response.rooms[ROOM_ID]?.invite_state).toBeUndefined();
    expect(response.rooms[ROOM_ID]?.required_state).toEqual([join]);
    expect(trackedJoins(manager).has(ROOM_ID)).toBe(false);
  });

  it('stops tracking once the server stops sending any invite state', () => {
    const manager = makeManager(makeMockMx());
    manager.reconcileRoomMembership(ROOM_ID, KnownMembership.Join);

    // Server caught up without ever spelling the join out.
    const response = respond(ROOM_ID, { required_state: [], timeline: [] });
    manager.sanitizeOptimisticJoinResponse(response as never);

    expect(trackedJoins(manager).has(ROOM_ID)).toBe(false);
  });

  it('keeps real join state and stops tracking once the server confirms', () => {
    const manager = makeManager(makeMockMx());
    manager.reconcileRoomMembership(ROOM_ID, KnownMembership.Join);
    const join = selfMember(KnownMembership.Join);

    const response = respond(ROOM_ID, { required_state: [join], timeline: [] });
    manager.sanitizeOptimisticJoinResponse(response as never);

    expect(response.rooms[ROOM_ID]?.required_state).toEqual([join]);
    expect(trackedJoins(manager).has(ROOM_ID)).toBe(false);
  });

  it('stops tracking on a join confirmed only by the timeline', () => {
    const manager = makeManager(makeMockMx());
    manager.reconcileRoomMembership(ROOM_ID, KnownMembership.Join);

    // A limited timeline can still carry the prior invite, so the newest wins.
    const response = respond(ROOM_ID, {
      timeline: [selfMember(KnownMembership.Invite), selfMember(KnownMembership.Join)],
    });
    manager.sanitizeOptimisticJoinResponse(response as never);

    expect(trackedJoins(manager).has(ROOM_ID)).toBe(false);
  });

  it('passes through a leave the server reports while the join is still tracked', () => {
    const manager = makeManager(makeMockMx());
    manager.reconcileRoomMembership(ROOM_ID, KnownMembership.Join);
    const leave = selfMember(KnownMembership.Leave);

    // Kicked elsewhere: suppressing this strands us in a room we left.
    const response = respond(ROOM_ID, {
      required_state: [leave],
      timeline: [],
    });
    manager.sanitizeOptimisticJoinResponse(response as never);

    expect(response.rooms[ROOM_ID]?.required_state).toEqual([leave]);
    expect(trackedJoins(manager).has(ROOM_ID)).toBe(false);
  });

  it('leaves responses untouched for rooms that were not optimistically joined', () => {
    const manager = makeManager(makeMockMx());
    manager.reconcileRoomMembership(ROOM_ID, KnownMembership.Join);
    const invite = selfMember(KnownMembership.Invite);

    const response = respond('!other:example.com', {
      required_state: [invite],
      invite_state: [invite],
      timeline: [],
    });
    manager.sanitizeOptimisticJoinResponse(response as never);

    expect(response.rooms['!other:example.com']).toMatchObject({
      required_state: [invite],
      invite_state: [invite],
    });
  });

  it('replaces the stale invite member event with a synthesized join one', () => {
    const room = makeMemberRoom(ROOM_ID);
    const manager = makeManager(makeMockMx({ getRoom: () => room }));

    manager.reconcileRoomMembership(ROOM_ID, KnownMembership.Join);

    expect(room.setStateEvents).toHaveBeenCalledOnce();
    const [events] = room.setStateEvents.mock.calls[0] ?? [];
    expect(events).toHaveLength(1);
    expect(events?.[0]?.getContent()).toEqual({
      membership: KnownMembership.Join,
      displayname: 'Alice',
    });
    expect(events?.[0]?.getRoomId()).toBe(ROOM_ID);
    // Sent by the user, not the inviter.
    expect(events?.[0]?.getSender()).toBe('@user:example.com');
  });
});

describe('SlidingSyncManager room deactivation', () => {
  it('removes the active subscription without resetting the live timeline', () => {
    const roomId = '!room:example.com';
    const room = makeRoomWithTimeline(151);
    const manager = makeManager(
      makeMockMx({
        getRoom: vi.fn<() => typeof room>().mockReturnValue(room),
      })
    );

    manager.subscribeToRoom(roomId);
    mocks.slidingSyncInstance.modifyRoomSubscriptions.mockClear();
    manager.unsubscribeFromRoom(roomId);

    expect(manager.isRoomActive(roomId)).toBe(false);
    expect(manager.getActiveRoomSubscriptionIds()).toEqual([]);
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledWith(new Set());
    expect(room.resetLiveTimeline).not.toHaveBeenCalled();
  });
});

// ── dispose() ────────────────────────────────────────────────────────────────

describe('SlidingSyncManager.dispose()', () => {
  it('calls slidingSync.stop() to halt the polling loop', () => {
    const manager = makeManager(makeMockMx());
    manager.dispose();
    expect(mocks.slidingSyncInstance.stop).toHaveBeenCalledOnce();
  });
});

// ── onMembershipLeave: auto-unsubscribe on leave/ban ─────────────────────────

/** Fire the RoomMemberEvent.Membership listener registered on mx.on */
function fireMembershipEvent(
  mx: ReturnType<typeof makeMockMx>,
  membership: string,
  roomId = '!room:example.com',
  userId = '@user:example.com'
) {
  const onCall = (mx.on as ReturnType<typeof vi.fn>).mock.calls.find(
    (args: unknown[]) => args[0] === 'RoomMember.membership'
  );
  if (!onCall) throw new Error('onMembershipLeave listener not registered');
  const [, handler] = onCall as [
    string,
    (e: unknown, m: { userId: string; roomId: string; membership: string }) => void,
  ];
  handler(undefined, { userId, roomId, membership });
}

describe('SlidingSyncManager — membership leave auto-unsubscribe', () => {
  it('unsubscribes when the local user leaves an active room', () => {
    const mx = makeMockMx();
    const manager = makeManager(mx);
    manager.attach();
    fireLifecycle(SlidingSyncState.Complete);
    manager.subscribeToRoom('!room:example.com');

    fireMembershipEvent(mx, 'leave');

    // subscribeToRoom + unsubscribeFromRoom = 2 calls
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes when the local user is banned from an active room', () => {
    const mx = makeMockMx();
    const manager = makeManager(mx);
    manager.attach();
    fireLifecycle(SlidingSyncState.Complete);
    manager.subscribeToRoom('!room:example.com');

    fireMembershipEvent(mx, 'ban');

    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledTimes(2);
  });

  it('does nothing when a different user leaves', () => {
    const mx = makeMockMx();
    const manager = makeManager(mx);
    manager.attach();
    fireLifecycle(SlidingSyncState.Complete);
    manager.subscribeToRoom('!room:example.com');

    fireMembershipEvent(mx, 'leave', '!room:example.com', '@other:example.com');

    // Only the initial subscribe — no unsubscribe
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledTimes(1);
  });

  it('does nothing when membership is join', () => {
    const mx = makeMockMx();
    const manager = makeManager(mx);
    manager.attach();
    fireLifecycle(SlidingSyncState.Complete);
    manager.subscribeToRoom('!room:example.com');

    fireMembershipEvent(mx, 'join');

    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a room that was never subscribed', () => {
    const mx = makeMockMx();
    const manager = makeManager(mx);
    manager.attach(); // registers the listener, but no subscribeToRoom call

    fireMembershipEvent(mx, 'leave');

    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).not.toHaveBeenCalled();
  });
});
