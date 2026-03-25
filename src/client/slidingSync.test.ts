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
 *    Note: navigation between rooms does not call unsubscribeFromRoom —
 *    subscriptions accumulate across the session so returning to a room is
 *    instant (matching Element Web's model).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlidingSyncManager, type SlidingSyncConfig } from './slidingSync';

// ── vi.hoisted mocks ─────────────────────────────────────────────────────────
// Must be defined via vi.hoisted so they're available before vi.mock runs
// (vi.mock calls are hoisted above all imports by vitest's transformer).
const mocks = vi.hoisted(() => ({
  slidingSyncInstance: {
    on: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    stop: vi.fn(),
    modifyRoomSubscriptions: vi.fn(),
    modifyRoomSubscriptionInfo: vi.fn(),
    addCustomSubscription: vi.fn(),
    useCustomSubscription: vi.fn(),
    registerExtension: vi.fn(),
    getListData: vi.fn(() => null),
    getListParams: vi.fn(() => null),
    setList: vi.fn(),
    setListRanges: vi.fn(),
  },
}));

// ── Sentry stub ──────────────────────────────────────────────────────────────
vi.mock('@sentry/react', () => ({
  metrics: { count: vi.fn(), gauge: vi.fn(), distribution: vi.fn() },
  addBreadcrumb: vi.fn(),
  startInactiveSpan: vi.fn(() => ({
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    end: vi.fn(),
  })),
  startSpan: vi.fn(async (_opts: unknown, fn: (span: object) => unknown) =>
    fn({ setAttributes: vi.fn(), setAttribute: vi.fn(), end: vi.fn() })
  ),
}));

// ── SlidingSync SDK mock ─────────────────────────────────────────────────────
// vi.fn() wrappers are arrow functions internally and cannot be called with `new`.
// A plain function constructor (returning an object) is the correct pattern.
vi.mock('$types/matrix-sdk', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  function MockSlidingSync() {
    return mocks.slidingSyncInstance;
  }
  return { ...actual, SlidingSync: MockSlidingSync };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMockMx(overrides: Record<string, unknown> = {}) {
  return {
    getUserId: vi.fn().mockReturnValue('@user:example.com'),
    getSafeUserId: vi.fn().mockReturnValue('@user:example.com'),
    isRoomEncrypted: vi.fn().mockReturnValue(false),
    getRoom: vi.fn().mockReturnValue(null),
    on: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    ...overrides,
  } as unknown as import('$types/matrix-sdk').MatrixClient;
}

function makeManager(mx: ReturnType<typeof makeMockMx>): SlidingSyncManager {
  const config: SlidingSyncConfig = {};
  return new SlidingSyncManager(mx, 'https://sliding.example.com', config);
}

beforeEach(() => {
  vi.clearAllMocks();
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

    fireMembershipEvent(mx, 'leave');

    // subscribeToRoom + unsubscribeFromRoom = 2 calls
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes when the local user is banned from an active room', () => {
    const mx = makeMockMx();
    const manager = makeManager(mx);
    manager.attach();
    manager.subscribeToRoom('!room:example.com');

    fireMembershipEvent(mx, 'ban');

    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledTimes(2);
  });

  it('does nothing when a different user leaves', () => {
    const mx = makeMockMx();
    const manager = makeManager(mx);
    manager.attach();
    manager.subscribeToRoom('!room:example.com');

    fireMembershipEvent(mx, 'leave', '!room:example.com', '@other:example.com');

    // Only the initial subscribe — no unsubscribe
    expect(mocks.slidingSyncInstance.modifyRoomSubscriptions).toHaveBeenCalledTimes(1);
  });

  it('does nothing when membership is join', () => {
    const mx = makeMockMx();
    const manager = makeManager(mx);
    manager.attach();
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
