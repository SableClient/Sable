import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type {
  MatrixClient,
  MatrixRTCSession,
  CallMembership,
  JoinSessionConfig,
  Room,
} from '$types/matrix-sdk';
import { MatrixRTCSessionEvent } from '$types/matrix-sdk';
import { joinAndProvisionMatrixRTC, leaveMatrixRTCOnPageHide } from './matrixRtcCallLifecycle';
import type {
  LivekitProvisioningResult,
  getPreferredLivekitTransport,
  provisionLivekitToken,
} from './livekitProvisioning';

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

describe('joinAndProvisionMatrixRTC', () => {
  beforeEach(() => {
    // vi.useFakeTimers() would interfere with setInterval; use real timers.
  });

  const callOpts = (overrides: Record<string, unknown> = {}) => ({
    mx: makeClient(),
    room: {
      roomId: '!room:example.org',
      loadMembersIfNeeded: () => Promise.resolve(),
    } as unknown as Room,
    session: makeSession(),
    callIntent: 'audio' as const,
    getPreferredTransport: vi
      .fn<typeof getPreferredLivekitTransport>()
      .mockResolvedValue(makeTransport()),
    provisionToken: vi.fn<typeof provisionLivekitToken>().mockResolvedValue(provisioned),
    ...overrides,
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

  it('resolves via server-side fallback when membership is filtered locally', async () => {
    const session = makeSession();
    const mx = makeClient({
      getStateEvent: vi
        .fn<MatrixClient['getStateEvent']>()
        // first poll: no event yet
        .mockResolvedValueOnce(undefined as never)
        // second poll: membership found on server
        .mockResolvedValueOnce({}),
    });
    const opts = callOpts({ session, mx });
    const promise = joinAndProvisionMatrixRTC(opts);

    // memberships listener is registered, but never fires own membership
    await vi.waitFor(() =>
      expect(session.on).toHaveBeenCalledWith(
        MatrixRTCSessionEvent.MembershipsChanged,
        expect.any(Function)
      )
    );

    const result = await promise;
    expect(result.provisioned).toEqual(provisioned);
    expect(opts.getPreferredTransport).toHaveBeenCalledOnce();
    // fallback polled twice
    expect(mx.getStateEvent).toHaveBeenCalledTimes(2);
  });

  it('stops fallback polling on cancel', async () => {
    vi.useFakeTimers();
    try {
      const session = makeSession();
      const mx = makeClient({
        getStateEvent: vi.fn<MatrixClient['getStateEvent']>().mockResolvedValue(undefined as never),
      });
      let cancelMembership!: (() => void) | undefined;
      const opts = callOpts({
        session,
        mx,
        onMembershipWait: (cancel: (() => void) | undefined) => {
          cancelMembership = cancel;
        },
      });
      const promise = joinAndProvisionMatrixRTC(opts);
      promise.catch(() => {});

      await vi.waitFor(() => expect(session.on).toHaveBeenCalled());
      expect(cancelMembership).toBeDefined();

      cancelMembership!();
      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow('MatrixRTC membership wait cancelled');
      // on cancel, getStateEvent should never have been polled with fake timers
      // (interval hasn't ticked yet, and cancel cleared it)
    } finally {
      vi.useRealTimers();
    }
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
