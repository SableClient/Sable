import type { MouseEventHandler, TouchEvent as ReactTouchEvent } from 'react';
import { useCallback, useRef, useState } from 'react';
import type { RectCords } from 'folds';
import { getMouseEventCords } from '$utils/dom';
import { useMobileLongPress } from './useMobileLongPress';

type TriggerProps<T extends HTMLElement> = {
  onClick: MouseEventHandler<T>;
  onContextMenu: MouseEventHandler<T>;
  onTouchStart: (evt: ReactTouchEvent<T>) => void;
  onTouchEnd: () => void;
  onTouchMove: (evt: ReactTouchEvent<T>) => void;
  onTouchCancel: () => void;
};

export type MenuAnchor<T extends HTMLElement> = {
  anchor: RectCords | undefined;
  /** Drives the press-feedback highlight while a long press is in progress. */
  isPressing: boolean;
  close: () => void;
  /** Anchors the menu to an element's box. */
  openAt: (element: HTMLElement) => void;
  /** Click, right-click and long-press wiring for the trigger element. */
  triggerProps: TriggerProps<T>;
};

/**
 * Owns the anchor state behind a menu and gives its trigger a touch path, so a
 * menu is never reachable by right-click alone.
 */
export function useMenuAnchor<T extends HTMLElement = HTMLElement>(): MenuAnchor<T> {
  const [anchor, setAnchor] = useState<RectCords>();
  const triggerRef = useRef<T | null>(null);

  const close = useCallback(() => setAnchor(undefined), []);

  const openAt = useCallback((element: HTMLElement) => {
    const cords = element.getBoundingClientRect();
    setAnchor((current) => (current ? undefined : cords));
  }, []);

  const longPress = useMobileLongPress(() => {
    if (triggerRef.current) openAt(triggerRef.current);
  });

  const onClick: MouseEventHandler<T> = useCallback(
    (evt) => {
      // The long-press timer already opened it; the synthetic click would toggle it shut.
      // Clearing here matters on mouse input, where no further touchstart resets it.
      if (longPress.firedRef.current) {
        longPress.firedRef.current = false;
        return;
      }
      openAt(evt.currentTarget);
    },
    [longPress, openAt]
  );

  const onContextMenu: MouseEventHandler<T> = useCallback(
    (evt) => {
      evt.preventDefault();
      // The long-press timer already opened it; a synthetic contextmenu would toggle it shut.
      if (longPress.firedRef.current) {
        longPress.firedRef.current = false;
        return;
      }
      // Call sites key align/offset on `width === 0` to lay out from the cursor.
      // Assigning, not toggling: nested handlers fire this twice as the event bubbles.
      setAnchor(getMouseEventCords(evt.nativeEvent));
    },
    [longPress]
  );

  const onTouchStart = useCallback(
    (evt: ReactTouchEvent<T>) => {
      triggerRef.current = evt.currentTarget;
      longPress.onTouchStart(evt);
    },
    [longPress]
  );

  return {
    anchor,
    isPressing: longPress.isPressing,
    close,
    openAt,
    triggerProps: {
      onClick,
      onContextMenu,
      onTouchStart,
      onTouchEnd: longPress.onTouchEnd,
      onTouchMove: longPress.onTouchMove,
      onTouchCancel: longPress.onTouchCancel,
    },
  };
}
