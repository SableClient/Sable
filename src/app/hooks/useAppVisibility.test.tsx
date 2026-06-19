import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { appEvents } from '$utils/appEvents';
import { useAppVisibility } from './useAppVisibility';

const mocks = vi.hoisted(() => ({
  togglePusher: vi.fn<() => Promise<void>>(),
  pushSessionToSW: vi.fn<(baseUrl?: string, accessToken?: string, userId?: string) => void>(),
  getSlidingSyncManager: vi.fn<() => { retryNow: () => void } | undefined>(),
}));

vi.mock('$utils/user-agent', () => ({
  mobileOrTablet: () => false,
}));

vi.mock('../features/settings/notifications/PushNotifications', () => ({
  togglePusher: mocks.togglePusher,
}));

vi.mock('../../sw-session', () => ({
  pushSessionToSW: mocks.pushSessionToSW,
}));

vi.mock('$client/initMatrix', () => ({
  getSlidingSyncManager: mocks.getSlidingSyncManager,
}));

vi.mock('./useClientConfig', () => ({
  useClientConfig: () => ({}),
}));

vi.mock('./useNotificationDeviceScope', () => ({
  shouldEnableNotificationPusher: (
    isVisible: boolean,
    isMobile: boolean,
    notificationDeviceScope: string,
    isActiveNotificationClient: boolean
  ) =>
    isVisible
      ? isMobile || isActiveNotificationClient
      : notificationDeviceScope !== 'active_client_only' || isActiveNotificationClient,
  useNotificationDeviceScope: () => ({
    lease: null,
    notificationDeviceScope: 'all_clients',
    isActiveNotificationClient: true,
    isThisClientLeaseHolder: false,
    shouldKeepWebPushEnabled: false,
  }),
}));

function setVisibilityState(visibilityState: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState,
  });
}

function createMockMatrixClient(): MatrixClient {
  return {
    retryImmediately: vi.fn<() => boolean>(() => true),
    getSyncState: vi.fn<() => string>(() => 'PREPARED'),
  } as unknown as MatrixClient;
}

