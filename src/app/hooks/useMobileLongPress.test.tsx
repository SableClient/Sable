import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMobileLongPress } from './useMobileLongPress';

const touchEvent = (clientX: number, clientY: number) =>
  ({ touches: [{ clientX, clientY }] }) as unknown as React.TouchEvent;

describe('useMobileLongPress', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires after the hold delay', () => {
    vi.useFakeTimers();
    const callback = vi.fn<() => void>();
    const { result } = renderHook(() => useMobileLongPress(callback));

    act(() => result.current.onTouchStart(touchEvent(20, 30)));
    expect(result.current.isPressing).toBe(true);

    act(() => vi.advanceTimersByTime(500));
    expect(callback).toHaveBeenCalledOnce();
    expect(result.current.isPressing).toBe(false);
    expect(result.current.firedRef.current).toBe(true);
  });

  it('allows small finger movement during a hold', () => {
    vi.useFakeTimers();
    const callback = vi.fn<() => void>();
    const { result } = renderHook(() => useMobileLongPress(callback));

    act(() => {
      result.current.onTouchStart(touchEvent(20, 30));
      result.current.onTouchMove(touchEvent(32, 42));
      vi.advanceTimersByTime(500);
    });

    expect(callback).toHaveBeenCalledOnce();
  });

  it('cancels when the touch becomes a scroll', () => {
    vi.useFakeTimers();
    const callback = vi.fn<() => void>();
    const { result } = renderHook(() => useMobileLongPress(callback));

    act(() => {
      result.current.onTouchStart(touchEvent(20, 30));
      result.current.onTouchMove(touchEvent(20, 60));
      vi.advanceTimersByTime(500);
    });

    expect(callback).not.toHaveBeenCalled();
    expect(result.current.isPressing).toBe(false);
  });

  it('cancels a pending hold when unmounted', () => {
    vi.useFakeTimers();
    const callback = vi.fn<() => void>();
    const { result, unmount } = renderHook(() => useMobileLongPress(callback));

    act(() => result.current.onTouchStart(touchEvent(20, 30)));
    unmount();
    act(() => vi.advanceTimersByTime(500));

    expect(callback).not.toHaveBeenCalled();
  });
});
