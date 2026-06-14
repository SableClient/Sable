import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { SyncState } from '$types/matrix-sdk';
import type { Session } from '$state/sessions';
import { appEvents } from '../utils/appEvents';
import { useAppVisibility } from './useAppVisibility';

const mocks = vi.hoisted(() => ({
  pushSessionToSW: vi.fn<() => void>(),
  togglePusher: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  usePushNotifications: false,
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

vi.mock('../features/settings/notifications/PushNotifications', () => ({
  togglePusher: mocks.togglePusher,
}));

vi.mock('../state/hooks/settings', () => ({
  useSetting: () => [mocks.usePushNotifications],
}));

vi.mock('../state/settings', () => ({
  settingsAtom: {},
}));

vi.mock('../state/pushSubscription', () => ({
  pushSubscriptionAtom: {},
}));

vi.mock('jotai', () => ({
  useAtom: () => [undefined, vi.fn<() => void>()],
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
    mocks.togglePusher.mockClear();
    mocks.togglePusher.mockImplementation(() => Promise.resolve());
    mocks.usePushNotifications = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not abort a healthy sliding sync poll on focus', () => {
    const mx = makeClient(SyncState.Syncing);

    renderHook(() => useAppVisibility(mx, session));

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(mx.retryImmediately).not.toHaveBeenCalled();
  });

  it('does not automatically retry when sync becomes degraded', () => {
    const mx = makeClient(SyncState.Syncing);

    renderHook(() => useAppVisibility(mx, session));

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

    renderHook(() => useAppVisibility(mx, session));

    expect(mx.retryImmediately).not.toHaveBeenCalled();
  });

  it('dedupes pusher visibility toggles while visible state is unchanged', () => {
    mocks.usePushNotifications = true;
    mocks.togglePusher.mockImplementation(() => new Promise(() => undefined));
    const mx = makeClient(SyncState.Syncing);

    renderHook(() => useAppVisibility(mx, session));

    expect(mocks.togglePusher).toHaveBeenCalledOnce();
    expect(mocks.togglePusher).toHaveBeenLastCalledWith(
      mx,
      {},
      true,
      true,
      [undefined, expect.any(Function)],
      false
    );

    act(() => {
      window.dispatchEvent(new Event('focus'));
      vi.advanceTimersByTime(100);
    });

    expect(mocks.togglePusher).toHaveBeenCalledOnce();
  });

  it('keeps the latest pusher visibility when toggles settle out of order', async () => {
    mocks.usePushNotifications = true;
    const resolveToggles: Array<() => void> = [];
    mocks.togglePusher.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveToggles.push(resolve);
        })
    );
    const mx = makeClient(SyncState.Syncing);

    renderHook(() => useAppVisibility(mx, session));

    act(() => {
      setVisibilityState('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    act(() => {
      setVisibilityState('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(mocks.togglePusher).toHaveBeenCalledTimes(3);

    await act(async () => {
      resolveToggles[2]?.();
      await Promise.resolve();
    });

    await act(async () => {
      resolveToggles[1]?.();
      resolveToggles[0]?.();
      await Promise.resolve();
    });

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(mocks.togglePusher).toHaveBeenCalledTimes(3);
  });

  it('does not push the service worker session on focus or online events', () => {
    const mx = makeClient(SyncState.Syncing);

    renderHook(() => useAppVisibility(mx, session));

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

    renderHook(() => useAppVisibility(mx, session));

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

    renderHook(() => useAppVisibility(mx, session));
    visibilityHandler.mockClear();

    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });

    expect(visibilityHandler).toHaveBeenCalledWith(true);
    expect(mx.retryImmediately).not.toHaveBeenCalled();

    unsubscribe();
  });
});
