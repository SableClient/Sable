/**
 * Unit tests for SlidingSyncManager memory management:
 *
 * 1. dispose() — must call slidingSync.stop() to halt the polling loop and
 *    abort in-flight requests. Without this the SDK's Promise loop keeps
 *    running after the client is "stopped", leaking network traffic and
 *    event listeners.
 *
 * 2. onMembershipLeave — when the MatrixClient emits a RoomMemberEvent.Membership
 *    event indicating the local user left or was banned from a room that is
 *    actively subscribed, unsubscribeFromRoom() should be called automatically.
 *
 *    Note: navigation cleanup calls unsubscribeFromRoom so sliding sync does
 *    not accumulate background room subscriptions across the session.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SlidingSyncEvent,
  SlidingSyncState,
  type MatrixEvent,
  type MatrixClient,
} from '$types/matrix-sdk';

import {
  LIST_DMS,
  LIST_INVITES,
  LIST_JOINED,
  SlidingSyncManager,
  type SlidingSyncConfig,
} from './slidingSync';

// ── vi.hoisted mocks ─────────────────────────────────────────────────────────
// Must be defined via vi.hoisted so they're available before vi.mock runs
// (vi.mock calls are hoisted above all imports by vitest's transformer).
const mocks = vi.hoisted(() => ({
  slidingSyncConstructor: vi.fn<(...args: unknown[]) => void>(),
  slidingSyncInstance: {
    on: vi.fn<() => void>(),
    off: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
    stop: vi.fn<() => void>(),
    modifyRoomSubscriptions: vi.fn<() => void>(),
    modifyRoomSubscriptionInfo: vi.fn<() => void>(),
    resend: vi.fn<() => void>(),
    addCustomSubscription: vi.fn<() => void>(),
    useCustomSubscription: vi.fn<() => void>(),
    registerExtension: vi.fn<() => void>(),
    getListData: vi.fn<(key?: unknown) => { joinedCount: number } | null>(),
    getListParams: vi.fn<(key?: unknown) => { ranges?: [number, number][] } | null>(),
    setList: vi.fn<() => void>(),
    setListRanges: vi.fn<() => void>(),
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
// vi.fn() wrappers are arrow functions internally and cannot be called with `new`.
// A plain function constructor (returning an object) is the correct pattern.
vi.mock('$types/matrix-sdk', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  function MockSlidingSync(...args: unknown[]) {
    mocks.slidingSyncConstructor(...args);
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
    getRooms: vi.fn<() => unknown[]>().mockReturnValue([]),
    on: vi.fn<() => void>(),
    off: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
    ...overrides,
  } as unknown as MatrixClient;
}

function makeManager(mx: ReturnType<typeof makeMockMx>): SlidingSyncManager {
  const config: SlidingSyncConfig = {};
  return new SlidingSyncManager(mx, 'https://sliding.example.com', config);
}

function makeMockRoom(overrides: Record<string, unknown> = {}) {
  const room = {
    addLiveEvents: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    partitionThreadedEvents: vi
      .fn<(events: MatrixEvent[]) => [MatrixEvent[], MatrixEvent[], MatrixEvent[]]>()
      .mockImplementation((events) => [
        events.filter((event) => !event.threadRootId),
        events.filter((event) => !!event.threadRootId),
        [],
      ]),
    resetLiveTimeline: vi.fn<() => void>(),
    getUnfilteredTimelineSet: vi
      .fn<
        () => {
          getLiveTimeline: () => { getEvents: () => MatrixEvent[] };
        }
      >()
      .mockReturnValue({
        getLiveTimeline: () => ({
          getEvents: () => [],
        }),
      }),
    ...overrides,
  };
  return room;
}

function fireLifecycle(state: SlidingSyncState, resp: unknown = {}) {
  const lifecycleCall = mocks.slidingSyncInstance.on.mock.calls.find(
    (args: unknown[]) => args[0] === SlidingSyncEvent.Lifecycle
  );
  if (!lifecycleCall) throw new Error('lifecycle listener not registered');
  const [, handler] = lifecycleCall as unknown as [
    SlidingSyncEvent,
    (state: SlidingSyncState, resp: unknown, err?: Error) => void,
  ];
  handler(state, resp);
}

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.slidingSyncInstance.getListParams.mockImplementation((key: unknown) => {
    if (key === LIST_JOINED || key === LIST_DMS || key === LIST_INVITES) {
      return { ranges: [[0, 29]] };
    }
    return null;
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── startup cache detection ─────────────────────────────────────────────────

describe('SlidingSyncManager.hasWarmCache()', () => {
  it('uses the persisted-cache startup signal when rooms are not in memory yet', () => {
    const manager = new SlidingSyncManager(
      makeMockMx({ getRooms: vi.fn<() => unknown[]>().mockReturnValue([]) }),
      'https://sliding.example.com',
      {},
      true
    );

    expect(manager.hasWarmCache()).toBe(true);
  });

  it('keeps cold-cache starts cold when no startup warm-cache signal exists', () => {
    const manager = new SlidingSyncManager(
      makeMockMx({ getRooms: vi.fn<() => unknown[]>().mockReturnValue([]) }),
      'https://sliding.example.com',
      {},
      false
    );

    expect(manager.hasWarmCache()).toBe(false);
  });

  it('falls back to initial in-memory rooms when no startup signal is supplied', () => {
    const manager = makeManager(
      makeMockMx({ getRooms: vi.fn<() => unknown[]>().mockReturnValue([{}]) })
    );

    expect(manager.hasWarmCache()).toBe(true);
  });
});

describe('SlidingSyncManager initial list request shape', () => {
  it('requests only the first visible window with state-only list rooms by default', () => {
    makeManager(makeMockMx());

    const [, lists] = mocks.slidingSyncConstructor.mock.calls[0] as unknown as [
      string,
      Map<
        string,
        {
          ranges: [number, number][];
          timeline_limit: number;
          required_state: [string, string][];
          slow_get_all_rooms?: boolean;
        }
      >,
    ];
    const joined = lists.get(LIST_JOINED);
    const dms = lists.get(LIST_DMS);
    const invites = lists.get(LIST_INVITES);

    expect(joined?.ranges).toEqual([[0, 29]]);
    expect(dms?.ranges).toEqual([[0, 29]]);
    expect(invites?.ranges).toEqual([[0, 29]]);
    expect(joined?.timeline_limit).toBe(0);
    expect(joined?.slow_get_all_rooms).toBeUndefined();
    expect(joined?.required_state).not.toContainEqual(['m.space.child', '*']);
    expect(joined?.required_state).not.toContainEqual(['im.ponies.room_emotes', '*']);
    expect(joined?.required_state).not.toContainEqual(['m.room.canonical_alias', '']);
  });

  it('uses a tiny list timeline when previews opt in', () => {
    const manager = new SlidingSyncManager(
      makeMockMx(),
      'https://sliding.example.com',
      { listTimelineLimit: 1 },
      false
    );

    const [, lists] = mocks.slidingSyncConstructor.mock.calls[0] as unknown as [
      string,
      Map<string, { timeline_limit: number; required_state: [string, string][] }>,
    ];
    const joined = lists.get(LIST_JOINED);

    expect(joined?.timeline_limit).toBe(1);
    expect(joined?.required_state).toContainEqual(['m.room.member', '$LAZY']);
    expect(manager.hasWarmCache()).toBe(false);
  });
});

describe('SlidingSyncManager.hasSufficientRoomsLoaded()', () => {
  it('waits for each known list to reach the requested visible window', () => {
    mocks.slidingSyncInstance.getListData.mockImplementation((key: unknown) => {
      if (key === LIST_JOINED) return { joinedCount: 600 };
      if (key === LIST_DMS) return { joinedCount: 10 };
      if (key === LIST_INVITES) return { joinedCount: 0 };
      return null;
    });
    const manager = makeManager(makeMockMx());
    manager.attach();
    fireLifecycle(SlidingSyncState.RequestFinished, {
      rooms: {},
      lists: {
        [LIST_JOINED]: {
          ops: [{ range: [0, 10], room_ids: Array.from({ length: 11 }, (_, i) => `!j${i}`) }],
        },
        [LIST_DMS]: {
          ops: [{ range: [0, 9], room_ids: Array.from({ length: 10 }, (_, i) => `!d${i}`) }],
        },
      },
    });

    expect(manager.hasSufficientRoomsLoaded()).toBe(false);
  });

  it('allows startup once every known list has the requested visible window', () => {
    mocks.slidingSyncInstance.getListData.mockImplementation((key: unknown) => {
      if (key === LIST_JOINED) return { joinedCount: 600 };
      if (key === LIST_DMS) return { joinedCount: 10 };
      if (key === LIST_INVITES) return { joinedCount: 0 };
      return null;
    });
    const manager = makeManager(makeMockMx());
    manager.attach();
    fireLifecycle(SlidingSyncState.RequestFinished, {
      rooms: {},
      lists: {
        [LIST_JOINED]: {
          ops: [{ range: [0, 29], room_ids: Array.from({ length: 30 }, (_, i) => `!j${i}`) }],
        },
        [LIST_DMS]: {
          ops: [{ range: [0, 9], room_ids: Array.from({ length: 10 }, (_, i) => `!d${i}`) }],
        },
      },
    });

    expect(manager.hasSufficientRoomsLoaded()).toBe(true);
  });
});

describe('SlidingSyncManager.requestListWindow()', () => {
  it('expands list ranges on demand instead of during sync completion', () => {
    mocks.slidingSyncInstance.getListData.mockImplementation((key: unknown) => {
      if (key === LIST_JOINED) return { joinedCount: 120 };
      return null;
    });
    const manager = makeManager(makeMockMx());
    manager.attach();

    fireLifecycle(SlidingSyncState.Complete, {});
    expect(mocks.slidingSyncInstance.setListRanges).not.toHaveBeenCalled();

    manager.requestListWindow(LIST_JOINED, 59);
    expect(mocks.slidingSyncInstance.setListRanges).toHaveBeenCalledWith(LIST_JOINED, [[0, 59]]);
  });

  it('does not shrink or resend an already covered window', () => {
    mocks.slidingSyncInstance.getListData.mockImplementation((key: unknown) => {
      if (key === LIST_JOINED) return { joinedCount: 120 };
      return null;
    });
    const manager = makeManager(makeMockMx());

    manager.requestListWindow(LIST_JOINED, 10);

    expect(mocks.slidingSyncInstance.setListRanges).not.toHaveBeenCalled();
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

describe('SlidingSyncManager — membership leave auto-unsubscribe', () => {
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

  it('unsubscribes when the local user leaves an active room', () => {
    const mx = makeMockMx();
    const manager = makeManager(mx);
    manager.attach();
    manager.subscribeToRoom('!room:example.com');
    vi.advanceTimersByTime(100);

    fireMembershipEvent(mx, 'leave');
    vi.advanceTimersByTime(100);

    // subscribeToRoom + unsubscribeFromRoom = 2 calls
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes when the local user is banned from an active room', () => {
    const mx = makeMockMx();
    const manager = makeManager(mx);
    manager.attach();
    manager.subscribeToRoom('!room:example.com');
    vi.advanceTimersByTime(100);

    fireMembershipEvent(mx, 'ban');
    vi.advanceTimersByTime(100);

    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledTimes(2);
  });

  it('does nothing when a different user leaves', () => {
    const mx = makeMockMx();
    const manager = makeManager(mx);
    manager.attach();
    manager.subscribeToRoom('!room:example.com');
    vi.advanceTimersByTime(100);

    fireMembershipEvent(mx, 'leave', '!room:example.com', '@other:example.com');

    // Only the initial subscribe — no unsubscribe
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledTimes(1);
  });

  it('does nothing when membership is join', () => {
    const mx = makeMockMx();
    const manager = makeManager(mx);
    manager.attach();
    manager.subscribeToRoom('!room:example.com');
    vi.advanceTimersByTime(100);

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

  it('does not resend a subscription for a room that is already active', () => {
    const manager = makeManager(makeMockMx());
    manager.subscribeToRoom('!room:example.com');
    manager.subscribeToRoom('!room:example.com');
    vi.advanceTimersByTime(100);

    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledTimes(1);
  });

  it('batches rapid active-room subscriptions into one SDK update', () => {
    const manager = makeManager(makeMockMx());
    manager.subscribeToRoom('!a:example.com');
    manager.subscribeToRoom('!b:example.com');
    vi.advanceTimersByTime(100);

    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledTimes(1);
    const firstCall = mocks.slidingSyncInstance.modifyRoomSubscriptions.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [rooms] = firstCall as unknown as [Set<string>];
    expect([...rooms].toSorted()).toEqual(['!a:example.com', '!b:example.com']);
  });

  it('removes a room subscription when navigation cleanup unsubscribes it', () => {
    const manager = makeManager(makeMockMx());
    manager.subscribeToRoom('!room:example.com');
    vi.advanceTimersByTime(100);
    mocks.slidingSyncInstance.modifyRoomSubscriptions.mockClear();

    manager.unsubscribeFromRoom('!room:example.com');
    vi.advanceTimersByTime(100);

    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledOnce();
    const [rooms] = mocks.slidingSyncInstance.modifyRoomSubscriptions.mock.calls[0] as unknown as [
      Set<string>,
    ];
    expect([...rooms]).toEqual([]);
  });
});

// ── pull-to-refresh force reset ──────────────────────────────────────────────

describe('SlidingSyncManager.scheduleForceReset()', () => {
  it('restores room subscriptions when the empty cycle finishes', () => {
    const manager = makeManager(makeMockMx());
    manager.attach();
    manager.subscribeToRoom('!room:example.com');
    vi.advanceTimersByTime(100);
    mocks.slidingSyncInstance.modifyRoomSubscriptions.mockClear();
    mocks.slidingSyncInstance.resend.mockClear();

    manager.scheduleForceReset();
    fireLifecycle(SlidingSyncState.RequestFinished, { rooms: {} });

    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledTimes(2);
    const [emptySet] = mocks.slidingSyncInstance.modifyRoomSubscriptions.mock
      .calls[0] as unknown as [Set<string>];
    const [restoredSet] = mocks.slidingSyncInstance.modifyRoomSubscriptions.mock
      .calls[1] as unknown as [Set<string>];
    expect([...emptySet]).toEqual([]);
    expect([...restoredSet]).toEqual(['!room:example.com']);
    expect(mocks.slidingSyncInstance.resend).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(5000);
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledTimes(2);
  });

  it('restores room subscriptions if the empty cycle never finishes', () => {
    const manager = makeManager(makeMockMx());
    manager.subscribeToRoom('!room:example.com');
    vi.advanceTimersByTime(100);
    mocks.slidingSyncInstance.modifyRoomSubscriptions.mockClear();
    mocks.slidingSyncInstance.resend.mockClear();

    manager.scheduleForceReset();
    vi.advanceTimersByTime(4999);

    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);

    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledTimes(2);
    const [emptySet] = mocks.slidingSyncInstance.modifyRoomSubscriptions.mock
      .calls[0] as unknown as [Set<string>];
    const [restoredSet] = mocks.slidingSyncInstance.modifyRoomSubscriptions.mock
      .calls[1] as unknown as [Set<string>];
    expect([...emptySet]).toEqual([]);
    expect([...restoredSet]).toEqual(['!room:example.com']);
    expect(mocks.slidingSyncInstance.resend).toHaveBeenCalledTimes(2);
  });

  it('resets active room timelines before resubscribing', () => {
    const room = makeMockRoom();
    const mx = makeMockMx({
      getRoom: vi.fn<() => unknown>().mockReturnValue(room),
    });
    const manager = makeManager(mx);
    manager.subscribeToRoom('!room:example.com');
    vi.advanceTimersByTime(100);

    manager.scheduleForceReset();

    expect(room.resetLiveTimeline).toHaveBeenCalledOnce();
  });
});

// ── timeline handoff ────────────────────────────────────────────────────────

describe('SlidingSyncManager — timeline handoff', () => {
  it('leaves timeline events for the SDK sliding-sync handler to process', () => {
    const manager = makeManager(makeMockMx());
    manager.attach();
    const response = {
      rooms: {
        '!room:example.com': {
          timeline: [
            {
              event_id: '$event',
              type: 'm.room.message',
              sender: '@alice:example.com',
              origin_server_ts: 1,
              content: { body: 'hello', msgtype: 'm.text' },
            },
          ],
        },
      },
    };

    fireLifecycle(SlidingSyncState.RequestFinished, response);

    expect(response.rooms['!room:example.com'].timeline).toHaveLength(1);
  });
});

// ── network changes: avoid foreground resend cascades ───────────────────────

describe('SlidingSyncManager — network change handling', () => {
  function installConnectionMock(): { fireConnectionChange: () => void } {
    let onChange: (() => void) | undefined;
    Object.defineProperty(window.navigator, 'connection', {
      configurable: true,
      value: {
        effectiveType: '4g',
        downlink: 10,
        addEventListener: vi.fn<(event: string, cb: () => void) => void>((event, cb) => {
          if (event === 'change') onChange = cb;
        }),
        removeEventListener: vi.fn<() => void>(),
        onchange: null,
      },
    });
    return {
      fireConnectionChange: () => {
        if (!onChange) throw new Error('connection change listener not registered');
        onChange();
      },
    };
  }

  afterEach(() => {
    setNavigatorOnline(true);
    Object.defineProperty(window.navigator, 'connection', {
      configurable: true,
      value: undefined,
    });
  });

  it('ignores online-only network changes', () => {
    setNavigatorOnline(true);
    const { fireConnectionChange } = installConnectionMock();
    const manager = makeManager(makeMockMx());
    manager.attach();

    fireConnectionChange();

    expect(mocks.slidingSyncInstance.resend).not.toHaveBeenCalled();
  });

  it('resends when the browser transitions from offline to online', () => {
    setNavigatorOnline(true);
    const { fireConnectionChange } = installConnectionMock();
    const manager = makeManager(makeMockMx());
    manager.attach();

    setNavigatorOnline(false);
    fireConnectionChange();
    setNavigatorOnline(true);
    fireConnectionChange();

    expect(mocks.slidingSyncInstance.resend).toHaveBeenCalledOnce();
  });
});
