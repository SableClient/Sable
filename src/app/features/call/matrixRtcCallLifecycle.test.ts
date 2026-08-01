import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type {
  MatrixClient,
  MatrixRTCSession,
  CallMembership,
  JoinSessionConfig,
  Room,
} from '$types/matrix-sdk';
import { MatrixRTCSessionEvent } from '$types/matrix-sdk';
import {
  joinAndProvisionMatrixRTC,
  leaveMatrixRTCOnPageHide,
  ROSTER_HYDRATION_ERROR,
} from './matrixRtcCallLifecycle';
import type {
  LivekitProvisioningResult,
  getPreferredLivekitTransport,
  provisionLivekitToken,
} from './livekitProvisioning';

const mocks = vi.hoisted(() => ({ getSlidingSyncManager: vi.fn<() => unknown>() }));

vi.mock('$client/initMatrix', () => ({ getSlidingSyncManager: mocks.getSlidingSyncManager }));

type SessionHandler = (...args: unknown[]) => void;

type TestSession = MatrixRTCSession & {
  handlers: Map<MatrixRTCSessionEvent, SessionHandler>;
};

const makeSession = (): TestSession => {
  const handlers = new Map<MatrixRTCSessionEvent, SessionHandler>();
  const session = {
    handlers,
    memberships: [] as CallMembership[],
    slotId: 'm.call#slot',
    on: vi
      .fn<(event: MatrixRTCSessionEvent, handler: SessionHandler) => void>()
      .mockImplementation((event, handler) => {
        handlers.set(event, handler);
      }),
    removeListener: vi
      .fn<(event: MatrixRTCSessionEvent, handler: SessionHandler) => void>()
      .mockImplementation((event, handler) => {
        if (handlers.get(event) === handler) {
          handlers.delete(event);
        }
      }),
    joinRTCSession: vi.fn<(identity: unknown, transports: unknown[], ..._: unknown[]) => void>(),
    getOldestMembership: vi.fn<() => CallMembership | undefined>().mockReturnValue(undefined),
    leaveRoomSession: vi.fn<MatrixRTCSession['leaveRoomSession']>().mockResolvedValue(true),
  } as unknown as TestSession;
  return session;
};

const emitMembershipManagerError = (session: TestSession): void => {
  session.handlers.get(MatrixRTCSessionEvent.MembershipManagerError)?.();
};

const makeClient = (overrides: Partial<MatrixClient> = {}): MatrixClient =>
  ({
    getDeviceId: () => 'ALICEDEVICE',
    getSafeUserId: () => '@alice:example.org',
    getStateEvent: vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValue(undefined) as unknown as MatrixClient['getStateEvent'],
    ...overrides,
  }) as unknown as MatrixClient;

const provisioned: LivekitProvisioningResult = { url: 'wss://livekit.example', jwt: 'jwt' };

const makeTransport = () => ({
  type: 'livekit' as const,
  livekit_service_url: 'https://sfu.example',
});

type RosterOverrides = {
  loadMembersIfNeeded?: () => Promise<boolean>;
  clearLoadedMembersIfNeeded?: () => Promise<void>;
  membersLoaded?: () => boolean;
  joinedInState?: number | (() => number);
  joinedCount?: number;
};

const makeRoom = ({
  loadMembersIfNeeded = () => Promise.resolve(true),
  clearLoadedMembersIfNeeded = () => Promise.resolve(),
  membersLoaded = () => true,
  joinedInState = 2,
  joinedCount = 2,
}: RosterOverrides = {}): Room => {
  const inState = typeof joinedInState === 'function' ? joinedInState : () => joinedInState;
  return {
    roomId: '!room:example.org',
    loadMembersIfNeeded,
    clearLoadedMembersIfNeeded,
    membersLoaded,
    getMembersWithMembership: () => Array.from({ length: inState() }, () => ({})),
    getJoinedMemberCount: () => joinedCount,
  } as unknown as Room;
};

