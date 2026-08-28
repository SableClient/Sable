import { describe, expect, it, vi } from 'vitest';
import { VerificationMethod, VerificationPhase } from '$types/matrix-sdk';
import { EngineVerificationRequest } from './request';
import { EnginePhase, type EngineVerificationState } from './state';

const state = (patch: Partial<EngineVerificationState> = {}): EngineVerificationState => ({
  ownUserId: '@me:example.org',
  otherUserId: '@them:example.org',
  otherDeviceId: 'THEIRS',
  flowId: '$flow',
  roomId: null,
  phase: EnginePhase.Requested,
  weStarted: false,
  isSelfVerification: false,
  isPassive: false,
  isReady: false,
  isDone: false,
  isCancelled: false,
  timedOut: false,
  timeRemainingMillis: 600000,
  theirSupportedMethods: [0],
  ourSupportedMethods: [0],
  cancelInfo: null,
  verification: null,
  ...patch,
});

describe('EngineVerificationRequest', () => {
  it('accepts through the engine with our supported methods and refreshes', async () => {
    const call = vi.fn<(m: string, a?: Record<string, unknown>) => Promise<unknown>>(
      async (method) =>
        method === 'verificationRequest.state' ? state({ phase: EnginePhase.Ready }) : null
    );
    const request = new EngineVerificationRequest(call, state());

    await request.accept();

    expect(call).toHaveBeenCalledWith('verificationRequest.accept', {
      userId: '@them:example.org',
      flowId: '$flow',
      methods: [0],
    });
    expect(request.phase).toBe(VerificationPhase.Ready);
  });

  // js-sdk throws rather than silently doing nothing, and callers rely on that.
  it('refuses to accept outside the Requested phase', async () => {
    const call = vi.fn<() => Promise<unknown>>(async () => null);
    const request = new EngineVerificationRequest(call, state({ phase: EnginePhase.Ready }));

    await expect(request.accept()).rejects.toThrow('Cannot accept a verification request');
    expect(call).not.toHaveBeenCalled();
  });

  it('refuses to start a method other than SAS', async () => {
    const call = vi.fn<() => Promise<unknown>>(async () => null);
    const request = new EngineVerificationRequest(call, state());

    await expect(request.startVerification(VerificationMethod.ShowQrCode)).rejects.toThrow(
      'Unsupported verification method'
    );
    expect(call).not.toHaveBeenCalled();
  });

  // js-sdk builds its verifier only on change, so one first seen here has none.
  it('builds a verifier for a request that is already transitioned', () => {
    const call = vi.fn<() => Promise<unknown>>(async () => null);
    const request = new EngineVerificationRequest(
      call,
      state({ phase: EnginePhase.Transitioned, verification: { className: 'Sas' } })
    );

    expect(request.verifier).toBeDefined();
    expect(request.phase).toBe(VerificationPhase.Started);
  });

  it('reports the flow identity the app displays', () => {
    const call = vi.fn<() => Promise<unknown>>(async () => null);
    const request = new EngineVerificationRequest(
      call,
      state({ roomId: '!r:e.org', weStarted: true })
    );

    expect(request.transactionId).toBe('$flow');
    expect(request.roomId).toBe('!r:e.org');
    expect(request.initiatedByMe).toBe(true);
    expect(request.otherUserId).toBe('@them:example.org');
    expect(request.otherDeviceId).toBe('THEIRS');
    expect(request.pending).toBe(true);
    expect(request.otherPartySupportsMethod(VerificationMethod.Sas)).toBe(true);
  });
});
