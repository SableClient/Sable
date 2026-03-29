import { useState, useCallback, useRef, useEffect } from 'react';

export const useImageGestures = (active: boolean, step = 0.2, min = 0.1, max = 5) => {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState({ translateX: 0, translateY: 0 });
  const [cursor, setCursor] = useState<'grab' | 'grabbing' | 'initial'>(
    active ? 'grab' : 'initial'
  );

  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const initialDist = useRef<number>(0);
  const lastTapRef = useRef<number>(0);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!active) return;

    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      setZoom(zoom === 1 ? 2 : 1);
      setPan({ translateX: 0, translateY: 0 });
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;

    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setCursor('grabbing');

    if (activePointers.current.size === 2) {
      const points = [...activePointers.current.values()];
      initialDist.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    }
  };

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!activePointers.current.has(e.pointerId)) return;

      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.current.size === 2) {
        const points = [...activePointers.current.values()];
        const currentDist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

        const delta = currentDist / initialDist.current;
        setZoom((z) => Math.min(Math.max(z * delta, min), max));
        initialDist.current = currentDist;
        return;
      }

      if (activePointers.current.size === 1) {
        setPan((p) => ({
          translateX: p.translateX + e.movementX,
          translateY: p.translateY + e.movementY,
        }));
      }
    },
    [min, max]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      activePointers.current.delete(e.pointerId);
      if (activePointers.current.size === 0) {
        setCursor(active ? 'grab' : 'initial');
      }
      if (activePointers.current.size < 2) {
        initialDist.current = 0;
      }
    },
    [active]
  );

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + step, max));
  }, [step, max]);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - step, min));
  }, [step, min]);

  return {
    zoom,
    pan,
    cursor,
    onPointerDown,
    setZoom,
    setPan,
    zoomIn,
    zoomOut,
  };
};
