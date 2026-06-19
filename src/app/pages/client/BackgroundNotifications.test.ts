import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientEvent, SyncState } from '$types/matrix-sdk';
import {
  BACKGROUND_CLIENT_SYNC_READY_TIMEOUT_MS,
  classifyBackgroundClientFailure,
  startBackgroundClient,
  waitForSync,
} from './BackgroundNotifications';

const { initClientMock, startClientMock } = vi.hoisted(() => ({
  initClientMock: vi.fn<(session: unknown) => Promise<unknown>>(),
  startClientMock: vi.fn<(mx: unknown, config?: unknown) => Promise<void>>(),
}));

vi.mock('$client/initMatrix', () => ({
  initClient: initClientMock,
  startClient: startClientMock,
  stopClient: vi.fn<() => Promise<void>>(),
}));

type SyncListener = (state: SyncState) => void;

function createMockMatrixClient(initialState: SyncState | string | null = null) {
  let syncListener: SyncListener | undefined;

  return {
    getSyncState: vi.fn<() => SyncState | string | null>(() => initialState),
    on: vi.fn<(event: string, listener: SyncListener) => void>((event, listener) => {
      if (event === ClientEvent.Sync) syncListener = listener;
    }),
    removeListener: vi.fn<(event: string, listener: SyncListener) => void>((event, listener) => {
      if (event === ClientEvent.Sync && syncListener === listener) syncListener = undefined;
    }),
    emitSync(state: SyncState) {
      syncListener?.(state);
    },
  };
}

describe('BackgroundNotifications helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    initClientMock.mockReset();
    startClientMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('classifies sync timeout failures distinctly from generic startup failures', () => {
    expect(classifyBackgroundClientFailure(new Error('background client sync timed out'))).toBe(
      'sync_timeout'
    );
    expect(classifyBackgroundClientFailure(new Error('other startup failure'))).toBe(
      'start_failed'
    );
    expect(classifyBackgroundClientFailure('plain string')).toBe('start_failed');
  });

  it('resolves immediately when the client is already ready', async () => {
    const mx = createMockMatrixClient(SyncState.Prepared);

    await expect(waitForSync(mx as never)).resolves.toBeUndefined();
    expect(mx.on).not.toHaveBeenCalled();
  });

  it('resolves when the sync listener reaches a ready state', async () => {
    const mx = createMockMatrixClient(SyncState.Stopped);
    const waitPromise = waitForSync(mx as never);

    mx.emitSync(SyncState.Syncing);

    await expect(waitPromise).resolves.toBeUndefined();
    expect(mx.removeListener).toHaveBeenCalledWith(ClientEvent.Sync, expect.any(Function));
  });

  it('rejects with a timeout after the configured sync-ready window', async () => {
    const mx = createMockMatrixClient(SyncState.Stopped);
    const waitPromise = waitForSync(mx as never).then(
      () => ({ ok: true as const }),
      (error: unknown) => error
    );

    await vi.advanceTimersByTimeAsync(BACKGROUND_CLIENT_SYNC_READY_TIMEOUT_MS);

    await expect(waitPromise).resolves.toEqual(expect.any(Error));
    await expect(waitPromise).resolves.toMatchObject({
      message: 'background client sync timed out',
    });
    expect(mx.removeListener).toHaveBeenCalledWith(ClientEvent.Sync, expect.any(Function));
  });

  it('starts background sessions from the shared session stores', async () => {
    const session = {
      baseUrl: 'https://matrix.example',
      userId: '@alice:example.org',
      deviceId: 'DEVICE',
      accessToken: 'token',
      slidingSyncOptIn: true,
    };
    const backgroundMx = { getUserId: () => session.userId };
    const slidingSync = { enabled: true, proxyBaseUrl: 'https://proxy.example' };

    initClientMock.mockResolvedValue(backgroundMx);
    startClientMock.mockResolvedValue(undefined);

    await expect(startBackgroundClient(session, slidingSync as never)).resolves.toBe(backgroundMx);

    expect(initClientMock).toHaveBeenCalledWith(session);
    expect(startClientMock).toHaveBeenCalledWith(
      backgroundMx,
      expect.objectContaining({
        baseUrl: session.baseUrl,
        slidingSync,
        sessionSlidingSyncOptIn: true,
        clientScope: 'background',
      })
    );
  });
});
