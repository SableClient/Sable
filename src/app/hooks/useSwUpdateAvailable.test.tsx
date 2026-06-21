import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSwUpdateAvailable } from './useSwUpdateAvailable';

describe('useSwUpdateAvailable', () => {
  let serviceWorkerListeners: Map<string, EventListener>;
  let registration: ServiceWorkerRegistration | undefined;
  let controller: ServiceWorker | null;

  beforeEach(() => {
    serviceWorkerListeners = new Map();
    registration = undefined;
    controller = null;

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
});
