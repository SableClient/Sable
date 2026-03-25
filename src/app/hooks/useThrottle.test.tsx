import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThrottle } from './useThrottle';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useThrottle', () => {
  it('fires once after the wait period even when called multiple times', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useThrottle(fn, { wait: 200 }));

    act(() => {
      result.current('a');
      result.current('b');
      result.current('c');
    });

    expect(fn).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(fn).toHaveBeenCalledOnce();
  });

  it('fires with the latest args when called multiple times within the wait', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useThrottle(fn, { wait: 200 }));

    act(() => {
      result.current('first');
      result.current('second');
      result.current('third');
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(fn).toHaveBeenCalledWith('third');
  });

  it('does not fire before the wait period ends', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useThrottle(fn, { wait: 300 }));

    act(() => {
      result.current('x');
      vi.advanceTimersByTime(299);
    });

    expect(fn).not.toHaveBeenCalled();
  });

  it('allows a new invocation after the wait period resets', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useThrottle(fn, { wait: 100 }));

    act(() => {
      result.current('first-burst');
      vi.advanceTimersByTime(100);
    });

    act(() => {
      result.current('second-burst');
      vi.advanceTimersByTime(100);
    });

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 'first-burst');
    expect(fn).toHaveBeenNthCalledWith(2, 'second-burst');
  });

  it('fires immediately on first call when immediate option is set', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useThrottle(fn, { wait: 200, immediate: true }));

    act(() => {
      result.current('now');
    });

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('now');
  });
});
