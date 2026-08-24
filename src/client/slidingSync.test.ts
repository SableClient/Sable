/**
 * Unit tests for SlidingSyncManager memory management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  MatrixClient,
  MatrixEvent,
  MSC3575List,
  MSC3575SlidingSyncResponse,
} from '$types/matrix-sdk';
import {
  EventTimeline,
  EventType,
  KnownMembership,
  SlidingSyncEvent,
  SlidingSyncState,
  UNSTABLE_ELEMENT_FUNCTIONAL_USERS,
} from '$types/matrix-sdk';

import {
  prepareSlidingSyncTimelines,
  scopeTypingExtension,
  SlidingSyncManager,
} from './slidingSync';
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
    resend: vi.fn<() => void>(),
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
    const defaultSubscription = mocks.slidingSyncConstructorArgs?.[2] as {
      timeline_limit: number;
      required_state: string[][];
    };

    expect(joined?.ranges).toEqual([[0, 29]]);
    expect(joined?.timeline_limit).toBe(1);
    expect(joined?.required_state).toHaveLength(11);
    expect(joined?.required_state).toContainEqual([EventType.RoomJoinRules, '']);
    expect(joined?.required_state).toContainEqual([UNSTABLE_ELEMENT_FUNCTIONAL_USERS.name, '']);
    expect(joined?.required_state).not.toContainEqual(['m.space.child', '*']);
    expect([...lists.keys()]).toEqual(['joined', 'invites']);
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

  it('settles a prepared room after the response carrying its subscription completes', () => {
    const manager = makeManager(makeMockMx());
    const ready = vi.fn<() => void>();
    manager.attach();
    const trackStaleResponse = manager.trackSubscriptionRequest([]);
    manager.prepareRoomSubscription('!target:example.com', ready);

    const staleResponse = {
      rooms: { '!target:example.com': { timeline: [] } },
    } as unknown as MSC3575SlidingSyncResponse;
    trackStaleResponse(staleResponse);
    fireLifecycle(SlidingSyncState.RequestFinished, staleResponse);
    fireRoomData('!target:example.com', { timeline: [] });
    fireLifecycle(SlidingSyncState.Complete, staleResponse);
    expect(ready).not.toHaveBeenCalled();

    const unrelatedResponse = { rooms: {} } as unknown as MSC3575SlidingSyncResponse;
    manager.trackSubscriptionRequest([])(unrelatedResponse);
    fireLifecycle(SlidingSyncState.RequestFinished, unrelatedResponse);
    fireLifecycle(SlidingSyncState.Complete, unrelatedResponse);
    expect(ready).not.toHaveBeenCalled();

    const subscriptionResponse = { rooms: {} } as unknown as MSC3575SlidingSyncResponse;
    manager.trackSubscriptionRequest(['!target:example.com'])(subscriptionResponse);
    fireLifecycle(SlidingSyncState.RequestFinished, subscriptionResponse);
    fireLifecycle(SlidingSyncState.Complete, subscriptionResponse);

    expect(ready).toHaveBeenCalledOnce();
  });

  it('settles an already-active room only after a request started for the notification', () => {
    const roomId = '!target:example.com';
    const manager = makeManager(makeMockMx());
    manager.attach();
    manager.subscribeToRoom(roomId);
    mocks.slidingSyncInstance.resend.mockClear();

    const trackStaleResponse = manager.trackSubscriptionRequest([]);
    const ready = vi.fn<() => void>();
    manager.prepareRoomSubscription(roomId, ready);
    expect(mocks.slidingSyncInstance.resend).toHaveBeenCalledOnce();

    const staleResponse = {
      rooms: { [roomId]: { timeline: [] } },
    } as unknown as MSC3575SlidingSyncResponse;
    trackStaleResponse(staleResponse);
    fireLifecycle(SlidingSyncState.RequestFinished, staleResponse);
    fireLifecycle(SlidingSyncState.Complete, staleResponse);
    expect(ready).not.toHaveBeenCalled();

    const nextResponse = { rooms: {} } as unknown as MSC3575SlidingSyncResponse;
    manager.trackSubscriptionRequest([])(nextResponse);
    fireLifecycle(SlidingSyncState.RequestFinished, nextResponse);
    fireLifecycle(SlidingSyncState.Complete, nextResponse);
    expect(ready).toHaveBeenCalledOnce();
  });

  it('restores reset timeline events only when their response completes', () => {
    const manager = makeManager(makeMockMx());
    const completion = vi.fn<() => void>();
    const response = { rooms: {} } as unknown as MSC3575SlidingSyncResponse;
    manager.attach();
    manager.trackTimelineResetCompletion(response, completion);

    fireLifecycle(SlidingSyncState.Complete, {
      rooms: {},
    } as unknown as MSC3575SlidingSyncResponse);
    expect(completion).not.toHaveBeenCalled();

    fireLifecycle(SlidingSyncState.Complete, response);
    expect(completion).toHaveBeenCalledOnce();
  });

  it('keeps a prepared room active when the route adopts it', () => {
    vi.useFakeTimers();
    try {
      const roomId = '!target:example.com';
      const manager = makeManager(makeMockMx());
      manager.prepareRoomSubscription(roomId, () => {});
      manager.releaseRoomSubscriptionUnlessRouted(roomId);

      manager.setActiveRoomSubscriptions([roomId]);
      vi.runAllTimers();
      expect(manager.isRoomActive(roomId)).toBe(true);

      manager.setActiveRoomSubscriptions([]);
      expect(manager.isRoomActive(roomId)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases a prepared room when the route does not adopt it', () => {
    vi.useFakeTimers();
    try {
      const roomId = '!target:example.com';
      const manager = makeManager(makeMockMx());
      manager.prepareRoomSubscription(roomId, () => {});
      manager.releaseRoomSubscriptionUnlessRouted(roomId);

      vi.runAllTimers();

      expect(manager.isRoomActive(roomId)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not release a room claimed by a newer notification', () => {
    vi.useFakeTimers();
    try {
      const roomId = '!target:example.com';
      const manager = makeManager(makeMockMx());
      manager.prepareRoomSubscription(roomId, () => {});
      manager.releaseRoomSubscriptionUnlessRouted(roomId);

      manager.prepareRoomSubscription(roomId, () => {});
      vi.runAllTimers();

      expect(manager.isRoomActive(roomId)).toBe(true);

      manager.releaseRoomSubscriptionUnlessRouted(roomId);
      vi.runAllTimers();
      expect(manager.isRoomActive(roomId)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
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
      getLiveTimeline: () => ({ getEvents: () => [] }),
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

  // Narrowing it stops state deltas reaching every room but those in the window.
  it('keeps the joined list covering every room once hydration completes', () => {
    let joinedRange: [number, number][] = [[0, 29]];
    const manager = makeManager(makeMockMx());
    mocks.slidingSyncInstance.getListData.mockImplementation((key: string) =>
      key === 'joined' ? ({ joinedCount: 45 } as never) : null
    );
    mocks.slidingSyncInstance.getListParams.mockImplementation((key: string) =>
      key === 'joined' ? ({ ranges: joinedRange } as never) : null
    );
    mocks.slidingSyncInstance.setListRanges.mockImplementation((key, ranges) => {
      if (key === 'joined') joinedRange = ranges as [number, number][];
    });
    manager.attach();

    fireLifecycle(SlidingSyncState.Complete);
    expect(joinedRange).toEqual([[0, 44]]);

    fireLifecycle(SlidingSyncState.Complete);
    fireLifecycle(SlidingSyncState.Complete);
    expect(joinedRange).toEqual([[0, 44]]);
  });

  // A rename does not bump a room, so it never sorts back into a stale window.
  it('extends the joined list when rooms are joined after hydration', () => {
    let joinedCount = 45;
    let joinedRange: [number, number][] = [[0, 29]];
    const manager = makeManager(makeMockMx());
    mocks.slidingSyncInstance.getListData.mockImplementation((key: string) =>
      key === 'joined' ? ({ joinedCount } as never) : null
    );
    mocks.slidingSyncInstance.getListParams.mockImplementation((key: string) =>
      key === 'joined' ? ({ ranges: joinedRange } as never) : null
    );
    mocks.slidingSyncInstance.setListRanges.mockImplementation((key, ranges) => {
      if (key === 'joined') joinedRange = ranges as [number, number][];
    });
    manager.attach();

    fireLifecycle(SlidingSyncState.Complete);
    fireLifecycle(SlidingSyncState.Complete);
    expect(joinedRange).toEqual([[0, 44]]);

    joinedCount = 48;
    fireLifecycle(SlidingSyncState.Complete);

    expect(joinedRange).toEqual([[0, 47]]);
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

  it('drops the image-pack subscription for a room that was left', async () => {
    const manager = makeManager(makeMockMx());
    const roomId = '!pack:example.com';
    (manager as unknown as { listsFullyLoaded: boolean }).listsFullyLoaded = true;

    manager.setImagePackSubscriptions([roomId]);
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenLastCalledWith(
      new Set([roomId])
    );

    manager.reconcileRoomMembership(roomId, KnownMembership.Leave);
    await Promise.resolve();

    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenLastCalledWith(new Set());
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
    expect(activeRoom![1].required_state).toContainEqual([
      UNSTABLE_ELEMENT_FUNCTIONAL_USERS.name,
      '',
    ]);

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

describe('scopeTypingExtension', () => {
  it('limits typing to active rooms without changing other extensions', () => {
    const extensions = {
      typing: { enabled: true },
      receipts: { enabled: true },
      account_data: { enabled: true },
    };

    scopeTypingExtension(extensions, ['!space:example.com', '!room:example.com']);

    expect(extensions).toEqual({
      typing: {
        enabled: true,
        lists: [],
        rooms: ['!space:example.com', '!room:example.com'],
      },
      receipts: { enabled: true },
      account_data: { enabled: true },
    });
  });

  it('leaves receipts unscoped so every room keeps receiving read state', () => {
    const extensions = {
      typing: { enabled: true, lists: ['joined'], rooms: ['!old:example.com'] },
      receipts: { enabled: true },
    };

    scopeTypingExtension(extensions, []);

    expect(extensions.typing).toMatchObject({ lists: [], rooms: [] });
    expect(extensions.receipts).toEqual({ enabled: true });
  });
});

describe('prepareSlidingSyncTimelines', () => {
  it('marks an expanded timeline limited so the SDK reconciles the gap', () => {
    const resp = {
      rooms: {
        '!dm:example.com': {
          unstable_expanded_timeline: true,
          timeline: [{}],
          prev_batch: 't1-2',
        },
      },
    } as unknown as Parameters<typeof prepareSlidingSyncTimelines>[0];

    prepareSlidingSyncTimelines(resp);

    expect(resp?.rooms['!dm:example.com']).toMatchObject({ limited: true });
  });

  it('leaves rooms without an expanded timeline untouched', () => {
    const resp = {
      rooms: {
        '!quiet:example.com': { limited: false, prev_batch: 't1-2' },
      },
    } as unknown as Parameters<typeof prepareSlidingSyncTimelines>[0];

    prepareSlidingSyncTimelines(resp);

    expect(resp?.rooms['!quiet:example.com']).toMatchObject({ limited: false });
  });

  it('leaves an all-live timeline untouched', () => {
    const resp = {
      rooms: {
        '!active:example.com': { timeline: [{}, {}], num_live: 2 },
      },
    } as unknown as Parameters<typeof prepareSlidingSyncTimelines>[0];

    prepareSlidingSyncTimelines(resp);

    expect(resp?.rooms['!active:example.com']).not.toHaveProperty('limited');
  });

  it('leaves an initial timeline untouched', () => {
    const resp = {
      rooms: {
        '!initial:example.com': { initial: true, timeline: [{}, {}], num_live: 0 },
      },
    } as unknown as Parameters<typeof prepareSlidingSyncTimelines>[0];

    prepareSlidingSyncTimelines(resp);

    expect(resp?.rooms['!initial:example.com']).not.toHaveProperty('limited');
  });

  it('marks an expanded timeline limited even when the response omits prev_batch', () => {
    const resp = {
      rooms: {
        '!dm:example.com': { unstable_expanded_timeline: true, timeline: [{}] },
      },
    } as unknown as Parameters<typeof prepareSlidingSyncTimelines>[0];

    prepareSlidingSyncTimelines(resp);

    expect(resp?.rooms['!dm:example.com']).toHaveProperty('limited', true);
  });

  it('carries the room back-pagination token forward when prev_batch is omitted', () => {
    const resp = {
      rooms: {
        '!dm:example.com': { unstable_expanded_timeline: true, timeline: [{}] },
      },
    } as unknown as Parameters<typeof prepareSlidingSyncTimelines>[0];
    const mx = {
      getRoom: () => ({
        getLiveTimeline: () => ({ getEvents: () => [], getPaginationToken: () => 't1-9' }),
        getUnfilteredTimelineSet: () => ({
          getLiveTimeline: () => ({ getEvents: () => [], getPaginationToken: () => 't1-9' }),
          getTimelines: () => [{}],
          resetLiveTimeline: vi.fn<() => void>(),
        }),
      }),
    } as unknown as Parameters<typeof prepareSlidingSyncTimelines>[1];

    prepareSlidingSyncTimelines(resp, mx);

    expect(resp?.rooms['!dm:example.com']).toMatchObject({ limited: true, prev_batch: 't1-9' });
  });

  it('accepts the stable MSC4186 expanded_timeline flag', () => {
    const resp = {
      rooms: {
        '!dm:example.com': { expanded_timeline: true, timeline: [{}], prev_batch: 't1-3' },
      },
    } as unknown as Parameters<typeof prepareSlidingSyncTimelines>[0];

    prepareSlidingSyncTimelines(resp);

    expect(resp?.rooms['!dm:example.com']).toHaveProperty('limited', true);
  });

  it('does not clear pagination state for an empty expanded response', () => {
    const resp = {
      rooms: {
        '!dm:example.com': { expanded_timeline: true },
      },
    } as unknown as Parameters<typeof prepareSlidingSyncTimelines>[0];

    prepareSlidingSyncTimelines(resp);

    expect(resp?.rooms['!dm:example.com']).not.toHaveProperty('limited');
  });

  it.each([
    {
      name: 'historic events before a known event',
      timeline: ['$old', '$known'],
      expected: true,
    },
    {
      name: 'historic and new events around a known event',
      timeline: ['$old', '$known', '$new'],
      expected: true,
    },
    { name: 'an ordinary live overlap', timeline: ['$known', '$new'], expected: false },
    { name: 'only unknown events', timeline: ['$old', '$new'], expected: false },
    { name: 'only known events', timeline: ['$known'], expected: false },
  ])('classifies $name without expansion metadata', ({ timeline, expected }) => {
    const resp = {
      rooms: {
        '!dm:example.com': { timeline: timeline.map((event_id) => ({ event_id })) },
      },
    } as unknown as Parameters<typeof prepareSlidingSyncTimelines>[0];
    const mx = {
      getRoom: () => ({
        getLiveTimeline: () => ({
          getEvents: () => [{ getId: () => '$known', isSending: () => false }],
          getPaginationToken: () => 't1-9',
        }),
        getUnfilteredTimelineSet: () => ({
          getLiveTimeline: () => ({
            getEvents: () => [{ getId: () => '$known', isSending: () => false }],
            getPaginationToken: () => 't1-9',
          }),
          getTimelines: () => [{}],
          resetLiveTimeline: vi.fn<() => void>(),
        }),
      }),
    } as unknown as Parameters<typeof prepareSlidingSyncTimelines>[1];

    prepareSlidingSyncTimelines(resp, mx);

    expect(resp?.rooms['!dm:example.com']?.limited).toBe(expected ? true : undefined);
  });

  it.each([-1, 1.5, 3])('ignores invalid num_live value %s', (numLive) => {
    const resp = {
      rooms: {
        '!dm:example.com': { timeline: [{ event_id: '$new' }], num_live: numLive },
      },
    } as unknown as Parameters<typeof prepareSlidingSyncTimelines>[0];

    prepareSlidingSyncTimelines(resp);

    expect(resp?.rooms['!dm:example.com']).not.toHaveProperty('limited');
  });

  it('ignores malformed timeline data', () => {
    const resp = {
      rooms: {
        '!dm:example.com': { timeline: {} },
      },
    } as unknown as Parameters<typeof prepareSlidingSyncTimelines>[0];

    expect(() => prepareSlidingSyncTimelines(resp)).not.toThrow();
    expect(resp?.rooms['!dm:example.com']).not.toHaveProperty('limited');
  });

  it('tolerates a response without rooms', () => {
    expect(() => prepareSlidingSyncTimelines(null)).not.toThrow();
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

describe('SlidingSyncManager poll watchdog', () => {
  // DEFAULT_POLL_TIMEOUT_MS + SDK_CLIENT_TIMEOUT_BUFFER_MS + POLL_DEADLINE_MARGIN_MS
  const DEFAULT_DEADLINE_MS = 45_000 + 10_000 + 20_000;

  it('cycles the transport when no lifecycle event arrives within the deadline', () => {
    vi.useFakeTimers();
    try {
      const manager = makeManager(makeMockMx());
      manager.attach();

      expect(mocks.slidingSyncInstance.resend).not.toHaveBeenCalled();

      vi.advanceTimersByTime(DEFAULT_DEADLINE_MS);

      expect(mocks.slidingSyncInstance.resend).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays quiet while lifecycle events keep arriving', () => {
    vi.useFakeTimers();
    try {
      const manager = makeManager(makeMockMx());
      manager.attach();

      for (let i = 0; i < 5; i += 1) {
        vi.advanceTimersByTime(DEFAULT_DEADLINE_MS - 1_000);
        fireLifecycle(SlidingSyncState.Complete, {});
      }

      expect(mocks.slidingSyncInstance.resend).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps cycling when the replacement poll also wedges', () => {
    vi.useFakeTimers();
    try {
      const manager = makeManager(makeMockMx());
      manager.attach();

      vi.advanceTimersByTime(DEFAULT_DEADLINE_MS);
      expect(mocks.slidingSyncInstance.resend).toHaveBeenCalledOnce();

      // No lifecycle event arrives, so the watchdog must re-arm itself.
      vi.advanceTimersByTime(DEFAULT_DEADLINE_MS);
      expect(mocks.slidingSyncInstance.resend).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(DEFAULT_DEADLINE_MS);
      expect(mocks.slidingSyncInstance.resend).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not fire after dispose', () => {
    vi.useFakeTimers();
    try {
      const manager = makeManager(makeMockMx());
      manager.attach();
      manager.dispose();

      vi.advanceTimersByTime(DEFAULT_DEADLINE_MS * 2);

      expect(mocks.slidingSyncInstance.resend).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('SlidingSyncManager pause/resume', () => {
  const DEFAULT_DEADLINE_MS = 45_000 + 10_000 + 20_000;

  it('aborts the in-flight poll on pause so the radio goes idle', () => {
    const manager = makeManager(makeMockMx());
    manager.attach();

    manager.pause();

    expect(manager.isPaused()).toBe(true);
    expect(mocks.slidingSyncInstance.resend).toHaveBeenCalledOnce();
  });

  it('does not tear the transport down', () => {
    const manager = makeManager(makeMockMx());
    manager.attach();

    manager.pause();

    expect(mocks.slidingSyncInstance.stop).not.toHaveBeenCalled();
  });

  it('holds waitForResume() until resume', async () => {
    const manager = makeManager(makeMockMx());
    manager.attach();
    manager.pause();

    let resolved = false;
    const parked = manager.waitForResume().then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);

    manager.resume();
    await parked;

    expect(resolved).toBe(true);
    expect(manager.isPaused()).toBe(false);
  });

  it('resolves waitForResume() immediately when not paused', async () => {
    const manager = makeManager(makeMockMx());
    manager.attach();

    await expect(manager.waitForResume()).resolves.toBeUndefined();
  });

  it('resumeForPush() lifts the pause and parks once to-device comes back empty', () => {
    const manager = makeManager(makeMockMx());
    manager.attach();
    manager.pause();

    expect(manager.resumeForPush()).toBe(true);
    expect(manager.isPaused()).toBe(false);

    fireLifecycle(SlidingSyncState.Complete, { extensions: { to_device: { events: [] } } });

    expect(manager.isPaused()).toBe(true);
  });

  it('keeps draining while to-device still carries events', () => {
    const manager = makeManager(makeMockMx());
    manager.attach();
    manager.pause();
    manager.resumeForPush();

    const withKeys = { extensions: { to_device: { events: [{ type: 'm.room.key' }] } } };
    fireLifecycle(SlidingSyncState.Complete, withKeys);
    expect(manager.isPaused()).toBe(false);

    fireLifecycle(SlidingSyncState.Complete, { extensions: { to_device: { events: [] } } });
    expect(manager.isPaused()).toBe(true);
  });

  it('parks a never-draining queue once the poll budget runs out', () => {
    const MAX_PUSH_DRAIN_POLLS = 5;
    const manager = makeManager(makeMockMx());
    manager.attach();
    manager.pause();
    manager.resumeForPush();

    const withKeys = { extensions: { to_device: { events: [{ type: 'm.room.key' }] } } };
    for (let i = 0; i < MAX_PUSH_DRAIN_POLLS; i += 1) {
      expect(manager.isPaused()).toBe(false);
      fireLifecycle(SlidingSyncState.Complete, withKeys);
    }

    expect(manager.isPaused()).toBe(true);
  });

  it('lets a real resume outrank an in-flight drain', () => {
    const manager = makeManager(makeMockMx());
    manager.attach();
    manager.pause();
    manager.resumeForPush();

    manager.resume();
    fireLifecycle(SlidingSyncState.Complete, { extensions: { to_device: { events: [] } } });

    expect(manager.isPaused()).toBe(false);
  });

  it('resumeForPush() is a no-op when sync is already running', () => {
    const manager = makeManager(makeMockMx());
    manager.attach();

    expect(manager.resumeForPush()).toBe(false);

    fireLifecycle(SlidingSyncState.Complete, { extensions: { to_device: { events: [] } } });

    expect(manager.isPaused()).toBe(false);
  });

  it('silences the poll watchdog while paused', () => {
    vi.useFakeTimers();
    try {
      const manager = makeManager(makeMockMx());
      manager.attach();
      manager.pause();
      mocks.slidingSyncInstance.resend.mockClear();

      vi.advanceTimersByTime(DEFAULT_DEADLINE_MS * 3);

      expect(mocks.slidingSyncInstance.resend).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the watchdog silent when the aborted poll emits a lifecycle event', () => {
    vi.useFakeTimers();
    try {
      const manager = makeManager(makeMockMx());
      manager.attach();
      manager.pause();
      mocks.slidingSyncInstance.resend.mockClear();

      fireLifecycle(SlidingSyncState.RequestFinished, {});
      vi.advanceTimersByTime(DEFAULT_DEADLINE_MS * 3);

      expect(mocks.slidingSyncInstance.resend).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-arms the poll watchdog on resume', () => {
    vi.useFakeTimers();
    try {
      const manager = makeManager(makeMockMx());
      manager.attach();
      manager.pause();
      manager.resume();
      mocks.slidingSyncInstance.resend.mockClear();

      vi.advanceTimersByTime(DEFAULT_DEADLINE_MS);

      expect(mocks.slidingSyncInstance.resend).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases parked requests on dispose so the sync loop can unwind', async () => {
    const manager = makeManager(makeMockMx());
    manager.attach();
    manager.pause();

    const parked = manager.waitForResume();
    manager.dispose();

    await expect(parked).resolves.toBeUndefined();
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

const makeTimelineResetRoom = (eventIds: string[], sendingEventIds: string[] = []) => {
  const sending = new Set(sendingEventIds);
  const currentState = {};
  const oldState = {};
  let startState = oldState;
  let events = eventIds.map((id) => ({
    getId: () => id,
    isSending: () => sending.has(id),
  }));
  const liveTimeline = {
    getEvents: () => events,
    getPaginationToken: () => 't1-old',
    getState: (direction: string) =>
      direction === EventTimeline.BACKWARDS ? startState : currentState,
  };
  const resetTimelineSet = vi.fn<(back?: string) => void>(() => {
    events = [];
    startState = {};
  });
  const resetRoomTimeline = vi.fn<() => void>();
  const addEventToTimeline = vi.fn<(event: (typeof events)[number]) => void>((event) => {
    events.push(event);
  });
  const timelineSet = {
    addEventToTimeline,
    findEventById: (eventId: string) => events.find((event) => event.getId() === eventId),
    getLiveTimeline: () => liveTimeline,
    resetLiveTimeline: resetTimelineSet,
  };
  const clearLoadedMembersIfNeeded = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const room = {
    oldState,
    currentState,
    clearLoadedMembersIfNeeded,
    emit: vi.fn<() => void>(),
    getLiveTimeline: () => liveTimeline,
    getUnfilteredTimelineSet: () => timelineSet,
    resetLiveTimeline: resetRoomTimeline,
  };
  return {
    room,
    addEventToTimeline,
    clearLoadedMembersIfNeeded,
    resetRoomTimeline,
    resetTimelineSet,
    startState: () => startState,
  };
};

const prepareRoomTimelineResponse = (
  room: unknown,
  roomData: Record<string, unknown>,
  resetNotif = vi.fn<() => void>()
) =>
  prepareSlidingSyncTimelines(
    { rooms: { '!room:example.org': roomData } } as unknown as MSC3575SlidingSyncResponse,
    {
      getRoom: () => room,
      resetNotifTimelineSet: resetNotif,
    } as unknown as MatrixClient
  );

describe('prepareSlidingSyncTimelines reset boundary', () => {
  it.each([
    [
      'limited gap',
      ['$old'],
      { limited: true, timeline: [{ event_id: '$new' }], prev_batch: 't' },
      true,
    ],
    [
      'limited overlap',
      ['$old'],
      { limited: true, timeline: [{ event_id: '$old' }, { event_id: '$new' }] },
      false,
    ],
    [
      'initial gap',
      ['$old'],
      { initial: true, timeline: [{ event_id: '$new' }], prev_batch: 't' },
      true,
    ],
    [
      'initial overlap',
      ['$old'],
      { initial: true, timeline: [{ event_id: '$old' }, { event_id: '$new' }] },
      false,
    ],
    ['initial empty', ['$old'], { initial: true, timeline: [] }, false],
    ['ordinary update', ['$old'], { timeline: [{ event_id: '$new' }] }, false],
    ['empty cache', [], { limited: true, timeline: [{ event_id: '$new' }] }, false],
  ])('%s reset decision', (_name, eventIds, roomData, shouldReset) => {
    const { room, resetTimelineSet } = makeTimelineResetRoom(eventIds as string[]);

    prepareRoomTimelineResponse(room, roomData as Record<string, unknown>);

    expect(resetTimelineSet).toHaveBeenCalledTimes(shouldReset ? 1 : 0);
  });

  it('flushes lazily loaded members only when the server reports limited', () => {
    const overlapping = makeTimelineResetRoom(['$old']);
    prepareRoomTimelineResponse(overlapping.room, {
      limited: true,
      timeline: [{ event_id: '$old' }, { event_id: '$new' }],
    });
    expect(overlapping.resetTimelineSet).not.toHaveBeenCalled();
    expect(overlapping.clearLoadedMembersIfNeeded).toHaveBeenCalledOnce();

    const expanded = makeTimelineResetRoom(['$old']);
    prepareRoomTimelineResponse(expanded.room, {
      expanded_timeline: true,
      timeline: [{ event_id: '$old' }, { event_id: '$new' }],
    });
    expect(expanded.clearLoadedMembersIfNeeded).not.toHaveBeenCalled();
  });

  it('resets a gapped timeline even while a room shows a focused jump window', () => {
    const { room, clearLoadedMembersIfNeeded, resetTimelineSet } = makeTimelineResetRoom(['$old']);
    const roomData = { limited: true, timeline: [{ event_id: '$new' }], prev_batch: 't' };

    prepareRoomTimelineResponse(room, { ...roomData });
    expect(resetTimelineSet).toHaveBeenCalledTimes(1);
    expect(clearLoadedMembersIfNeeded).toHaveBeenCalledOnce();
  });

  it('restores a sending event after the response is merged', () => {
    const { room, addEventToTimeline, resetTimelineSet } = makeTimelineResetRoom(
      ['$old', '~local'],
      ['~local']
    );

    const completeTimelineReset = prepareRoomTimelineResponse(room, {
      limited: true,
      timeline: [{ event_id: '$new' }],
      prev_batch: 't',
    });
    completeTimelineReset?.();

    expect(resetTimelineSet).toHaveBeenCalledOnce();
    expect(addEventToTimeline).toHaveBeenCalledOnce();
  });

  it('resets only the unfiltered timeline and updates the room state references', () => {
    const { room, resetRoomTimeline, resetTimelineSet, startState } = makeTimelineResetRoom([
      '$old',
    ]);

    prepareRoomTimelineResponse(room, {
      limited: true,
      timeline: [{ event_id: '$new' }],
      prev_batch: 'back-token',
    });

    expect(resetTimelineSet).toHaveBeenCalledWith('back-token');
    expect(resetRoomTimeline).not.toHaveBeenCalled();
    expect(room.oldState).toBe(startState());
    expect(room.currentState).toBe(room.getLiveTimeline().getState(EventTimeline.FORWARDS));
  });

  it('resets the notification timeline once for a multi-room response', () => {
    const first = makeTimelineResetRoom(['$old-a']);
    const second = makeTimelineResetRoom(['$old-b']);
    const resetNotifTimelineSet = vi.fn<() => void>();

    prepareSlidingSyncTimelines(
      {
        rooms: {
          '!a:example.org': { limited: true, timeline: [{ event_id: '$new-a' }], prev_batch: 't' },
          '!b:example.org': { limited: true, timeline: [{ event_id: '$new-b' }], prev_batch: 't' },
        },
      } as unknown as MSC3575SlidingSyncResponse,
      {
        getRoom: (roomId: string) => (roomId === '!a:example.org' ? first.room : second.room),
        resetNotifTimelineSet,
      } as unknown as MatrixClient
    );

    expect(first.resetTimelineSet).toHaveBeenCalledOnce();
    expect(second.resetTimelineSet).toHaveBeenCalledOnce();
    expect(resetNotifTimelineSet).toHaveBeenCalledOnce();
  });

  it('caps room subscriptions at the MSC4186 maximum', () => {
    const manager = makeManager(makeMockMx());
    manager.attach();

    for (let i = 0; i < 140; i += 1) {
      manager.subscribeToRoom(`!room${i}:example.com`);
    }

    const lastCall = mocks.slidingSyncInstance.modifyRoomSubscriptions.mock.calls.at(-1);
    const requested = (lastCall as unknown as [ReadonlySet<string>])[0];
    expect(requested.size).toBe(100);
    expect(requested.has('!room0:example.com')).toBe(true);
  });
});
