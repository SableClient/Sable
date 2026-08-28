import type { MouseEvent as ReactMouseEvent, MouseEventHandler, PointerEventHandler } from 'react';
import { useCallback, useRef } from 'react';

const TAP_MOVEMENT_THRESHOLD = 10;
const MAX_TAP_DURATION = 500;
const SYNTHETIC_CLICK_TIMEOUT = 350;

let clearPendingSyntheticClick: (() => void) | undefined;

function blockSyntheticClick(clientX: number, clientY: number) {
  clearPendingSyntheticClick?.();

  let timeout: number | undefined;
  const clear = () => {
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('pointerdown', clear, true);
    window.clearTimeout(timeout);
    if (clearPendingSyntheticClick === clear) clearPendingSyntheticClick = undefined;
  };
  const handleClick = (event: MouseEvent) => {
    if (
      Math.abs(event.clientX - clientX) > TAP_MOVEMENT_THRESHOLD ||
      Math.abs(event.clientY - clientY) > TAP_MOVEMENT_THRESHOLD
    ) {
      return;
    }
    clear();
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  clearPendingSyntheticClick = clear;
  document.addEventListener('click', handleClick, true);
  document.addEventListener('pointerdown', clear, true);
  timeout = window.setTimeout(clear, SYNTHETIC_CLICK_TIMEOUT);
}

// Android WebView suppresses click synthesis after a drag gesture, so the first
// tap on a nav control after swiping the drawer produces no click event. Activate
// directly on pointerup instead, and swallow the synthetic click that follows a
// touch tap so the action fires exactly once. (preventDefault on pointerup does
// NOT suppress click — click is an activation event, not a compatibility mouse
// event — so the dedup is handled by the returned `onClick` wrapper below.)
//
// `onActivate` runs on a qualifying touch pointerup. The returned `onClick`
// wraps the caller's click handler: if a touch tap already activated, the click
// is swallowed; otherwise the click handler runs (desktop, keyboard, AT, and
// the post-swipe case where no click arrives). Do not wrap the callbacks in
// startTransition or defer them — that reintroduces the double-tap.
export function useMobileTapActivation<T extends HTMLElement>(
  enabled: boolean,
  onActivate: (evt: ReactMouseEvent<T>) => void,
  onClick?: MouseEventHandler<T>
): {
  onPointerDown: PointerEventHandler<T>;
  onPointerMove: PointerEventHandler<T>;
  onPointerUp: PointerEventHandler<T>;
  onPointerCancel: PointerEventHandler<T>;
  onClick: MouseEventHandler<T>;
} {
  const onActivateRef = useRef(onActivate);
  const onClickRef = useRef(onClick);
  const pointerDownRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    timestamp: number;
    eligible: boolean;
  } | null>(null);
  // True between a qualifying touch pointerup and the click it synthesises.
  // Reset on every pointerdown so a stale flag can never outlive one tap.
  const activatedRef = useRef(false);
  onActivateRef.current = onActivate;
  onClickRef.current = onClick;

  const onPointerDown: PointerEventHandler<T> = (evt) => {
    activatedRef.current = false;
    if (!enabled || evt.pointerType !== 'touch' || !evt.isPrimary || evt.button !== 0) {
      pointerDownRef.current = null;
      return;
    }

    pointerDownRef.current = {
      pointerId: evt.pointerId,
      x: evt.clientX,
      y: evt.clientY,
      timestamp: evt.timeStamp,
      eligible: true,
    };
  };
  const onPointerMove: PointerEventHandler<T> = (evt) => {
    const pointerDown = pointerDownRef.current;
    if (!pointerDown || evt.pointerId !== pointerDown.pointerId) return;

    if (
      Math.abs(evt.clientX - pointerDown.x) > TAP_MOVEMENT_THRESHOLD ||
      Math.abs(evt.clientY - pointerDown.y) > TAP_MOVEMENT_THRESHOLD
    ) {
      pointerDown.eligible = false;
    }
  };
  const onPointerUp: PointerEventHandler<T> = (evt) => {
    const pointerDown = pointerDownRef.current;
    if (!pointerDown || evt.pointerId !== pointerDown.pointerId) return;

    pointerDownRef.current = null;
    if (
      !enabled ||
      evt.pointerType !== 'touch' ||
      !evt.isPrimary ||
      !pointerDown.eligible ||
      Math.abs(evt.clientX - pointerDown.x) > TAP_MOVEMENT_THRESHOLD ||
      Math.abs(evt.clientY - pointerDown.y) > TAP_MOVEMENT_THRESHOLD ||
      evt.timeStamp - pointerDown.timestamp >= MAX_TAP_DURATION
    ) {
      return;
    }

    evt.preventDefault();
    activatedRef.current = true;
    blockSyntheticClick(evt.clientX, evt.clientY);
    onActivateRef.current(evt);
  };
  const onPointerCancel: PointerEventHandler<T> = (evt) => {
    if (evt.pointerId !== pointerDownRef.current?.pointerId) return;
    pointerDownRef.current = null;
  };

  // Swallow the synthetic click that follows a touch pointerup; otherwise run
  // the caller's click handler (or onActivate when none was provided).
  const handleClick: MouseEventHandler<T> = useCallback((evt) => {
    if (activatedRef.current) {
      activatedRef.current = false;
      return;
    }
    if (onClickRef.current) onClickRef.current(evt);
    else onActivateRef.current(evt);
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick: handleClick };
}
