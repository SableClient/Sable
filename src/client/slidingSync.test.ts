/**
 * Unit tests for SlidingSyncManager memory management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MatrixClient, MSC3575List } from '$types/matrix-sdk';
import { EventType, KnownMembership, SlidingSyncEvent, SlidingSyncState } from '$types/matrix-sdk';

import { scopeEphemeralExtensions, SlidingSyncManager } from './slidingSync';

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
    expect(defaultSubscription.timeline_limit).toBe(30);
    expect(defaultSubscription.required_state).toContainEqual([EventType.RoomMember, '$LAZY']);
    expect(defaultSubscription.required_state).not.toContainEqual([EventType.RoomMember, '*']);
    expect(mocks.slidingSyncConstructorArgs?.[4]).toBe(45000);
  });

  it('settles response processing after post-response work can finish', async () => {
    const manager = makeManager(makeMockMx());
    const settled = vi.fn<() => void>();
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
    const updateMyMembership = vi.fn<() => void>();
    const manager = makeManager(
      makeMockMx({
        getRoom: vi.fn<() => { updateMyMembership: typeof updateMyMembership }>().mockReturnValue({
          updateMyMembership,
        }),
      })
    );

    manager.reconcileRoomMembership('!invite:example.com', KnownMembership.Join);

    expect(updateMyMembership).toHaveBeenCalledWith(KnownMembership.Join);
  });

  it('updates and unsubscribes a room immediately after a successful leave', () => {
    const updateMyMembership = vi.fn<() => void>();
    const manager = makeManager(
      makeMockMx({
        getRoom: vi.fn<() => { updateMyMembership: typeof updateMyMembership }>().mockReturnValue({
          updateMyMembership,
        }),
      })
    );
    manager.subscribeToRoom('!room:example.com');

    manager.reconcileRoomMembership('!room:example.com', KnownMembership.Leave);

    expect(updateMyMembership).toHaveBeenCalledWith(KnownMembership.Leave);
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
