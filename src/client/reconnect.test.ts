import { beforeEach, describe, expect, it, vi } from 'vitest';

const { slidingSyncResend, getSlidingSyncManager } = vi.hoisted(() => {
  const resend = vi.fn<() => void>();
  const manager = vi.fn<(mx: unknown) => { slidingSync: { resend: typeof resend } } | undefined>();
  return { slidingSyncResend: resend, getSlidingSyncManager: manager };
});

vi.mock('./initMatrix', () => ({
  getSlidingSyncManager,
}));

vi.mock('$utils/debugLogger', () => ({
  createDebugLogger: () => ({
    info: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
  }),
}));

import { abortClassicSyncPoll, nudgeReconnect } from './reconnect';

function stubMx(
  overrides: Partial<{ clientRunning: boolean; retryImmediately: ReturnType<typeof vi.fn> }> = {}
) {
  return {
    clientRunning: overrides.clientRunning ?? true,
    retryImmediately: overrides.retryImmediately ?? vi.fn<() => boolean>().mockReturnValue(true),
  };
}

describe('nudgeReconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    slidingSyncResend.mockReset();
    getSlidingSyncManager.mockReset();
  });

  it('calls slidingSync.resend() when a sliding-sync manager exists', () => {
    getSlidingSyncManager.mockReturnValue({ slidingSync: { resend: slidingSyncResend } } as never);
    const mx = stubMx();

    const result = nudgeReconnect(mx as never, 'online');

    expect(result).toBe(true);
    expect(slidingSyncResend).toHaveBeenCalledOnce();
    expect(mx.retryImmediately).not.toHaveBeenCalled();
  });

  it('calls retryImmediately() on classic transport (no sliding-sync manager)', () => {
    getSlidingSyncManager.mockReturnValue(undefined);
    const mx = stubMx();

    const result = nudgeReconnect(mx as never, 'stalled');

    expect(result).toBe(true);
    expect(mx.retryImmediately).toHaveBeenCalledOnce();
    expect(slidingSyncResend).not.toHaveBeenCalled();
  });

  it('reports false when classic retryImmediately() could not bite', () => {
    getSlidingSyncManager.mockReturnValue(undefined);
    const mx = stubMx({ retryImmediately: vi.fn<() => boolean>().mockReturnValue(false) });

    expect(nudgeReconnect(mx as never, 'resumed')).toBe(false);
    expect(mx.retryImmediately).toHaveBeenCalledOnce();
  });

  it('returns false and does nothing when client is not running', () => {
    getSlidingSyncManager.mockReturnValue({ slidingSync: { resend: slidingSyncResend } } as never);
    const mx = stubMx({ clientRunning: false });

    const result = nudgeReconnect(mx as never, 'visible');

    expect(result).toBe(false);
    expect(slidingSyncResend).not.toHaveBeenCalled();
    expect(mx.retryImmediately).not.toHaveBeenCalled();
  });

  it('throttles back-to-back calls within 3s', () => {
    getSlidingSyncManager.mockReturnValue({ slidingSync: { resend: slidingSyncResend } } as never);
    const mx = stubMx();

    const first = nudgeReconnect(mx as never, 'online');
    const second = nudgeReconnect(mx as never, 'visible');

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(slidingSyncResend).toHaveBeenCalledOnce();
  });

  it('allows a nudge after throttle window expires', () => {
    getSlidingSyncManager.mockReturnValue({ slidingSync: { resend: slidingSyncResend } } as never);
    const mx = stubMx();

    nudgeReconnect(mx as never, 'online');
    vi.setSystemTime(3001);

    const result = nudgeReconnect(mx as never, 'visible');

    expect(result).toBe(true);
    expect(slidingSyncResend).toHaveBeenCalledTimes(2);
  });

  it('throttles per-client (two distinct clients each get their nudge)', () => {
    getSlidingSyncManager.mockReturnValue({ slidingSync: { resend: slidingSyncResend } } as never);

    const mx1 = stubMx({ retryImmediately: vi.fn<() => boolean>() });
    const mx2 = stubMx({ retryImmediately: vi.fn<() => boolean>() });

    const r1 = nudgeReconnect(mx1 as never, 'online');
    const r2 = nudgeReconnect(mx2 as never, 'stalled');

    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(slidingSyncResend).toHaveBeenCalledTimes(2);
  });
});

describe('abortClassicSyncPoll', () => {
  it('aborts the in-flight poll and swaps in a usable controller', () => {
    const first = new AbortController();
    const mx = { syncApi: { abortController: first } };

    expect(abortClassicSyncPoll(mx as never)).toBe(true);
    expect(first.signal.aborted).toBe(true);
    expect(mx.syncApi.abortController).not.toBe(first);
    expect(mx.syncApi.abortController.signal.aborted).toBe(false);
  });

  it('reports false when the transport holds no abort controller', () => {
    expect(abortClassicSyncPoll({ syncApi: {} } as never)).toBe(false);
    expect(abortClassicSyncPoll({} as never)).toBe(false);
  });
});