describe('joinAndProvisionMatrixRTC', () => {
  beforeEach(() => {
    // vi.useFakeTimers() would interfere with setInterval; use real timers.
    mocks.getSlidingSyncManager.mockReset().mockReturnValue(undefined);
  });

  const callOpts = (overrides: Record<string, unknown> = {}) => ({
    mx: makeClient(),
    room: makeRoom(),
    session: makeSession(),
    callIntent: 'audio' as const,
    getPreferredTransport: vi
      .fn<typeof getPreferredLivekitTransport>()
      .mockResolvedValue(makeTransport()),
    provisionToken: vi.fn<typeof provisionLivekitToken>().mockResolvedValue(provisioned),
    ...overrides,
  });

  it('uses the call-room subscription before publishing an RTC membership', async () => {
    const session = makeSession();
    const unsubscribe = vi.fn<() => void>();
    const subscribeToCallRoom = vi.fn<() => () => void>().mockReturnValue(unsubscribe);
    mocks.getSlidingSyncManager.mockReturnValue({ subscribeToCallRoom });
    const onCallRoomSubscribed = vi.fn<(unsubscribe: () => void) => void>();

    const promise = joinAndProvisionMatrixRTC(callOpts({ session, onCallRoomSubscribed }));
    await vi.waitFor(() => expect(session.joinRTCSession).toHaveBeenCalled());

    session.memberships = [
      { userId: '@alice:example.org', deviceId: 'ALICEDEVICE' },
    ] as CallMembership[];
    session.handlers.get(MatrixRTCSessionEvent.MembershipsChanged)!([], session.memberships);
    await promise;

    expect(subscribeToCallRoom).toHaveBeenCalledWith('!room:example.org');
    expect(onCallRoomSubscribed).toHaveBeenCalledWith(unsubscribe);
  });

  it('resolves when MembershipsChanged fires with own membership', async () => {
    const session = makeSession();
    const opts = callOpts({ session });
    const promise = joinAndProvisionMatrixRTC(opts);

    // wait for listener registration in the microtask/event loop
    await vi.waitFor(() =>
      expect(session.on).toHaveBeenCalledWith(
        MatrixRTCSessionEvent.MembershipsChanged,
        expect.any(Function)
      )
    );

    // fire the membership event
    session.memberships = [
      { userId: '@alice:example.org', deviceId: 'ALICEDEVICE' },
    ] as CallMembership[];
    session.handlers.get(MatrixRTCSessionEvent.MembershipsChanged)!([], session.memberships);

    const result = await promise;
    expect(result.provisioned).toEqual(provisioned);
    expect(opts.getPreferredTransport).toHaveBeenCalledOnce();
  });

  it('advertises the transport with a livekit alias and a bounded membership expiry', async () => {
    const session = makeSession();
    const opts = callOpts({ session });
    const promise = joinAndProvisionMatrixRTC(opts);

    await vi.waitFor(() => expect(session.joinRTCSession).toHaveBeenCalled());
    session.memberships = [
      { userId: '@alice:example.org', deviceId: 'ALICEDEVICE' },
    ] as CallMembership[];
    session.handlers.get(MatrixRTCSessionEvent.MembershipsChanged)!([], session.memberships);
    await promise;

    const [, transports, , joinConfig] = (session.joinRTCSession as Mock).mock.calls[0] as [
      unknown,
      unknown[],
      unknown,
      JoinSessionConfig,
    ];
    expect(transports).toEqual([{ ...makeTransport(), livekit_alias: '!room:example.org' }]);
    expect(joinConfig.membershipEventExpiryMs).toBe(30 * 60 * 1000);
    expect(joinConfig.unstableSendStickyEvents).toBeUndefined();
  });

  it('provisions against the oldest membership transport, not our own preference', async () => {
    const session = makeSession();
    const oldestTransport = { type: 'livekit' as const, livekit_service_url: 'https://oldest.sfu' };
    const oldest = {
      userId: '@bob:example.org',
      deviceId: 'BOBDEVICE',
      getTransport: () => oldestTransport,
    } as unknown as CallMembership;
    (session.getOldestMembership as Mock<() => CallMembership | undefined>).mockReturnValue(oldest);
    const opts = callOpts({ session });
    const promise = joinAndProvisionMatrixRTC(opts);

    await vi.waitFor(() => expect(session.on).toHaveBeenCalled());
    session.memberships = [
      { userId: '@alice:example.org', deviceId: 'ALICEDEVICE' },
    ] as CallMembership[];
    session.handlers.get(MatrixRTCSessionEvent.MembershipsChanged)!([], session.memberships);
    await promise;

    expect(opts.provisionToken).toHaveBeenCalledWith(
      expect.objectContaining({ serviceUrl: 'https://oldest.sfu' })
    );
  });

  it('falls back to the preferred transport when the oldest membership has none', async () => {
    const session = makeSession();
    const oldest = {
      userId: '@bob:example.org',
      deviceId: 'BOBDEVICE',
      getTransport: () => undefined,
    } as unknown as CallMembership;
    (session.getOldestMembership as Mock<() => CallMembership | undefined>).mockReturnValue(oldest);
    const opts = callOpts({ session });
    const promise = joinAndProvisionMatrixRTC(opts);

    await vi.waitFor(() => expect(session.on).toHaveBeenCalled());
    session.memberships = [
      { userId: '@alice:example.org', deviceId: 'ALICEDEVICE' },
    ] as CallMembership[];
    session.handlers.get(MatrixRTCSessionEvent.MembershipsChanged)!([], session.memberships);
    await promise;

    expect(opts.provisionToken).toHaveBeenCalledWith(
      expect.objectContaining({ serviceUrl: 'https://sfu.example' })
    );
  });

  it('rejects on MembershipManagerError', async () => {
    const session = makeSession();
    const opts = callOpts({ session });
    const promise = joinAndProvisionMatrixRTC(opts);

    await vi.waitFor(() =>
      expect(session.on).toHaveBeenCalledWith(
        MatrixRTCSessionEvent.MembershipManagerError,
        expect.any(Function)
      )
    );

    emitMembershipManagerError(session);

    await expect(promise).rejects.toThrow('MatrixRTC membership publication failed');
  });

  it('rejects on timeout (30s) when no membership event fires', async () => {
    vi.useFakeTimers();
    try {
      const session = makeSession();
      const mx = makeClient({
        getStateEvent: vi.fn<MatrixClient['getStateEvent']>().mockResolvedValue(undefined as never),
      });
      const opts = callOpts({ session, mx });
      const promise = joinAndProvisionMatrixRTC(opts);
      // Handled by the assertion below; attached now so the rejection that
      // lands during the timer flush is never seen as unhandled.
      promise.catch(() => {});

      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow('MatrixRTC membership publication timed out');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects when the membership wait is cancelled', async () => {
    const session = makeSession();
    let cancelMembership!: (() => void) | undefined;
    const opts = callOpts({
      session,
      onMembershipWait: (cancel: (() => void) | undefined) => {
        cancelMembership = cancel;
      },
    });
    const promise = joinAndProvisionMatrixRTC(opts);
    promise.catch(() => {});

    await vi.waitFor(() => expect(session.on).toHaveBeenCalled());
    expect(cancelMembership).toBeDefined();

    cancelMembership!();
    await expect(promise).rejects.toThrow('MatrixRTC membership wait cancelled');
  });

  it('fills the roster from the server when there is no sliding sync subscription', async () => {
    const session = makeSession();
    const loadMembersIfNeeded = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    // Without the roster the SDK discards the other participants' RTC
    // memberships, which breaks key exchange in both directions.
    const room = makeRoom({ loadMembersIfNeeded });

    const promise = joinAndProvisionMatrixRTC(callOpts({ session, room }));
    await vi.waitFor(() => expect(loadMembersIfNeeded).toHaveBeenCalled());

    session.memberships = [
      { userId: '@alice:example.org', deviceId: 'ALICEDEVICE' },
    ] as CallMembership[];
    session.handlers.get(MatrixRTCSessionEvent.MembershipsChanged)!([], session.memberships);
    await promise;
  });

  it('aborts before joining when roster hydration rejects', async () => {
    const session = makeSession();
    const room = makeRoom({
      loadMembersIfNeeded: () => Promise.reject(new Error('roster request failed')),
    });

    await expect(joinAndProvisionMatrixRTC(callOpts({ session, room }))).rejects.toThrow(
      ROSTER_HYDRATION_ERROR
    );
    expect(session.joinRTCSession).not.toHaveBeenCalled();
  });

  it('aborts before joining when the hydrated roster is short of the joined count', async () => {
    const session = makeSession();
    // `Room.loadMembers` resolves from the out-of-band store without touching
    // the server, so a settled promise can still leave a partial roster.
    const room = makeRoom({ joinedInState: 2, joinedCount: 5 });

    await expect(joinAndProvisionMatrixRTC(callOpts({ session, room }))).rejects.toThrow(
      ROSTER_HYDRATION_ERROR
    );
    expect(session.joinRTCSession).not.toHaveBeenCalled();
  });

  it('refetches from the server when the cached roster is stale, then joins', async () => {
    const session = makeSession();
    let joined = 1;
    const clearLoadedMembersIfNeeded = vi.fn<() => Promise<void>>(() => Promise.resolve());
    // First load is answered by the out-of-band cache and is short; the second,
    // after the cache is cleared, reaches the server and completes the roster.
    const loadMembersIfNeeded = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockImplementation(() => {
        joined = 2;
        return Promise.resolve(true);
      });
    const room = makeRoom({
      loadMembersIfNeeded,
      clearLoadedMembersIfNeeded,
      joinedInState: () => joined,
      joinedCount: 2,
    });

    const promise = joinAndProvisionMatrixRTC(callOpts({ session, room }));
    await vi.waitFor(() => expect(loadMembersIfNeeded).toHaveBeenCalledTimes(2));

    session.memberships = [
      { userId: '@alice:example.org', deviceId: 'ALICEDEVICE' },
    ] as CallMembership[];
    session.handlers.get(MatrixRTCSessionEvent.MembershipsChanged)!([], session.memberships);
    await promise;

    expect(clearLoadedMembersIfNeeded).toHaveBeenCalledOnce();
    expect(session.joinRTCSession).toHaveBeenCalled();
  });

  it('surfaces the failure that clearing the cached roster threw, with its cause', async () => {
    const session = makeSession();
    const cause = new Error('out-of-band store unavailable');
    const room = makeRoom({
      loadMembersIfNeeded: () => Promise.resolve(false),
      clearLoadedMembersIfNeeded: () => Promise.reject(cause),
      joinedInState: 1,
      joinedCount: 2,
    });

    const error = await joinAndProvisionMatrixRTC(callOpts({ session, room })).catch(
      (reason: unknown) => reason
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(ROSTER_HYDRATION_ERROR);
    expect((error as Error).cause).toBe(cause);
    expect(session.joinRTCSession).not.toHaveBeenCalled();
  });

  it('gives up after one refetch when clearing the cache changed nothing', async () => {
    const session = makeSession();
    // `Room.clearLoadedMembersIfNeeded` is a no-op unless lazy loading is on
    // and a members promise exists, so the memoized `loadMembersIfNeeded`
    // answers the retry with the same short roster.
    const loadMembersIfNeeded = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    const clearLoadedMembersIfNeeded = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const room = makeRoom({
      loadMembersIfNeeded,
      clearLoadedMembersIfNeeded,
      joinedInState: 1,
      joinedCount: 2,
    });

    await expect(joinAndProvisionMatrixRTC(callOpts({ session, room }))).rejects.toThrow(
      ROSTER_HYDRATION_ERROR
    );
    expect(clearLoadedMembersIfNeeded).toHaveBeenCalledOnce();
    expect(loadMembersIfNeeded).toHaveBeenCalledTimes(2);
    expect(session.joinRTCSession).not.toHaveBeenCalled();
  });

  it('does not refetch when a server-sourced roster is already short', async () => {
    const session = makeSession();
    const clearLoadedMembersIfNeeded = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const room = makeRoom({ clearLoadedMembersIfNeeded, joinedInState: 2, joinedCount: 5 });

    await expect(joinAndProvisionMatrixRTC(callOpts({ session, room }))).rejects.toThrow(
      ROSTER_HYDRATION_ERROR
    );
    expect(clearLoadedMembersIfNeeded).not.toHaveBeenCalled();
  });

  it('aborts before joining when out-of-band members never finished loading', async () => {
    const session = makeSession();
    const room = makeRoom({ membersLoaded: () => false });

    await expect(joinAndProvisionMatrixRTC(callOpts({ session, room }))).rejects.toThrow(
      ROSTER_HYDRATION_ERROR
    );
    expect(session.joinRTCSession).not.toHaveBeenCalled();
  });

  it('rejects on SDK error path even with fallback available', async () => {
    // MembershipManagerError wins: membership on server does not matter
    const session = makeSession();
    const mx = makeClient({
      getStateEvent: vi.fn<MatrixClient['getStateEvent']>().mockResolvedValue({}),
    });
    const opts = callOpts({ session, mx });
    const promise = joinAndProvisionMatrixRTC(opts);

    await vi.waitFor(() =>
      expect(session.on).toHaveBeenCalledWith(
        MatrixRTCSessionEvent.MembershipManagerError,
        expect.any(Function)
      )
    );

    emitMembershipManagerError(session);

    await expect(promise).rejects.toThrow('MatrixRTC membership publication failed');
    // fallback may have polled, but error settles first
  });

  it('cleans up listeners after resolution', async () => {
    const session = makeSession();
    const opts = callOpts({ session });
    const promise = joinAndProvisionMatrixRTC(opts);

    await vi.waitFor(() =>
      expect(session.on).toHaveBeenCalledWith(
        MatrixRTCSessionEvent.MembershipsChanged,
        expect.any(Function)
      )
    );

    session.memberships = [
      { userId: '@alice:example.org', deviceId: 'ALICEDEVICE' },
    ] as CallMembership[];
    session.handlers.get(MatrixRTCSessionEvent.MembershipsChanged)!([], session.memberships);

    await promise;

    expect(session.removeListener).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.MembershipsChanged,
      expect.any(Function)
    );
    expect(session.removeListener).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.MembershipManagerError,
      expect.any(Function)
    );
  });
});

const firePageHide = (persisted: boolean): void => {
  const event = new Event('pagehide') as PageTransitionEvent;
  Object.defineProperty(event, 'persisted', { value: persisted });
  window.dispatchEvent(event);
};

describe('leaveMatrixRTCOnPageHide', () => {
  it('leaves the session when the page is torn down for good', () => {
    const session = makeSession();
    const remove = leaveMatrixRTCOnPageHide(session);

    firePageHide(false);
    expect(session.leaveRoomSession).toHaveBeenCalledOnce();

    remove();
    firePageHide(false);
    expect(session.leaveRoomSession).toHaveBeenCalledOnce();
  });

  it('stays in the call when the page is only frozen', () => {
    const session = makeSession();
    const remove = leaveMatrixRTCOnPageHide(session);

    firePageHide(true);

    expect(session.leaveRoomSession).not.toHaveBeenCalled();
    remove();
  });
});