describe('useAppVisibility', () => {
  beforeEach(() => {
    setVisibilityState('visible');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:00:00.000Z'));
    mocks.togglePusher.mockClear();
    mocks.pushSessionToSW.mockClear();
    mocks.getSlidingSyncManager.mockReset();
    mocks.getSlidingSyncManager.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('emits visibility events through appEvents', () => {
    const visibilityHandler = vi.fn<(visible: boolean) => void>();
    const unsubscribe = appEvents.onVisibilityChange(visibilityHandler);
    const mx = createMockMatrixClient();

    renderHook(() => useAppVisibility(mx));

    act(() => {
      setVisibilityState('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      setVisibilityState('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(visibilityHandler).toHaveBeenNthCalledWith(1, false);
    expect(visibilityHandler).toHaveBeenNthCalledWith(2, true);

    unsubscribe();
  });

  it('keeps foreground desktop all-clients pusher logic aligned with startup reconciliation', () => {
    const mx = createMockMatrixClient();

    renderHook(() => useAppVisibility(mx));

    act(() => {
      setVisibilityState('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      setVisibilityState('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(mocks.togglePusher).toHaveBeenCalledTimes(1);
    expect(mocks.togglePusher).toHaveBeenNthCalledWith(1, mx, {}, true, false, expect.any(Array));
  });

  it('requests a lazy service worker claim and refreshes the session on visible resume', async () => {
    const postMessage = vi.fn<(message: unknown) => void>();
    const activeWorker = {
      state: 'activated',
      postMessage,
    } as unknown as ServiceWorker;
    const ready = Promise.resolve({
      active: activeWorker,
    } satisfies Partial<ServiceWorkerRegistration>);

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: undefined,
        ready,
      },
    });

    const mx = createMockMatrixClient();
    const activeSession = {
      baseUrl: 'https://example.com',
      accessToken: 'token',
      userId: '@user:example.com',
    };

    renderHook(() => useAppVisibility(mx, activeSession as never));

    await act(async () => {
      setVisibilityState('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      setVisibilityState('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await ready;
    });

    expect(postMessage).toHaveBeenCalledWith({ type: 'CLAIM_CLIENTS' });
    expect(mocks.pushSessionToSW).toHaveBeenCalledWith(
      activeSession.baseUrl,
      activeSession.accessToken,
      activeSession.userId
    );
    expect(mx.retryImmediately).toHaveBeenCalledTimes(1);
    expect(mocks.getSlidingSyncManager).toHaveBeenCalledWith(mx);
  });

  it('requests a lazy service worker claim on persisted pageshow restore', async () => {
    const postMessage = vi.fn<(message: unknown) => void>();
    const activeWorker = {
      state: 'activated',
      postMessage,
    } as unknown as ServiceWorker;
    const ready = Promise.resolve({
      active: activeWorker,
    } satisfies Partial<ServiceWorkerRegistration>);

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: undefined,
        ready,
      },
    });

    const visibilityHandler = vi.fn<(visible: boolean) => void>();
    const unsubscribe = appEvents.onVisibilityChange(visibilityHandler);

    const retryNow = vi.fn<() => void>();
    const mx = createMockMatrixClient();
    mocks.getSlidingSyncManager.mockReturnValue({ retryNow });

    renderHook(() =>
      useAppVisibility(mx, {
        baseUrl: 'https://example.com',
        accessToken: 'token',
        userId: '@user:example.com',
      } as never)
    );

    await act(async () => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      await ready;
    });

    expect(postMessage).toHaveBeenCalledWith({ type: 'CLAIM_CLIENTS' });
    expect(visibilityHandler).toHaveBeenCalledWith(true);
    expect(mx.retryImmediately).toHaveBeenCalledTimes(1);
    expect(retryNow).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('requests recovery when the window regains focus while visible', async () => {
    const postMessage = vi.fn<(message: unknown) => void>();
    const activeWorker = {
      state: 'activated',
      postMessage,
    } as unknown as ServiceWorker;
    const ready = Promise.resolve({
      active: activeWorker,
    } satisfies Partial<ServiceWorkerRegistration>);

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: undefined,
        ready,
      },
    });

    const retryNow = vi.fn<() => void>();
    const mx = createMockMatrixClient();
    mocks.getSlidingSyncManager.mockReturnValue({ retryNow });

    renderHook(() =>
      useAppVisibility(mx, {
        baseUrl: 'https://example.com',
        accessToken: 'token',
        userId: '@user:example.com',
      } as never)
    );

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await ready;
    });

    expect(postMessage).toHaveBeenCalledWith({ type: 'CLAIM_CLIENTS' });
    expect(mx.retryImmediately).toHaveBeenCalledTimes(1);
    expect(retryNow).toHaveBeenCalledTimes(1);
  });

  it('emits visible reconciliation on focus-only resume', async () => {
    const visibilityHandler = vi.fn<(visible: boolean) => void>();
    const unsubscribe = appEvents.onVisibilityChange(visibilityHandler);
    const mx = createMockMatrixClient();

    renderHook(() => useAppVisibility(mx));

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(visibilityHandler).toHaveBeenCalledWith(true);
    unsubscribe();
  });

  it('requests recovery on first interaction after a long idle period', async () => {
    const postMessage = vi.fn<(message: unknown) => void>();
    const activeWorker = {
      state: 'activated',
      postMessage,
    } as unknown as ServiceWorker;
    const ready = Promise.resolve({
      active: activeWorker,
    } satisfies Partial<ServiceWorkerRegistration>);

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: undefined,
        ready,
      },
    });

    const retryNow = vi.fn<() => void>();
    const mx = createMockMatrixClient();
    mocks.getSlidingSyncManager.mockReturnValue({ retryNow });

    renderHook(() =>
      useAppVisibility(mx, {
        baseUrl: 'https://example.com',
        accessToken: 'token',
        userId: '@user:example.com',
      } as never)
    );

    await act(async () => {
      vi.advanceTimersByTime(10 * 60_000 + 1);
      document.dispatchEvent(new Event('pointerdown'));
      await ready;
    });

    expect(postMessage).toHaveBeenCalledWith({ type: 'CLAIM_CLIENTS' });
    expect(mx.retryImmediately).toHaveBeenCalledTimes(1);
    expect(retryNow).toHaveBeenCalledTimes(1);
  });
});
