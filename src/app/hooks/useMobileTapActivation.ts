import type { PointerEventHandler } from 'react';
import { useRef } from 'react';

const TAP_MOVEMENT_THRESHOLD = 10;
const MAX_TAP_DURATION = 500;

// Android WebView suppresses click synthesis after a drag, so the first tap
// on a nav control after swiping the drawer produces no click event. Activate
// directly on pointerup instead. Do not wrap the callback in startTransition
// or defer it. That reintroduces the double-tap.
export function useMobileTapActivation<T extends HTMLElement>(
  enabled: boolean,
  onActivate: () => void
): {
  onPointerDown: PointerEventHandler<T>;
  onPointerMove: PointerEventHandler<T>;
  onPointerUp: PointerEventHandler<T>;
  onPointerCancel: PointerEventHandler<T>;
} {
  const onActivateRef = useRef(onActivate);
  const pointerDownRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    timestamp: number;
    eligible: boolean;
  } | null>(null);
  onActivateRef.current = onActivate;

  const onPointerDown: PointerEventHandler<T> = (evt) => {
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
    onActivateRef.current();
  };
  const onPointerCancel: PointerEventHandler<T> = (evt) => {
    if (evt.pointerId !== pointerDownRef.current?.pointerId) return;
    pointerDownRef.current = null;
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
