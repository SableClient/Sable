import { describe, expect, it, vi } from 'vitest';
import { scheduleDeferredFeatureMount } from './scheduleDeferredFeatureMount';

describe('scheduleDeferredFeatureMount', () => {
  it('uses requestIdleCallback when available', () => {
    const mount = vi.fn();
    const requestIdleCallback = vi.fn((cb: IdleRequestCallback) => {
      cb({ didTimeout: false, timeRemaining: () => 0 } as IdleDeadline);
      return 1;
    });
    const cancelIdleCallback = vi.fn();
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    const win = window as unknown as {
      requestIdleCallback?: unknown;
      cancelIdleCallback?: unknown;
    };
    const original = {
      requestIdleCallback: win.requestIdleCallback,
      cancelIdleCallback: win.cancelIdleCallback,
    };
    win.requestIdleCallback = requestIdleCallback;
    win.cancelIdleCallback = cancelIdleCallback;

    const cleanup = scheduleDeferredFeatureMount(mount);
    cleanup();

    expect(requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 1200 });
    expect(mount).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(cancelIdleCallback).toHaveBeenCalledWith(1);

    win.requestIdleCallback = original.requestIdleCallback;
    win.cancelIdleCallback = original.cancelIdleCallback;
    setTimeoutSpy.mockRestore();
  });

  it('falls back to setTimeout when requestIdleCallback is unavailable', () => {
    vi.useFakeTimers();
    const mount = vi.fn();
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

    const win = window as unknown as { requestIdleCallback?: unknown };
    const original = win.requestIdleCallback;
    win.requestIdleCallback = undefined;

    const cleanup = scheduleDeferredFeatureMount(mount);
    vi.runAllTimers();
    cleanup();

    expect(mount).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0);
    expect(clearTimeoutSpy).toHaveBeenCalled();

    win.requestIdleCallback = original;
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });
});
