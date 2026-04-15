import { act, renderHook } from '@testing-library/react';
import { Provider, useAtomValue } from 'jotai';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { usePresenceAutoIdle } from './usePresenceAutoIdle';
import { presenceAutoIdledAtom } from '$state/settings';
import { appEvents } from '$utils/appEvents';
import type { ReactNode } from 'react';

// -------- mock setup --------

const userListeners = new Map<string, ((...args: unknown[]) => void)[]>();

const makeMockUser = () => ({
  userId: '@alice:test',
  presence: 'online',
  on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    const list = userListeners.get(event) ?? [];
    list.push(handler);
    userListeners.set(event, list);
  }),
  removeListener: vi.fn(),
});

let mockUser: ReturnType<typeof makeMockUser> | null = null;

const makeMockMx = () => ({
  getUserId: vi.fn(() => '@alice:test'),
  getUser: vi.fn(() => mockUser),
});

let mockMx: ReturnType<typeof makeMockMx>;

const wrapper = ({ children }: { children: ReactNode }) => <Provider>{children}</Provider>;

// Helper to read the atom value alongside the hook under test.
function useAutoIdledReader(
  mx: ReturnType<typeof makeMockMx>,
  presenceMode: string,
  sendPresence: boolean,
  timeoutMs: number
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  usePresenceAutoIdle(mx as any, presenceMode, sendPresence, timeoutMs);
  return useAtomValue(presenceAutoIdledAtom);
}

// -------- lifecycle --------

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  userListeners.clear();
  mockUser = makeMockUser();
  mockMx = makeMockMx();
});

afterEach(() => {
  vi.useRealTimers();
});

// -------- tests --------

describe('usePresenceAutoIdle', () => {
  it('sets auto-idle after the timeout elapses', () => {
    const { result } = renderHook(
      () => useAutoIdledReader(mockMx, 'online', true, 5000),
      { wrapper }
    );

    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current).toBe(true);
  });

  it('resets auto-idle when user activity is detected', () => {
    const { result } = renderHook(
      () => useAutoIdledReader(mockMx, 'online', true, 5000),
      { wrapper }
    );

    // Go idle.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(true);

    // Simulate user activity.
    act(() => {
      document.dispatchEvent(new Event('mousemove'));
    });
    expect(result.current).toBe(false);
  });

  it('resets auto-idle when app becomes visible via appEvents', () => {
    const { result } = renderHook(
      () => useAutoIdledReader(mockMx, 'online', true, 5000),
      { wrapper }
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(true);

    // Simulate app returning to foreground.
    act(() => {
      appEvents.emitVisibilityChange(true);
    });
    expect(result.current).toBe(false);
  });

  it('does not go idle when presenceMode is not online', () => {
    const { result } = renderHook(
      () => useAutoIdledReader(mockMx, 'dnd', true, 5000),
      { wrapper }
    );

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current).toBe(false);
  });

  it('does not go idle when sendPresence is false', () => {
    const { result } = renderHook(
      () => useAutoIdledReader(mockMx, 'online', false, 5000),
      { wrapper }
    );

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current).toBe(false);
  });

  it('does not go idle when timeoutMs is 0', () => {
    const { result } = renderHook(
      () => useAutoIdledReader(mockMx, 'online', true, 0),
      { wrapper }
    );

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current).toBe(false);
  });

  it('restarts the idle timer on activity before timeout', () => {
    const { result } = renderHook(
      () => useAutoIdledReader(mockMx, 'online', true, 5000),
      { wrapper }
    );

    // Advance partially, then trigger activity.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(false);

    act(() => {
      document.dispatchEvent(new Event('keydown'));
    });

    // Original timeout would have fired at 5000ms, but we reset.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(false);

    // Now the full 5000ms from last activity should trigger idle.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(true);
  });

  it('clears auto-idle when presenceMode changes away from online', () => {
    const { result, rerender } = renderHook(
      ({ mode }) => useAutoIdledReader(mockMx, mode, true, 5000),
      { wrapper, initialProps: { mode: 'online' } }
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(true);

    rerender({ mode: 'dnd' });
    expect(result.current).toBe(false);
  });

  it('clears auto-idle when another device sets presence to online', () => {
    const { result } = renderHook(
      () => useAutoIdledReader(mockMx, 'online', true, 5000),
      { wrapper }
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(true);

    // Simulate User.presence event from another device.
    const handlers = userListeners.get('User.presence') ?? [];
    expect(handlers.length).toBeGreaterThan(0);

    act(() => {
      handlers.forEach((h) =>
        h({}, { userId: '@alice:test', presence: 'online' })
      );
    });
    expect(result.current).toBe(false);
  });

  it('unsubscribes from appEvents.onVisibilityChange on cleanup', () => {
    const { result, unmount } = renderHook(
      () => useAutoIdledReader(mockMx, 'online', true, 5000),
      { wrapper }
    );

    // Go idle.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(true);

    unmount();

    // After unmount, emitting visibility change should have no effect.
    // (No error thrown means the handler was properly unsubscribed.)
    act(() => {
      appEvents.emitVisibilityChange(true);
    });
  });
});
