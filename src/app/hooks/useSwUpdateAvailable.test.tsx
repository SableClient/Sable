import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSwUpdateAvailable } from './useSwUpdateAvailable';

const appUpdatesMocks = vi.hoisted(() => ({
  checkForAppUpdates: vi.fn<() => Promise<unknown>>(),
  hasPendingAppUpdate: vi.fn<(registration: ServiceWorkerRegistration | undefined) => boolean>(),
}));

vi.mock('$utils/appUpdates', () => appUpdatesMocks);

describe('useSwUpdateAvailable', () => {
  let serviceWorkerListeners: Map<string, EventListener>;
  let registration: ServiceWorkerRegistration | undefined;
  let controller: ServiceWorker | null;
  let visibilityState: DocumentVisibilityState;

  const setVisibility = (state: DocumentVisibilityState) => {
    visibilityState = state;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });
  };

  beforeEach(() => {
    serviceWorkerListeners = new Map();
    registration = undefined;
    controller = null;
    setVisibility('visible');

    appUpdatesMocks.checkForAppUpdates.mockReset();
    appUpdatesMocks.checkForAppUpdates.mockResolvedValue({
      kind: 'up-to-date',
      message: 'You are already on the latest available web app version.',
      canApply: false,
    });
    appUpdatesMocks.hasPendingAppUpdate.mockReset();
    appUpdatesMocks.hasPendingAppUpdate.mockImplementation(
      (currentRegistration: ServiceWorkerRegistration | undefined) =>
        Boolean(
          currentRegistration &&
          controller &&
          (currentRegistration.waiting ||
            (currentRegistration.active &&
              currentRegistration.active !== navigator.serviceWorker.controller))
        )
    );

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          getRegistration: vi
            .fn<() => Promise<ServiceWorkerRegistration | undefined>>()
            .mockImplementation(async () => registration),
          addEventListener: vi.fn<(event: string, listener: EventListener) => void>(
            (event, listener) => {
              serviceWorkerListeners.set(event, listener);
            }
          ),
          removeEventListener: vi.fn<(event: string) => void>((event) => {
            serviceWorkerListeners.delete(event);
          }),
          get controller() {
            return controller;
          },
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts as available when a waiting worker already exists', async () => {
    controller = { postMessage: vi.fn<() => void>() } as unknown as ServiceWorker;
    registration = {
      waiting: { postMessage: vi.fn<() => void>() },
      active: controller,
    } as unknown as ServiceWorkerRegistration;

    const { result } = renderHook(() => useSwUpdateAvailable());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('clears the update flag after controllerchange when no pending update remains', async () => {
    const currentController = { postMessage: vi.fn<() => void>() } as unknown as ServiceWorker;
    const nextController = { postMessage: vi.fn<() => void>() } as unknown as ServiceWorker;
    controller = currentController;
    registration = {
      waiting: { postMessage: vi.fn<() => void>() },
      active: nextController,
    } as unknown as ServiceWorkerRegistration;

    const { result } = renderHook(() => useSwUpdateAvailable());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });

    controller = nextController;
    registration = {
      waiting: null,
      active: nextController,
    } as unknown as ServiceWorkerRegistration;

    act(() => {
      serviceWorkerListeners.get('controllerchange')?.(new Event('controllerchange'));
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it('checks for updates automatically on mount and on the polling interval', async () => {
    vi.useFakeTimers();

    renderHook(() => useSwUpdateAvailable());

    await act(async () => {
      await Promise.resolve();
    });
    expect(appUpdatesMocks.checkForAppUpdates).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(appUpdatesMocks.checkForAppUpdates).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('skips hidden checks and retries once the app becomes visible again', async () => {
    setVisibility('hidden');

    renderHook(() => useSwUpdateAvailable());

    expect(appUpdatesMocks.checkForAppUpdates).not.toHaveBeenCalled();

    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(appUpdatesMocks.checkForAppUpdates).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the banner visible when the update check finds a secondary registration update', async () => {
    appUpdatesMocks.checkForAppUpdates.mockResolvedValue({
      kind: 'update-available',
      message: 'An update is ready to apply.',
      canApply: true,
    });

    const { result } = renderHook(() => useSwUpdateAvailable());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('re-syncs local update state when the update probe fails', async () => {
    controller = { postMessage: vi.fn<() => void>() } as unknown as ServiceWorker;
    registration = {
      waiting: { postMessage: vi.fn<() => void>() },
      active: controller,
    } as unknown as ServiceWorkerRegistration;
    appUpdatesMocks.checkForAppUpdates.mockRejectedValue(new Error('network failed'));

    const { result } = renderHook(() => useSwUpdateAvailable());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });
});
