import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { ClientEvent, SyncState } from '$types/matrix-sdk';
import type { Session } from '$state/sessions';
import { useAppVisibility } from './useAppVisibility';

const mocks = vi.hoisted(() => ({
  getSlidingSyncManager: vi.fn<() => { retryNow: () => void } | undefined>(),
  retryNow: vi.fn<() => void>(),
  pushSessionToSW: vi.fn<() => void>(),
  togglePusher: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));

vi.mock('@sentry/react', () => ({
  addBreadcrumb: vi.fn<() => void>(),
  metrics: {
    count: vi.fn<() => void>(),
    distribution: vi.fn<() => void>(),
  },
}));

vi.mock('$client/initMatrix', () => ({
  getSlidingSyncManager: mocks.getSlidingSyncManager,
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
  useSetting: () => [false],
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
  const syncListeners = new Set<(state: SyncState) => void>();
  const retryImmediately = vi.fn<() => boolean>(() => true);

  return {
    getSyncState: () => currentSyncState,
    retryImmediately,
    on: vi.fn<(event: ClientEvent, listener: (state: SyncState) => void) => void>(
      (event, listener) => {
        if (event === ClientEvent.Sync) syncListeners.add(listener);
      }
    ),
    removeListener: vi.fn<(event: ClientEvent, listener: (state: SyncState) => void) => void>(
      (event, listener) => {
        if (event === ClientEvent.Sync) syncListeners.delete(listener);
      }
    ),
    emitSyncState: (state: SyncState) => {
      currentSyncState = state;
      syncListeners.forEach((listener) => listener(state));
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
    mocks.getSlidingSyncManager.mockReturnValue({ retryNow: mocks.retryNow });
    mocks.retryNow.mockClear();
    mocks.pushSessionToSW.mockClear();
    mocks.togglePusher.mockClear();
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
    expect(mocks.retryNow).not.toHaveBeenCalled();
  });

  it('retries once when sync becomes degraded without starting a retry loop', () => {
    const mx = makeClient(SyncState.Syncing);

    renderHook(() => useAppVisibility(mx, session));

    act(() => {
      mx.emitSyncState(SyncState.Reconnecting);
    });

    expect(mx.retryImmediately).toHaveBeenCalledOnce();
    expect(mocks.retryNow).toHaveBeenCalledOnce();

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(mx.retryImmediately).toHaveBeenCalledOnce();
    expect(mocks.retryNow).toHaveBeenCalledOnce();
  });
});
