import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { MenuAnchor } from './useMenuAnchor';
import { useMenuAnchor } from './useMenuAnchor';

interface FireLongPressOptions {
  /** A mock element with `getBoundingClientRect` for the long press target. */
  element?: HTMLElement;
}

/**
 * Simulates a full long press cycle on the returned trigger props:
 * touchstart → advance timer by 500ms → fire callback → touchend.
 * After this, the synthetic click/contextmenu that browsers follow with
 * should be suppressed.
 */
function fireLongPress(
  triggerProps: MenuAnchor<HTMLElement>['triggerProps'],
  opts: FireLongPressOptions = {}
) {
  const element =
    opts.element ??
    ({
      getBoundingClientRect: () => ({ x: 50, y: 100, width: 80, height: 40 }) as DOMRect,
    } as HTMLElement);

  const touch = {
    touches: [{ clientX: 50, clientY: 100 } as Touch],
    changedTouches: [{ clientX: 50, clientY: 100 } as Touch],
    preventDefault: vi.fn<() => void>(),
  };

  act(() => {
    triggerProps.onTouchStart({
      currentTarget: element,
      ...touch,
      nativeEvent: new TouchEvent('touchstart'),
    } as unknown as React.TouchEvent<HTMLElement>);
  });

  act(() => {
    vi.advanceTimersByTime(500);
  });

  act(() => {
    triggerProps.onTouchEnd();
  });
}

function createMockElement(rect: Partial<DOMRect> = {}): HTMLElement {
  return {
    getBoundingClientRect: () =>
      ({
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        top: 0,
        right: 100,
        bottom: 50,
        left: 0,
        ...rect,
      }) as DOMRect,
  } as HTMLElement;
}

import type * as UseMobileLongPressModule from './useMobileLongPress';

// ── Mock modules ────────────────────────────────────────────────────────────
vi.mock('./useMobileLongPress', async (importActual) => {
  const actual = (await importActual()) as typeof UseMobileLongPressModule;
  return {
    ...actual,
    useMobileLongPress: actual.useMobileLongPress,
  };
});

