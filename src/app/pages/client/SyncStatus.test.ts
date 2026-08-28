import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('$types/matrix-sdk', () => ({
  SyncState: {
    Prepared: 'Prepared',
    Syncing: 'Syncing',
    Catchup: 'Catchup',
    Reconnecting: 'Reconnecting',
    Error: 'Error',
  },
}));

vi.mock('$hooks/useSlidingSyncHydrating', () => ({
  useSlidingSyncHydrating: () => ({ isHydrating: false, progress: null }),
}));

vi.mock('$hooks/useSyncState', () => ({
  useSyncState: () => undefined,
}));

vi.mock('$state/hooks/desktopSettings', () => ({
  useDesktopSetting: () => [false, vi.fn<() => void>()] as const,
}));

import { SyncState } from '$types/matrix-sdk';
import {
  shouldShowConnecting,
  shouldShowInlineSyncStatus,
  useStickyDisconnected,
} from './SyncStatus';

describe('shouldShowConnecting', () => {
  it('hides ordinary initial connection states', () => {
    expect(shouldShowConnecting(false, SyncState.Prepared, null)).toBe(false);
    expect(shouldShowConnecting(false, SyncState.Syncing, SyncState.Prepared)).toBe(false);
    expect(shouldShowConnecting(false, SyncState.Catchup, null)).toBe(false);
  });

  it('shows recovery progress after a client has previously connected', () => {
    expect(shouldShowConnecting(true, SyncState.Catchup, SyncState.Reconnecting)).toBe(true);
    expect(shouldShowConnecting(true, SyncState.Syncing, SyncState.Catchup)).toBe(true);
  });

  it('hides the banner during steady syncing', () => {
    expect(shouldShowConnecting(true, SyncState.Syncing, SyncState.Syncing)).toBe(false);
  });
});

describe('shouldShowInlineSyncStatus', () => {
  it('keeps the inline banner for native chrome', () => {
    expect(shouldShowInlineSyncStatus(false)).toBe(true);
  });

  it('hides the inline banner when a custom title bar renders the status', () => {
    expect(shouldShowInlineSyncStatus(true)).toBe(false);
  });
});

describe('useStickyDisconnected (hysteresis)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show banner when degraded for less than 2s', () => {
    const { result, rerender } = renderHook(({ state }) => useStickyDisconnected(state), {
      initialProps: { state: SyncState.Syncing as SyncState | null },
    });

    // Go degraded (Reconnecting)
    rerender({ state: SyncState.Reconnecting });
    act(() => {
      vi.advanceTimersByTime(1_999);
    });

    expect(result.current).toBeNull();
  });

  it('shows banner after degraded for >2s', () => {
    const { result, rerender } = renderHook(({ state }) => useStickyDisconnected(state), {
      initialProps: { state: SyncState.Syncing as SyncState | null },
    });

    rerender({ state: SyncState.Reconnecting });
    act(() => {
      vi.advanceTimersByTime(2_001);
    });

    expect(result.current).toBe(SyncState.Reconnecting);
  });

  it('preserves the show timer when the degraded variant changes', () => {
    const { result, rerender } = renderHook(({ state }) => useStickyDisconnected(state), {
      initialProps: { state: SyncState.Syncing as SyncState | null },
    });

    rerender({ state: SyncState.Reconnecting });
    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    rerender({ state: SyncState.Error });
    act(() => {
      vi.advanceTimersByTime(501);
    });

    expect(result.current).toBe(SyncState.Error);
  });

  it('stays shown when healthy for 1s then degraded again (flap regression)', () => {
    const { result, rerender } = renderHook(({ state }) => useStickyDisconnected(state), {
      initialProps: { state: SyncState.Syncing as SyncState | null },
    });

    // Degraded for >2s → shows
    rerender({ state: SyncState.Reconnecting });
    act(() => {
      vi.advanceTimersByTime(2_001);
    });
    expect(result.current).toBe(SyncState.Reconnecting);

    // Healthy for 1s → hide timer starts but doesn't fire yet
    rerender({ state: SyncState.Syncing });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(SyncState.Reconnecting); // still shown

    // Degraded again → hide timer canceled, stays shown (no "Connecting..." flash)
    rerender({ state: SyncState.Reconnecting });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(SyncState.Reconnecting);
  });

  it('hides after degraded >2s then healthy for >3s', () => {
    const { result, rerender } = renderHook(({ state }) => useStickyDisconnected(state), {
      initialProps: { state: SyncState.Syncing as SyncState | null },
    });

    // Degraded for >2s → shows
    rerender({ state: SyncState.Reconnecting });
    act(() => {
      vi.advanceTimersByTime(2_001);
    });
    expect(result.current).toBe(SyncState.Reconnecting);

    // Healthy for >3s → hides
    rerender({ state: SyncState.Syncing });
    act(() => {
      vi.advanceTimersByTime(3_001);
    });

    expect(result.current).toBeNull();
  });

  it('swaps variant from Reconnecting to Error without re-arming show timer', () => {
    const { result, rerender } = renderHook(({ state }) => useStickyDisconnected(state), {
      initialProps: { state: SyncState.Syncing as SyncState | null },
    });

    // Degraded for >2s → shows Reconnecting
    rerender({ state: SyncState.Reconnecting });
    act(() => {
      vi.advanceTimersByTime(2_001);
    });
    expect(result.current).toBe(SyncState.Reconnecting);

    // Switches to Error while visible → instant variant swap, no re-arm
    rerender({ state: SyncState.Error });
    // No timer needed — the useEffect fires synchronously on state change
    // and the "already visible" branch sets immediately
    expect(result.current).toBe(SyncState.Error);
  });
});
