import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSwUpdateAvailable } from './useSwUpdateAvailable';

const appUpdatesMocks = vi.hoisted(() => ({
  checkForAppUpdates: vi.fn<() => Promise<unknown>>(),
  hasPendingScopedAppUpdate: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('$utils/appUpdates', () => appUpdatesMocks);

describe('useSwUpdateAvailable', () => {
  let serviceWorkerListeners: Map<string, EventListener>;
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
    setVisibility('visible');

    appUpdatesMocks.checkForAppUpdates.mockReset();
    appUpdatesMocks.checkForAppUpdates.mockResolvedValue({
      kind: 'up-to-date',
      message: 'You are already on the latest available web app version.',
      canApply: false,
    });
    appUpdatesMocks.hasPendingScopedAppUpdate.mockReset();
    appUpdatesMocks.hasPendingScopedAppUpdate.mockResolvedValue(false);

    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          addEventListener: vi.fn<(event: string, listener: EventListener) => void>(
            (event, listener) => {
              serviceWorkerListeners.set(event, listener);
            }
          ),
          removeEventListener: vi.fn<(event: string) => void>((event) => {
            serviceWorkerListeners.delete(event);
          }),
          controller: null,
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts as available when a waiting worker already exists', async () => {
    appUpdatesMocks.hasPendingScopedAppUpdate.mockResolvedValue(true);

    const { result } = renderHook(() => useSwUpdateAvailable());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('clears the update flag after controllerchange when no pending update remains', async () => {
    appUpdatesMocks.hasPendingScopedAppUpdate.mockResolvedValueOnce(true).mockResolvedValue(false);
    appUpdatesMocks.checkForAppUpdates.mockResolvedValueOnce({
      kind: 'update-available',
      message: 'An update is ready to apply.',
      canApply: true,
    });

    const { result } = renderHook(() => useSwUpdateAvailable());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });

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

  it('still performs automatic hosted update checks when service workers are unavailable', async () => {
    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: {},
    });

    renderHook(() => useSwUpdateAvailable());

    await waitFor(() => {
      expect(appUpdatesMocks.checkForAppUpdates).toHaveBeenCalledTimes(1);
    });
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
    appUpdatesMocks.hasPendingScopedAppUpdate.mockResolvedValue(true);
    appUpdatesMocks.checkForAppUpdates.mockRejectedValue(new Error('network failed'));

    const { result } = renderHook(() => useSwUpdateAvailable());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('keeps the banner visible when a periodic check returns up-to-date during a transient SW state', async () => {
    // Simulate: checkForAppUpdates detects a SW update (call 1 → update-available),
    // which triggers a hasPendingScopedAppUpdate confirmation (call 2 → true, sets
    // the SW latch). A later periodic check transiently returns up-to-date while
    // hasPendingScopedAppUpdate also briefly returns false (call 3+). The banner
    // must not flicker away because the latch was already set.
    appUpdatesMocks.checkForAppUpdates
      .mockResolvedValueOnce({
        kind: 'update-available',
        message: 'An update is ready to apply.',
        canApply: true,
      })
      .mockResolvedValue({
        kind: 'up-to-date',
        message: 'You are already on the latest available web app version.',
        canApply: false,
      });
    appUpdatesMocks.hasPendingScopedAppUpdate
      .mockResolvedValueOnce(false) // mount sync (before update is detected)
      .mockResolvedValueOnce(true) // SW confirmation after update-available (sets latch)
      .mockResolvedValue(false); // subsequent calls: transient false-negative

    const { result } = renderHook(() => useSwUpdateAvailable());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });

    // Trigger a second update check (simulates interval/focus/visibility)
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    // Allow async ops to settle — banner must remain true despite transient false-negative
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current).toBe(true);
  });

  it('clears a false-positive banner when only a stale broader registration has an update', async () => {
    appUpdatesMocks.hasPendingScopedAppUpdate
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(false);

    const { result } = renderHook(() => useSwUpdateAvailable());

    await waitFor(() => {
      expect(result.current).toBe(false);
    });

    expect(appUpdatesMocks.hasPendingScopedAppUpdate).toHaveBeenCalledTimes(2);
  });
});
