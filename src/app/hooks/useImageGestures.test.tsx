import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useImageGestures } from './useImageGestures';

// Pan is measured from the container centre, here (100, 100).
const CONTAINER_RECT = {
  x: 0,
  y: 0,
  width: 200,
  height: 200,
  top: 0,
  left: 0,
  right: 200,
  bottom: 200,
} as DOMRect;

const container = () => {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => CONTAINER_RECT;
  Object.defineProperty(el, 'clientWidth', { value: 200 });
  Object.defineProperty(el, 'clientHeight', { value: 200 });
  return el;
};

const pointerDown = (
  onPointerDown: (e: ReactPointerEvent) => void,
  pointerId: number,
  x: number,
  y: number,
  target: HTMLElement
) =>
  onPointerDown({
    pointerId,
    clientX: x,
    clientY: y,
    pointerType: 'touch',
    button: 0,
    target,
    stopPropagation: () => {},
  } as unknown as ReactPointerEvent);

const firePointer = (
  type: 'pointermove' | 'pointerup',
  pointerId: number,
  x: number,
  y: number
) => {
  const event = new MouseEvent(type, { clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  window.dispatchEvent(event);
};

const frame = () => vi.advanceTimersByTime(20);

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date', 'setTimeout', 'clearTimeout'],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useImageGestures pinch', () => {
  it('resolves zoom against the pinch start rather than accumulating per frame', () => {
    const { result } = renderHook(() => useImageGestures(true));
    const target = container();
    result.current.containerRef.current = target;

    act(() => {
      pointerDown(result.current.onPointerDown, 1, 50, 100, target);
      pointerDown(result.current.onPointerDown, 2, 150, 100, target);
    });

    // Spread to twice the starting distance over several noisy frames.
    act(() => {
      firePointer('pointermove', 1, 40, 100);
      firePointer('pointermove', 2, 160, 100);
      frame();
    });
    act(() => {
      firePointer('pointermove', 1, 10, 100);
      firePointer('pointermove', 2, 190, 100);
      frame();
    });
    act(() => {
      firePointer('pointermove', 1, 0, 100);
      firePointer('pointermove', 2, 200, 100);
      frame();
    });

    expect(result.current.transforms.zoom).toBeCloseTo(2, 5);
  });

  it('applies one transform per frame no matter how many pointer events arrive', () => {
    const { result } = renderHook(() => useImageGestures(true));
    const target = container();
    result.current.containerRef.current = target;

    act(() => {
      pointerDown(result.current.onPointerDown, 1, 50, 100, target);
      pointerDown(result.current.onPointerDown, 2, 150, 100, target);
    });

    act(() => {
      firePointer('pointermove', 1, 25, 100);
      firePointer('pointermove', 2, 175, 100);
      firePointer('pointermove', 1, 0, 100);
      firePointer('pointermove', 2, 200, 100);
      frame();
    });

    // Four events, one frame: the final spread, not one compounded per event.
    expect(result.current.transforms.zoom).toBeCloseTo(2, 5);
  });

  it('keeps the point between the fingers pinned while zooming', () => {
    const { result } = renderHook(() => useImageGestures(true));
    const target = container();
    result.current.containerRef.current = target;

    // Fingers centred on (150, 100): 50px right of the container centre.
    act(() => {
      pointerDown(result.current.onPointerDown, 1, 100, 100, target);
      pointerDown(result.current.onPointerDown, 2, 200, 100, target);
    });

    act(() => {
      firePointer('pointermove', 1, 50, 100);
      firePointer('pointermove', 2, 250, 100);
      frame();
    });

    // pan = c - (c - pan0) * factor, with c = 50, pan0 = 0, factor = 2.
    expect(result.current.transforms.zoom).toBeCloseTo(2, 5);
    expect(result.current.transforms.pan.x).toBeCloseTo(-50, 5);
    expect(result.current.transforms.pan.y).toBeCloseTo(0, 5);
  });

  it('settles back to the fitted size when a pinch ends below it', () => {
    const { result } = renderHook(() => useImageGestures(true));
    const target = container();
    result.current.containerRef.current = target;

    act(() => {
      result.current.handleImageDimensions(400, 400);
    });
    expect(result.current.fitRatio).toBeCloseTo(0.5, 5);

    act(() => {
      pointerDown(result.current.onPointerDown, 1, 50, 100, target);
      pointerDown(result.current.onPointerDown, 2, 150, 100, target);
    });
    act(() => {
      firePointer('pointermove', 1, 90, 100);
      firePointer('pointermove', 2, 110, 100);
      frame();
    });
    expect(result.current.transforms.zoom).toBeLessThan(0.5);

    act(() => {
      firePointer('pointerup', 1, 90, 100);
      firePointer('pointerup', 2, 110, 100);
    });

    expect(result.current.transforms.zoom).toBeCloseTo(0.5, 5);
    expect(result.current.transforms.pan).toEqual({ x: 0, y: 0 });
  });
});

describe('useImageGestures fitted swipes', () => {
  it('dismisses on a downward drag at the fitted size', () => {
    const onDismiss = vi.fn<() => void>();
    const { result } = renderHook(() => useImageGestures(true, 0.2, 0.1, 500, { onDismiss }));
    const target = container();
    result.current.containerRef.current = target;

    act(() => {
      pointerDown(result.current.onPointerDown, 1, 100, 50, target);
    });
    act(() => {
      firePointer('pointermove', 1, 100, 120);
      frame();
    });
    act(() => {
      firePointer('pointerup', 1, 100, 200);
    });

    expect(onDismiss).toHaveBeenCalled();
  });

  it('re-arms the dismiss drag after zooming in and back out', () => {
    const onDismiss = vi.fn<() => void>();
    const { result } = renderHook(() => useImageGestures(true, 0.2, 0.1, 500, { onDismiss }));
    const target = container();
    result.current.containerRef.current = target;

    // A large image fits at 0.5, so "not zoomed" is 0.5 rather than 1.
    act(() => {
      result.current.handleImageDimensions(400, 400);
    });

    act(() => {
      pointerDown(result.current.onPointerDown, 1, 100, 100, target);
      firePointer('pointerup', 1, 100, 100);
      vi.advanceTimersByTime(50);
      pointerDown(result.current.onPointerDown, 1, 100, 100, target);
    });
    expect(result.current.transforms.zoom).toBeCloseTo(1, 5);

    act(() => {
      vi.advanceTimersByTime(500);
      pointerDown(result.current.onPointerDown, 2, 100, 100, target);
      firePointer('pointerup', 2, 100, 100);
      vi.advanceTimersByTime(50);
      pointerDown(result.current.onPointerDown, 2, 100, 100, target);
    });
    expect(result.current.transforms.zoom).toBeCloseTo(0.5, 5);

    act(() => {
      vi.advanceTimersByTime(500);
      pointerDown(result.current.onPointerDown, 3, 100, 50, target);
    });
    act(() => {
      firePointer('pointermove', 3, 100, 120);
      frame();
    });
    act(() => {
      firePointer('pointerup', 3, 100, 200);
    });

    expect(onDismiss).toHaveBeenCalled();
  });
});
