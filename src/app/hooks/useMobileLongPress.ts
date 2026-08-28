import { useRef, useCallback, useEffect, useState } from 'react';

const MOVE_TOLERANCE = 16;

export function useMobileLongPress(callback: () => void, delay = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  const firedRef = useRef(false);
  const [isPressing, setIsPressing] = useState(false);
  const startY = useRef<number | null>(null);
  const startX = useRef<number | null>(null);

  callbackRef.current = callback;

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!firedRef.current) {
      setIsPressing(false);
    }
    startY.current = null;
    startX.current = null;
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    []
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      clear();
      firedRef.current = false;
      const touch = 'touches' in e && e.touches.length === 1 ? e.touches[0] : undefined;
      if (!touch) return;

      setIsPressing(true);
      startY.current = touch.clientY;
      startX.current = touch.clientX;

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        firedRef.current = true;
        setIsPressing(false);
        callbackRef.current();
      }, delay);
    },
    [clear, delay]
  );

  const onTouchEnd = useCallback(() => {
    clear();
  }, [clear]);

  const onTouchMove = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      if (
        startY.current === null ||
        startX.current === null ||
        !('touches' in e) ||
        !e.touches[0]
      ) {
        clear();
        return;
      }
      const diffY = Math.abs(e.touches[0].clientY - startY.current);
      const diffX = Math.abs(e.touches[0].clientX - startX.current);

      if (diffY > MOVE_TOLERANCE || diffX > MOVE_TOLERANCE) {
        clear();
      }
    },
    [clear]
  );

  const onTouchCancel = useCallback(() => clear(), [clear]);

  return { onTouchStart, onTouchEnd, onTouchMove, onTouchCancel, firedRef, isPressing };
}
