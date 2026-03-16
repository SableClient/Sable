import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebounce', () => {
  it('does not call callback before wait time elapses', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebounce(fn, { wait: 200 }));

    act(() => {
      result.current('a');
    });

    act(() => {
      vi.advanceTimersByTime(199);
    });

    expect(fn).not.toHaveBeenCalled();
  });

  it('calls callback after wait time elapses', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebounce(fn, { wait: 200 }));

    act(() => {
      result.current('a');
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('resets the timer on each successive call', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebounce(fn, { wait: 200 }));

    act(() => {
      result.current('first');
    });

    act(() => {
      vi.advanceTimersByTime(150);
      result.current('second');
    });

    // 150ms into the reset timer — should not have fired yet
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(fn).not.toHaveBeenCalled();

    // Complete the 200ms wait after the second call
    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('second');
  });

  it('only fires once after rapid successive calls', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebounce(fn, { wait: 100 }));

    act(() => {
      result.current(1);
      result.current(2);
      result.current(3);
      vi.advanceTimersByTime(100);
    });

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(3);
  });

  it('fires immediately on first call when immediate option is set', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebounce(fn, { wait: 200, immediate: true }));

    act(() => {
      result.current('go');
    });

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('go');
  });
});
