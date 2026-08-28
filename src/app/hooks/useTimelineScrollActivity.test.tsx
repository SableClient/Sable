import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScrollActivity } from './useTimelineScrollActivity';

afterEach(() => {
  vi.useRealTimers();
});

describe('useScrollActivity', () => {
  it('stays active until scrolling has been idle for the full delay', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScrollActivity(300));

    act(() => result.current.notifyScroll());
    expect(result.current.isScrolling).toBe(true);

    act(() => {
      vi.advanceTimersByTime(250);
      result.current.notifyScroll();
      vi.advanceTimersByTime(250);
    });
    expect(result.current.isScrolling).toBe(true);

    act(() => vi.advanceTimersByTime(50));
    expect(result.current.isScrolling).toBe(false);
  });
});