describe('useMenuAnchor', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  describe('toggle behavior of openAt', () => {
    it('sets the anchor to the bounding rect of the element', () => {
      const { result } = renderHook(() => useMenuAnchor());
      const element = createMockElement({ x: 10, y: 20, width: 120, height: 60 });

      act(() => {
        result.current.openAt(element);
      });

      const anchor = result.current.anchor;
      expect(anchor).not.toBeUndefined();
      expect(anchor!.x).toBe(10);
      expect(anchor!.y).toBe(20);
      expect(anchor!.width).toBe(120);
      expect(anchor!.height).toBe(60);
    });

    it('toggles off when calling openAt twice with the same element', () => {
      const { result } = renderHook(() => useMenuAnchor());
      const element = createMockElement();

      act(() => {
        result.current.openAt(element);
      });
      expect(result.current.anchor).not.toBeUndefined();

      act(() => {
        result.current.openAt(element);
      });
      expect(result.current.anchor).toBeUndefined();
    });

    it('sets anchor then clears on close()', () => {
      const { result } = renderHook(() => useMenuAnchor());

      act(() => {
        result.current.openAt(createMockElement());
      });
      expect(result.current.anchor).not.toBeUndefined();

      act(() => {
        result.current.close();
      });
      expect(result.current.anchor).toBeUndefined();
    });
  });

  describe('open', () => {
    it('moves an already open menu to another element instead of closing it', () => {
      const { result } = renderHook(() => useMenuAnchor());

      act(() => {
        result.current.open(createMockElement({ x: 10 }));
      });
      expect(result.current.anchor?.x).toBe(10);

      // The toggling `openAt` would close here, stranding the caller's new target.
      act(() => {
        result.current.open(createMockElement({ x: 90 }));
      });
      expect(result.current.anchor?.x).toBe(90);
    });
  });

  describe('onClick', () => {
    it('opens the menu at the clicked element', () => {
      const { result } = renderHook(() => useMenuAnchor());
      const element = createMockElement({ x: 30, y: 40 });

      act(() => {
        result.current.triggerProps.onClick({
          currentTarget: element,
          preventDefault: vi.fn<() => void>(),
          stopPropagation: vi.fn<() => void>(),
        } as unknown as React.MouseEvent<HTMLElement>);
      });

      expect(result.current.anchor).not.toBeUndefined();
      expect(result.current.anchor!.x).toBe(30);
      expect(result.current.anchor!.y).toBe(40);
    });

    it('is suppressed after a long press', () => {
      const { result } = renderHook(() => useMenuAnchor());
      const element = createMockElement({ x: 50, y: 100 });

      // Perform a long press — this opens the menu via openAt
      fireLongPress(result.current.triggerProps, { element });

      // The long press already opened it
      expect(result.current.anchor).not.toBeUndefined();
      expect(result.current.anchor!.x).toBe(50);
      expect(result.current.anchor!.y).toBe(100);

      // Now simulate the synthetic click that browsers send after touchend.
      // It must NOT toggle it shut.
      act(() => {
        result.current.triggerProps.onClick({
          currentTarget: createMockElement({ x: 999, y: 999 }),
          preventDefault: vi.fn<() => void>(),
          stopPropagation: vi.fn<() => void>(),
        } as unknown as React.MouseEvent<HTMLElement>);
      });

      // Anchor should still be at the long press position, not toggled.
      expect(result.current.anchor).not.toBeUndefined();
      expect(result.current.anchor!.x).toBe(50);
    });
  });

  describe('onContextMenu', () => {
    it('anchors the menu at the pointer position', () => {
      const { result } = renderHook(() => useMenuAnchor());

      act(() => {
        result.current.triggerProps.onContextMenu({
          currentTarget: createMockElement(),
          preventDefault: vi.fn<() => void>(),
          stopPropagation: vi.fn<() => void>(),
          nativeEvent: { clientX: 120, clientY: 300 } as MouseEvent,
        } as unknown as React.MouseEvent<HTMLElement>);
      });

      const anchor = result.current.anchor;
      expect(anchor).not.toBeUndefined();
      // Context menu anchors to pointer, so width/height are 0
      expect(anchor!.x).toBe(120);
      expect(anchor!.y).toBe(300);
      expect(anchor!.width).toBe(0);
      expect(anchor!.height).toBe(0);
    });

    it('prevents default behavior', () => {
      const { result } = renderHook(() => useMenuAnchor());
      const preventDefault = vi.fn<() => void>();

      act(() => {
        result.current.triggerProps.onContextMenu({
          currentTarget: createMockElement(),
          preventDefault,
          stopPropagation: vi.fn<() => void>(),
          nativeEvent: { clientX: 0, clientY: 0 } as MouseEvent,
        } as unknown as React.MouseEvent<HTMLElement>);
      });

      expect(preventDefault).toHaveBeenCalled();
    });

    it('is suppressed after a long press', () => {
      const { result } = renderHook(() => useMenuAnchor());
      const element = createMockElement({ x: 50, y: 100 });

      fireLongPress(result.current.triggerProps, { element });
      expect(result.current.anchor).not.toBeUndefined();
      expect(result.current.anchor!.x).toBe(50);

      // Synthetic contextmenu (browsers dispatch it after long press on some
      // platforms; our handler clears the fired flag and returns).
      act(() => {
        result.current.triggerProps.onContextMenu({
          currentTarget: createMockElement({ x: 999, y: 999 }),
          preventDefault: vi.fn<() => void>(),
          stopPropagation: vi.fn<() => void>(),
          nativeEvent: { clientX: 999, clientY: 999 } as MouseEvent,
        } as unknown as React.MouseEvent<HTMLElement>);
      });

      // Should remain anchored to the long-press element position.
      expect(result.current.anchor).not.toBeUndefined();
      expect(result.current.anchor!.x).toBe(50);
    });

    it('stays open when the native contextmenu beats the long-press timer', () => {
      const { result } = renderHook(() => useMenuAnchor());
      const element = createMockElement({ x: 50, y: 100 });

      act(() => {
        result.current.triggerProps.onTouchStart({
          currentTarget: element,
          touches: [{ clientX: 50, clientY: 100 } as Touch],
          changedTouches: [{ clientX: 50, clientY: 100 } as Touch],
          preventDefault: vi.fn<() => void>(),
          nativeEvent: new TouchEvent('touchstart'),
        } as unknown as React.TouchEvent<HTMLElement>);
      });

      // The platform's own long press lands just before our timer does.
      act(() => {
        result.current.triggerProps.onContextMenu({
          currentTarget: element,
          preventDefault: vi.fn<() => void>(),
          stopPropagation: vi.fn<() => void>(),
          nativeEvent: { clientX: 120, clientY: 300 } as MouseEvent,
        } as unknown as React.MouseEvent<HTMLElement>);
      });
      expect(result.current.anchor).not.toBeUndefined();

      act(() => {
        vi.advanceTimersByTime(500);
      });
      act(() => {
        result.current.triggerProps.onTouchEnd();
      });

      expect(result.current.anchor).not.toBeUndefined();
      expect(result.current.anchor!.x).toBe(120);
    });

    it('cancels a pending custom long press when its contextmenu path consumes the event', () => {
      const onLongPress = vi.fn<() => void>();
      const { result } = renderHook(() => useMenuAnchor({ onLongPress }));
      const element = createMockElement();

      act(() => {
        result.current.triggerProps.onTouchStart({
          currentTarget: element,
          touches: [{ clientX: 50, clientY: 100 } as Touch],
          changedTouches: [{ clientX: 50, clientY: 100 } as Touch],
          preventDefault: vi.fn<() => void>(),
          nativeEvent: new TouchEvent('touchstart'),
        } as unknown as React.TouchEvent<HTMLElement>);
      });

      let longPressFired: boolean | undefined;
      act(() => {
        longPressFired = result.current.consumeLongPressFired();
      });
      expect(longPressFired).toBe(false);

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(onLongPress).not.toHaveBeenCalled();
    });
  });

  describe('isPressing', () => {
    it('is false initially', () => {
      const { result } = renderHook(() => useMenuAnchor());
      expect(result.current.isPressing).toBe(false);
    });

    it('becomes true during a long press (before timeout fires)', () => {
      const { result } = renderHook(() => useMenuAnchor());
      const element = createMockElement();

      act(() => {
        result.current.triggerProps.onTouchStart({
          currentTarget: element,
          touches: [{ clientX: 10, clientY: 10 } as Touch],
          changedTouches: [{ clientX: 10, clientY: 10 } as Touch],
          preventDefault: vi.fn<() => void>(),
          nativeEvent: new TouchEvent('touchstart'),
        } as unknown as React.TouchEvent<HTMLElement>);
      });

      expect(result.current.isPressing).toBe(true);
    });

    it('is false after a long press completes', () => {
      const { result } = renderHook(() => useMenuAnchor());
      fireLongPress(result.current.triggerProps, { element: createMockElement() });
      expect(result.current.isPressing).toBe(false);
    });

    it('is false after touch is cancelled before timeout', () => {
      const { result } = renderHook(() => useMenuAnchor());
      const element = createMockElement();

      act(() => {
        result.current.triggerProps.onTouchStart({
          currentTarget: element,
          touches: [{ clientX: 10, clientY: 10 } as Touch],
          changedTouches: [{ clientX: 10, clientY: 10 } as Touch],
          preventDefault: vi.fn<() => void>(),
          nativeEvent: new TouchEvent('touchstart'),
        } as unknown as React.TouchEvent<HTMLElement>);
      });

      // Less than the 500ms threshold
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(result.current.isPressing).toBe(true);

      act(() => {
        result.current.triggerProps.onTouchCancel();
      });

      expect(result.current.isPressing).toBe(false);
    });
  });
});
