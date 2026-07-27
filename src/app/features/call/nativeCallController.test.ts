import { describe, expect, it, vi } from 'vitest';
import { MatrixRTCSessionEvent, type CallMembership } from '$types/matrix-sdk';
import type { MatrixClient, MatrixRTCSession, Room } from '$types/matrix-sdk';
import { createNativeCallController } from './nativeCallController';
import type { NativeCallSession } from '$state/nativeCall';
import type { CallLifecycleError, CallState } from '$plugins/call/callLifecycle';

const room = { roomId: '!room:example.org' } as Room;

const makeSession = (slotId = 'm.call#real-slot') =>
  ({
    slotId,
    joinRTCSession:
      vi.fn<
        (identity: unknown, transports: unknown[], multiSfu?: unknown, config?: unknown) => void
      >(),
    leaveRoomSession: vi.fn<MatrixRTCSession['leaveRoomSession']>().mockResolvedValue(true),
    on: vi.fn<(...args: unknown[]) => void>(),
    removeListener: vi.fn<(...args: unknown[]) => void>(),
  }) as unknown as MatrixRTCSession;

const makeClient = (session: MatrixRTCSession) =>
  ({
    getDeviceId: () => 'DEVICE',
    getSafeUserId: () => '@alice:example.org',
    matrixRTC: { getRoomSession: () => session },
  }) as unknown as MatrixClient;

const transport = { type: 'livekit' as const, livekit_service_url: 'https://sfu.example' };
const ownMembership = { userId: '@alice:example.org', deviceId: 'DEVICE' } as CallMembership;

const waitForMembershipListener = async (session: MatrixRTCSession): Promise<void> => {
  await vi.waitFor(() =>
    expect(session.on).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.MembershipsChanged,
      expect.any(Function)
    )
  );
};

const emitOwnMembership = (session: MatrixRTCSession): void => {
  const handler = vi
    .mocked(session.on)
    .mock.calls.find(([event]) => event === MatrixRTCSessionEvent.MembershipsChanged)?.[1] as
    | ((oldMemberships: CallMembership[], memberships: CallMembership[]) => void)
    | undefined;
  handler?.([], [ownMembership]);
};

const emitMembershipManagerError = (session: MatrixRTCSession): void => {
  const handler = vi
    .mocked(session.on)
    .mock.calls.find(([event]) => event === MatrixRTCSessionEvent.MembershipManagerError)?.[1] as
    | ((error: unknown) => void)
    | undefined;
  handler?.(new Error('secret-membership-error'));
};

const waitForMembershipErrorListener = async (session: MatrixRTCSession): Promise<void> => {
  await vi.waitFor(() =>
    expect(session.on).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.MembershipManagerError,
      expect.any(Function)
    )
  );
};

