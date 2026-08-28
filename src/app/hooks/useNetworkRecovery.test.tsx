import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { nudgeReconnect, abortClassicSyncPoll, setOnline, listenOff, listen, mockIsTauri } =
  vi.hoisted(() => ({
    nudgeReconnect: vi.fn<(mx: unknown, reason: string, opts?: { force?: boolean }) => boolean>(),
    abortClassicSyncPoll: vi.fn<(mx: unknown) => boolean>(),
    setOnline: vi.fn<() => void>(),
    listenOff: vi.fn<() => void>(),
    listen: vi.fn<(_event: string, _cb: () => void) => Promise<() => void>>(),
    mockIsTauri: { value: false },
  }));

vi.mock('$client/reconnect', () => ({
  nudgeReconnect,
  abortClassicSyncPoll,
}));

vi.mock('@tanstack/react-query', () => ({
  onlineManager: {
    setOnline,
  },
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen,
  TauriEvent: { WINDOW_RESUMED: 'tauri://resumed' },
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => mockIsTauri.value,
}));

let syncCallback: (() => void) | undefined;

vi.mock('./useSyncState', () => ({
  useSyncState: (_mx: unknown, cb: () => void) => {
    syncCallback = cb;
  },
}));

import { useNetworkRecovery } from './useNetworkRecovery';

