// Integration tests: uses fake timers to control setTimeout behaviour.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimeoutToggle } from './useTimeoutToggle';

describe('useTimeoutToggle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with the default initial value of false', () => {
    const { result } = renderHook(() => useTimeoutToggle());
    expect(result.current[0]).toBe(false);
  });

  it('becomes true after trigger() is called', () => {
    const { result } = renderHook(() => useTimeoutToggle());
    act(() => {
      result.current[1]();
    });
    expect(result.current[0]).toBe(true);
  });

  it('resets to false after the default 1500ms duration', () => {
    const { result } = renderHook(() => useTimeoutToggle());

    act(() => {
      result.current[1]();
    });
    expect(result.current[0]).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current[0]).toBe(false);
  });

  it('does not reset before the duration has elapsed', () => {
    const { result } = renderHook(() => useTimeoutToggle(500));

    act(() => {
      result.current[1]();
    });

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current[0]).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current[0]).toBe(false);
  });

  it('re-triggering before timeout resets the countdown', () => {
    const { result } = renderHook(() => useTimeoutToggle(1000));

    act(() => {
      result.current[1](); // t=0: trigger
    });

    act(() => {
      vi.advanceTimersByTime(800); // t=800
    });

    act(() => {
      result.current[1](); // t=800: re-trigger, timer resets
    });

    act(() => {
      vi.advanceTimersByTime(800); // t=1600 — only 800ms since re-trigger
    });
    expect(result.current[0]).toBe(true); // still active

    act(() => {
      vi.advanceTimersByTime(200); // t=1800 — 1000ms since re-trigger
    });
    expect(result.current[0]).toBe(false);
  });

  it('supports a custom initial value of true (inverted toggle)', () => {
    const { result } = renderHook(() => useTimeoutToggle(1500, true));

    expect(result.current[0]).toBe(true);

    act(() => {
      result.current[1](); // trigger → false
    });
    expect(result.current[0]).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1500); // resets back to true
    });
    expect(result.current[0]).toBe(true);
  });
});