describe('native call controller', () => {
  it('joins with one identity, provisions the session slot, then connects', async () => {
    const session = makeSession();
    const setSession = vi.fn<(session: NativeCallSession | undefined) => void>();
    const order: string[] = [];
    vi.mocked(session.joinRTCSession).mockImplementation(() => order.push('join'));
    const controller = createNativeCallController({
      setSession,
      connectionId: () => 'connection-id',
      onState: async () => vi.fn<() => void>(),
      onError: async () => vi.fn<() => void>(),
      getPreferredTransport: async () => transport,
      provisionToken: async (options) => {
        order.push('provision');
        expect(options.slotId).toBe('m.call#real-slot');
        expect(options.memberId).toBe('@alice:example.org:DEVICE');
        return { url: 'wss://livekit.example', jwt: 'jwt' };
      },
      connect: async () => {
        order.push('connect');
        return { revision: 1, state: 'connected', connectionId: 'connection-id' };
      },
    });

    const startPromise = controller.start({
      mx: makeClient(session),
      room,
      elementCallActive: false,
      dm: false,
      video: false,
      ongoing: false,
    });
    await waitForMembershipListener(session);
    expect(order).toEqual(['join']);
    emitOwnMembership(session);
    await startPromise;

    expect(session.joinRTCSession).toHaveBeenCalledWith(
      {
        userId: '@alice:example.org',
        deviceId: 'DEVICE',
        memberId: '@alice:example.org:DEVICE',
      },
      [transport],
      undefined,
      {
        callIntent: 'audio',
        notificationType: 'notification',
      }
    );
    expect(order).toEqual(['join', 'provision', 'connect']);
    expect(setSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        roomId: room.roomId,
        connectionId: 'connection-id',
        lifecycle: 'connected',
      })
    );
  });

  it('disconnects and leaves when provisioning fails without exposing the failure', async () => {
    const session = makeSession();
    const disconnect = vi.fn<(request: { connectionId: string }) => Promise<CallState>>();
    disconnect.mockResolvedValue({ revision: 1, state: 'idle', connectionId: null });
    const stateUnlisten = vi.fn<() => void>();
    const errorUnlisten = vi.fn<() => void>();
    const setSession = vi.fn<(session: NativeCallSession | undefined) => void>();
    const controller = createNativeCallController({
      setSession,
      connectionId: () => 'connection-id',
      disconnect,
      onState: async (handler: (state: CallState) => void) => {
        void handler;
        return stateUnlisten;
      },
      onError: async (handler: (error: CallLifecycleError) => void) => {
        void handler;
        return errorUnlisten;
      },
      getPreferredTransport: async () => transport,
      provisionToken: async () => {
        throw new Error('openid-secret jwt-secret');
      },
    });

    const startPromise = controller.start({
      mx: makeClient(session),
      room,
      elementCallActive: false,
      dm: false,
      video: false,
      ongoing: false,
    });
    await waitForMembershipListener(session);
    emitOwnMembership(session);
    await startPromise;

    expect(disconnect).toHaveBeenCalledWith({ connectionId: 'connection-id' });
    expect(session.leaveRoomSession).toHaveBeenCalledWith(5000);
    expect(stateUnlisten).toHaveBeenCalled();
    expect(errorUnlisten).toHaveBeenCalled();
    expect(session.removeListener).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.MembershipsChanged,
      expect.any(Function)
    );
    expect(session.removeListener).toHaveBeenCalledWith(
      MatrixRTCSessionEvent.MembershipManagerError,
      expect.any(Function)
    );
    expect(setSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        lifecycle: 'error',
        error: 'Native call setup failed during token provisioning.',
      })
    );
    expect(setSession.mock.calls.flat()).not.toContain('openid-secret');
    expect(setSession.mock.calls.flat()).not.toContain('jwt-secret');
  });

  it('cleans up when the membership manager fails before publication', async () => {
    const session = makeSession();
    const disconnect = vi.fn<(request: { connectionId: string }) => Promise<CallState>>();
    disconnect.mockResolvedValue({ revision: 1, state: 'idle', connectionId: null });
    const stateUnlisten = vi.fn<() => void>();
    const errorUnlisten = vi.fn<() => void>();
    const setSession = vi.fn<(session: NativeCallSession | undefined) => void>();
    const provisionToken = vi.fn<() => Promise<{ url: string; jwt: string }>>(async () => ({
      url: 'wss://livekit.example',
      jwt: 'jwt',
    }));
    const connect = vi.fn<
      () => Promise<{ revision: number; state: 'connected'; connectionId: string }>
    >(async () => ({
      revision: 1,
      state: 'connected' as const,
      connectionId: 'connection-id',
    }));
    const controller = createNativeCallController({
      setSession,
      connectionId: () => 'connection-id',
      disconnect,
      onState: async () => stateUnlisten,
      onError: async () => errorUnlisten,
      getPreferredTransport: async () => transport,
      provisionToken,
      connect,
    });

    const startPromise = controller.start({
      mx: makeClient(session),
      room,
      elementCallActive: false,
      dm: false,
      video: false,
      ongoing: false,
    });
    await waitForMembershipListener(session);
    await waitForMembershipErrorListener(session);
    emitMembershipManagerError(session);
    await startPromise;

    expect(provisionToken).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledWith({ connectionId: 'connection-id' });
    expect(session.leaveRoomSession).toHaveBeenCalledWith(5000);
    expect(stateUnlisten).toHaveBeenCalled();
    expect(errorUnlisten).toHaveBeenCalled();
    expect(setSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        lifecycle: 'error',
        error: 'Native call setup failed during MatrixRTC.',
      })
    );
    expect(setSession.mock.calls.flat()).not.toContain('secret-membership-error');
  });

  it('cleans up when local membership publication times out', async () => {
    vi.useFakeTimers();
    try {
      const session = makeSession();
      const disconnect = vi.fn<(request: { connectionId: string }) => Promise<CallState>>();
      disconnect.mockResolvedValue({ revision: 1, state: 'idle', connectionId: null });
      const setSession = vi.fn<(session: NativeCallSession | undefined) => void>();
      const provisionToken = vi.fn<() => Promise<{ url: string; jwt: string }>>(async () => ({
        url: 'wss://livekit.example',
        jwt: 'jwt',
      }));
      const connect = vi.fn<
        () => Promise<{ revision: number; state: 'connected'; connectionId: string }>
      >(async () => ({
        revision: 1,
        state: 'connected' as const,
        connectionId: 'connection-id',
      }));
      const controller = createNativeCallController({
        setSession,
        connectionId: () => 'connection-id',
        disconnect,
        onState: async () => vi.fn<() => void>(),
        onError: async () => vi.fn<() => void>(),
        getPreferredTransport: async () => transport,
        provisionToken,
        connect,
      });

      const startPromise = controller.start({
        mx: makeClient(session),
        room,
        elementCallActive: false,
        dm: false,
        video: false,
        ongoing: false,
      });
      await waitForMembershipListener(session);
      await vi.advanceTimersByTimeAsync(10_000);
      await startPromise;

      expect(provisionToken).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalledWith({ connectionId: 'connection-id' });
      expect(session.leaveRoomSession).toHaveBeenCalledWith(5000);
      expect(session.removeListener).toHaveBeenCalledWith(
        MatrixRTCSessionEvent.MembershipsChanged,
        expect.any(Function)
      );
      expect(session.removeListener).toHaveBeenCalledWith(
        MatrixRTCSessionEvent.MembershipManagerError,
        expect.any(Function)
      );
      expect(setSession).toHaveBeenLastCalledWith(
        expect.objectContaining({
          lifecycle: 'error',
          error: 'Native call setup failed during MatrixRTC.',
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['device lookup', 'connection id generation', 'session lookup'])(
    'publishes a safe error when %s fails before record creation',
    async (operation) => {
      const session = makeSession();
      const setSession = vi.fn<(session: NativeCallSession | undefined) => void>();
      const mx = makeClient(session);
      if (operation === 'device lookup') {
        vi.spyOn(mx, 'getDeviceId').mockImplementation(() => {
          throw new Error('secret-device');
        });
      }
      if (operation === 'session lookup') {
        vi.spyOn(mx.matrixRTC, 'getRoomSession').mockImplementation(() => {
          throw new Error('secret-session');
        });
      }
      const controller = createNativeCallController({
        setSession,
        connectionId:
          operation === 'connection id generation'
            ? () => {
                throw new Error('secret-connection');
              }
            : () => 'connection-id',
      });

      await controller.start({
        mx,
        room,
        elementCallActive: false,
        dm: false,
        video: false,
        ongoing: false,
      });

      expect(setSession).toHaveBeenLastCalledWith(
        expect.objectContaining({
          lifecycle: 'error',
          error: 'Native call setup failed during MatrixRTC.',
        })
      );
      expect(setSession.mock.calls.flat()).not.toContain('secret-device');
      expect(setSession.mock.calls.flat()).not.toContain('secret-connection');
      expect(setSession.mock.calls.flat()).not.toContain('secret-session');
    }
  );

  it('attempts both sides of cleanup when hangup operations fail', async () => {
    const session = makeSession();
    session.leaveRoomSession = vi
      .fn<MatrixRTCSession['leaveRoomSession']>()
      .mockRejectedValue(new Error('leave failed'));
    const disconnect = vi.fn<(request: { connectionId: string }) => Promise<CallState>>();
    disconnect.mockRejectedValue(new Error('disconnect failed'));
    const setSession = vi.fn<(session: NativeCallSession | undefined) => void>();
    const controller = createNativeCallController({
      setSession,
      connectionId: () => 'connection-id',
      disconnect,
      onState: async () => vi.fn<() => void>(),
      onError: async () => vi.fn<() => void>(),
      getPreferredTransport: async () => transport,
      provisionToken: async () => ({ url: 'wss://livekit.example', jwt: 'jwt' }),
      connect: async () => ({ revision: 1, state: 'connected', connectionId: 'connection-id' }),
    });

    const startPromise = controller.start({
      mx: makeClient(session),
      room,
      elementCallActive: false,
      dm: false,
      video: false,
      ongoing: false,
    });
    await waitForMembershipListener(session);
    emitOwnMembership(session);
    await startPromise;
    await setSession.mock.lastCall?.[0]?.hangup();

    expect(disconnect).toHaveBeenCalledWith({ connectionId: 'connection-id' });
    expect(session.leaveRoomSession).toHaveBeenCalledWith(5000);
    expect(setSession).toHaveBeenLastCalledWith(undefined);
  });

  it('uses a ring notification for a new DM and no notification when joining', async () => {
    const start = async (dm: boolean, ongoing: boolean) => {
      const session = makeSession();
      const setSession = vi.fn<(session: NativeCallSession | undefined) => void>();
      const controller = createNativeCallController({
        setSession,
        connectionId: () => `${dm}-${ongoing}`,
        onState: async () => vi.fn<() => void>(),
        onError: async () => vi.fn<() => void>(),
        getPreferredTransport: async () => transport,
        provisionToken: async () => ({ url: 'wss://livekit.example', jwt: 'jwt' }),
        connect: async () => ({
          revision: 1,
          state: 'connected',
          connectionId: `${dm}-${ongoing}`,
        }),
      });

      const startPromise = controller.start({
        mx: makeClient(session),
        room,
        elementCallActive: false,
        dm,
        video: true,
        ongoing,
      });
      await waitForMembershipListener(session);
      emitOwnMembership(session);
      await startPromise;
      return session;
    };

    const newDmSession = await start(true, false);
    expect(newDmSession.joinRTCSession).toHaveBeenCalledWith(
      expect.any(Object),
      [transport],
      undefined,
      {
        callIntent: 'video',
        notificationType: 'ring',
      }
    );

    const joinedSession = await start(false, true);
    expect(joinedSession.joinRTCSession).toHaveBeenCalledWith(
      expect.any(Object),
      [transport],
      undefined,
      { callIntent: 'video' }
    );
  });

  it('accepts an anonymous idle only after its own connection state was observed', async () => {
    const session = makeSession();
    const setSession = vi.fn<(session: NativeCallSession | undefined) => void>();
    let stateHandler: ((state: CallState) => void) | undefined;
    const disconnect = vi.fn<(request: { connectionId: string }) => Promise<CallState>>();
    disconnect.mockResolvedValue({ revision: 3, state: 'idle', connectionId: null });
    const controller = createNativeCallController({
      setSession,
      connectionId: () => 'connection-id',
      disconnect,
      onState: async (handler: (state: CallState) => void) => {
        stateHandler = handler;
        return vi.fn<() => void>();
      },
      onError: async () => vi.fn<() => void>(),
      getPreferredTransport: async () => transport,
      provisionToken: async () => ({ url: 'wss://livekit.example', jwt: 'jwt' }),
      connect: async () => ({ revision: 2, state: 'connected', connectionId: 'connection-id' }),
    });

    const startPromise = controller.start({
      mx: makeClient(session),
      room,
      elementCallActive: false,
      dm: false,
      video: false,
      ongoing: false,
    });
    await waitForMembershipListener(session);
    emitOwnMembership(session);
    await startPromise;
    stateHandler?.({ revision: 3, state: 'idle', connectionId: null });

    await vi.waitFor(() => expect(session.leaveRoomSession).toHaveBeenCalledWith(5000));
    expect(disconnect).toHaveBeenCalledWith({ connectionId: 'connection-id' });
    expect(setSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ lifecycle: 'error', error: 'Native call ended.' })
    );
  });
});
