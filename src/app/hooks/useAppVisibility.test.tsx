import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { SyncState } from '$types/matrix-sdk';
import type { Session } from '$state/sessions';
import { appEvents } from '../utils/appEvents';
import { useAppVisibility } from './useAppVisibility';

const mocks = vi.hoisted(() => ({
  pushSessionToSW: vi.fn<() => void>(),
  swPostMessage: vi.fn<() => void>(),
}));

vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn<() => void>(),
  metrics: {
    count: vi.fn<() => void>(),
    distribution: vi.fn<() => void>(),
  },
}));

vi.mock('$utils/user-agent', () => ({
  mobileOrTablet: () => false,
}));

vi.mock('../../sw-session', () => ({
  pushSessionToSW: mocks.pushSessionToSW,
}));

vi.mock('./useClientConfig', () => ({
  useClientConfig: () => ({}),
  useExperimentVariant: () => ({
    inExperiment: false,
    variant: undefined,
  }),
}));

const session: Session = {
  baseUrl: 'https://matrix.example.com',
  accessToken: 'access-token',
  userId: '@alice:example.com',
  deviceId: 'DEVICE',
};

function setVisibilityState(visibilityState: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState,
  });
}

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: online,
  });
}

function makeClient(syncState: SyncState): MatrixClient & {
  emitSyncState: (state: SyncState) => void;
  retryImmediately: ReturnType<typeof vi.fn<() => boolean>>;
} {
  let currentSyncState = syncState;
  const retryImmediately = vi.fn<() => boolean>(() => true);

  return {
    getSyncState: () => currentSyncState,
    retryImmediately,
    emitSyncState: (state: SyncState) => {
      currentSyncState = state;
    },
  } as unknown as MatrixClient & {
    emitSyncState: (state: SyncState) => void;
    retryImmediately: ReturnType<typeof vi.fn<() => boolean>>;
  };
}

describe('useAppVisibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibilityState('visible');
    setOnline(true);
    mocks.pushSessionToSW.mockClear();
    mocks.swPostMessage.mockClear();

    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: null,
        ready: Promise.resolve({
          active: {
            state: 'activated',
            postMessage: mocks.swPostMessage,
          },
        }),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not abort a healthy sliding sync poll on focus', () => {
    const mx = makeClient(SyncState.Syncing);

    renderHook(() => useAppVisibility(session));

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(mx.retryImmediately).not.toHaveBeenCalled();
  });

  it('does not automatically retry when sync becomes degraded', () => {
    const mx = makeClient(SyncState.Syncing);

    renderHook(() => useAppVisibility(session));

    act(() => {
      mx.emitSyncState(SyncState.Reconnecting);
    });

    expect(mx.retryImmediately).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(mx.retryImmediately).not.toHaveBeenCalled();
  });

  it('does not retry immediately on mount when sync is still connecting', () => {
    const mx = makeClient(SyncState.Reconnecting);

    renderHook(() => useAppVisibility(session));

    expect(mx.retryImmediately).not.toHaveBeenCalled();
  });

  it('does not push the service worker session on focus or online events', () => {
    renderHook(() => useAppVisibility(session));

    act(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
    });

    expect(mocks.pushSessionToSW).not.toHaveBeenCalled();
  });

  it('emits an initial visible event for timeline refresh without retrying sync', () => {
    const mx = makeClient(SyncState.Syncing);
    const visibilityHandler = vi.fn<(visible: boolean) => void>();
    const unsubscribe = appEvents.onVisibilityChange(visibilityHandler);

    renderHook(() => useAppVisibility(session));

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(visibilityHandler).toHaveBeenCalledWith(true);
    expect(mx.retryImmediately).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('emits visible on bfcache restore without retrying sync', () => {
    const mx = makeClient(SyncState.Syncing);
    const visibilityHandler = vi.fn<(visible: boolean) => void>();
    const unsubscribe = appEvents.onVisibilityChange(visibilityHandler);

    renderHook(() => useAppVisibility(session));
    visibilityHandler.mockClear();

    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });

    expect(visibilityHandler).toHaveBeenCalledWith(true);
    expect(mx.retryImmediately).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('requests a service worker claim when the app becomes visible without a controller', async () => {
    renderHook(() => useAppVisibility(session));

    act(() => {
      setVisibilityState('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      setVisibilityState('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.swPostMessage).toHaveBeenCalledWith({ type: 'CLAIM_CLIENTS' });
  });

  it('requests a service worker claim on bfcache restore without a controller', async () => {
    renderHook(() => useAppVisibility(session));

    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.swPostMessage).toHaveBeenCalledWith({ type: 'CLAIM_CLIENTS' });
  });
});
