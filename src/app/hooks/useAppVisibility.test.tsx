import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { appEvents } from '$utils/appEvents';
import { useAppVisibility } from './useAppVisibility';

const mocks = vi.hoisted(() => ({
  togglePusher: vi.fn<() => Promise<void>>(),
  pushSessionToSW: vi.fn<(baseUrl?: string, accessToken?: string, userId?: string) => void>(),
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

vi.mock('./useClientConfig', () => ({
  useClientConfig: () => ({}),
}));

function setVisibilityState(visibilityState: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState,
  });
}

describe('useAppVisibility', () => {
  beforeEach(() => {
    setVisibilityState('visible');
    mocks.togglePusher.mockClear();
    mocks.pushSessionToSW.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits visibility events through appEvents', () => {
    const visibilityHandler = vi.fn<(visible: boolean) => void>();
    const unsubscribe = appEvents.onVisibilityChange(visibilityHandler);
    const mx = {} as MatrixClient;

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

  it('toggles the pusher when visibility changes', () => {
    const mx = {} as MatrixClient;

    renderHook(() => useAppVisibility(mx));

    act(() => {
      setVisibilityState('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      setVisibilityState('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(mocks.togglePusher).toHaveBeenNthCalledWith(
      1,
      mx,
      {},
      false,
      false,
      expect.any(Array),
      false
    );
    expect(mocks.togglePusher).toHaveBeenNthCalledWith(
      2,
      mx,
      {},
      true,
      false,
      expect.any(Array),
      false
    );
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

    const mx = {} as MatrixClient;
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

    const mx = {} as MatrixClient;

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
    unsubscribe();
  });
});