describe('useNetworkRecovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    nudgeReconnect.mockReset().mockReturnValue(true);
    abortClassicSyncPoll.mockReset().mockReturnValue(true);
    setOnline.mockReset();
    listenOff.mockReset();
    listen.mockReset().mockResolvedValue(listenOff);
    mockIsTauri.value = false;
    syncCallback = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('nudges on window online event', () => {
    renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

    dispatchEvent(new Event('online'));

    expect(nudgeReconnect).toHaveBeenCalledWith(expect.anything(), 'online', undefined);
    expect(setOnline).toHaveBeenCalled();
  });

  it('nudges on visibilitychange to visible when connection is stale', () => {
    const visState = vi.spyOn(document, 'visibilityState', 'get');
    visState.mockReturnValue('visible');
    renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

    vi.advanceTimersByTime(30_001);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(nudgeReconnect).toHaveBeenCalledWith(expect.anything(), 'visible', undefined);
    visState.mockRestore();
  });

  it('does not nudge on visibilitychange to visible when connection is fresh', () => {
    const visState = vi.spyOn(document, 'visibilityState', 'get');
    visState.mockReturnValue('visible');
    renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

    document.dispatchEvent(new Event('visibilitychange'));

    expect(nudgeReconnect).not.toHaveBeenCalled();
    visState.mockRestore();
  });

  it('does not nudge on visibilitychange to hidden', () => {
    const visState = vi.spyOn(document, 'visibilityState', 'get');
    visState.mockReturnValue('hidden');
    renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

    // hidden blocks regardless of staleness
    vi.advanceTimersByTime(30_001);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(nudgeReconnect).not.toHaveBeenCalled();
    visState.mockRestore();
  });

  it('calls onlineManager.setOnline(true) on nudge', () => {
    renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

    dispatchEvent(new Event('online'));

    expect(setOnline).toHaveBeenCalled();
  });

  it('triggers stalled nudge when no Sync event for 75s', () => {
    renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

    vi.advanceTimersByTime(80_000);

    expect(nudgeReconnect).toHaveBeenCalledWith(expect.anything(), 'stalled', undefined);
  });

  it('does not trigger stalled nudge when Sync events keep arriving', () => {
    renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(20_000);
      if (syncCallback) syncCallback();
    }

    expect(nudgeReconnect).not.toHaveBeenCalled();
  });

  it('removes listeners and clears interval on unmount', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const docAddSpy = vi.spyOn(document, 'addEventListener');
    const docRemoveSpy = vi.spyOn(document, 'removeEventListener');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

    const { unmount } = renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

    expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(docAddSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(docRemoveSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(clearIntervalSpy).toHaveBeenCalled();

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
    docAddSpy.mockRestore();
    docRemoveSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it('does nothing when mx is undefined', () => {
    renderHook(() => useNetworkRecovery(undefined));

    dispatchEvent(new Event('online'));

    expect(nudgeReconnect).not.toHaveBeenCalled();
    expect(setOnline).not.toHaveBeenCalled();
  });

  it('retries on the next tick when a stall nudge was throttled away', () => {
    nudgeReconnect.mockReturnValue(false);
    renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

    // Threshold stays satisfied because a throttled nudge must not reset it.
    vi.advanceTimersByTime(80_000);
    expect(nudgeReconnect).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_000);
    expect(nudgeReconnect).toHaveBeenCalledTimes(2);
  });

  describe('wedged classic sync escalation', () => {
    it('aborts the poll after three consecutive nudges that could not bite', () => {
      nudgeReconnect.mockReturnValue(false);
      renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

      vi.advanceTimersByTime(80_000);
      vi.advanceTimersByTime(10_000);
      expect(abortClassicSyncPoll).not.toHaveBeenCalled();

      vi.advanceTimersByTime(10_000);
      expect(abortClassicSyncPoll).toHaveBeenCalledOnce();
    });

    it('never escalates while nudges keep biting', () => {
      renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

      vi.advanceTimersByTime(200_000);

      expect(nudgeReconnect).toHaveBeenCalled();
      expect(abortClassicSyncPoll).not.toHaveBeenCalled();
    });

    it('forgets dead nudges once a Sync arrives', () => {
      nudgeReconnect.mockReturnValue(false);
      renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

      vi.advanceTimersByTime(80_000);
      vi.advanceTimersByTime(10_000);
      if (syncCallback) syncCallback();

      vi.advanceTimersByTime(80_000);
      vi.advanceTimersByTime(10_000);
      expect(abortClassicSyncPoll).not.toHaveBeenCalled();

      vi.advanceTimersByTime(10_000);
      expect(abortClassicSyncPoll).toHaveBeenCalledOnce();
    });

    it('resets the stall clock so one wedge escalates once', () => {
      nudgeReconnect.mockReturnValue(false);
      renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

      vi.advanceTimersByTime(100_000);
      expect(abortClassicSyncPoll).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(10_000);
      expect(abortClassicSyncPoll).toHaveBeenCalledOnce();
    });
  });

  describe('foreground nudge verification', () => {
    it('retries once past the throttle when no Sync follows the nudge', () => {
      renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

      dispatchEvent(new Event('online'));
      expect(nudgeReconnect).toHaveBeenCalledTimes(1);
      expect(nudgeReconnect).toHaveBeenLastCalledWith(expect.anything(), 'online', undefined);

      vi.advanceTimersByTime(3_000);

      expect(nudgeReconnect).toHaveBeenCalledTimes(2);
      expect(nudgeReconnect).toHaveBeenLastCalledWith(expect.anything(), 'retry', { force: true });
    });

    it('cancels the retry when a Sync arrives after the nudge', () => {
      renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

      dispatchEvent(new Event('online'));
      vi.advanceTimersByTime(1_000);
      syncCallback?.();
      vi.advanceTimersByTime(3_000);

      expect(nudgeReconnect).toHaveBeenCalledTimes(1);
    });

    it('issues only one follow-up nudge', () => {
      renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

      dispatchEvent(new Event('online'));
      vi.advanceTimersByTime(3_000);
      vi.advanceTimersByTime(30_000);

      expect(nudgeReconnect).toHaveBeenCalledTimes(2);
    });
  });

  describe('tauri mobile resume', () => {
    beforeEach(() => {
      mockIsTauri.value = true;
    });

    it('force-nudges on tauri://resumed event', () => {
      listen.mockResolvedValue(listenOff);

      renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

      expect(listen).toHaveBeenCalledWith('tauri://resumed', expect.any(Function));
      const [, cb] = listen.mock.calls[0] as [string, () => void];
      cb();

      expect(nudgeReconnect).toHaveBeenCalledWith(expect.anything(), 'resumed', { force: true });
    });

    it('does not subscribe to tauri://suspended', () => {
      listen.mockResolvedValue(listenOff);

      renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

      expect(listen).toHaveBeenCalledOnce();
      expect(listen).not.toHaveBeenCalledWith('tauri://suspended', expect.any(Function));
    });

    it('calls the listen cleanup on unmount', async () => {
      listen.mockResolvedValue(listenOff);

      const { unmount } = renderHook(() => useNetworkRecovery({ clientRunning: true } as never));

      unmount();
      // Cleanup runs through unlisten.then(), so flush the microtask queue.
      await Promise.resolve();

      expect(listenOff).toHaveBeenCalled();
    });
  });
});
