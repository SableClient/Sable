import { useState, useCallback, useRef, useEffect } from 'react';
import { useElementSizeObserver } from './useElementSizeObserver';

interface Vector2 {
  x: number;
  y: number;
}

interface Transforms {
  zoom: number;
  pan: Vector2;
}

// calculate pointer position relative to the image center
//
// use container rect & manually apply transforms as if we get two+ events quickly,
// the second one might use an outdated image rect (before new transforms are applied)
function getCursorOffsetFromImageCenter(
  event: React.MouseEvent,
  containerRect: DOMRect,
  pan: Vector2
): Vector2 {
  return {
    x: containerRect.width / 2 - (event.clientX - containerRect.x - pan.x),
    y: containerRect.height / 2 - (event.clientY - containerRect.y - pan.y),
  };
}

export const useImageGestures = (active: boolean, step = 0.2, min = 0.1, max = 5) => {
  const [transforms, setTransforms] = useState<Transforms>({
    zoom: 1,
    pan: { x: 0, y: 0 },
  });
  const [cursor, setCursor] = useState<'grab' | 'grabbing' | 'initial'>(
    active ? 'grab' : 'initial'
  );
  const [shouldResizeWithWindow, setShouldResizeWithWindowState] = useState(true);
  const shouldResizeWithWindowRef = useRef(true);
  const [fitRatio, setFitRatio] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const setShouldResizeWithWindow = useCallback((next: boolean) => {
    shouldResizeWithWindowRef.current = next;
    setShouldResizeWithWindowState(next);
  }, []);

  const enableResizeWithWindow = useCallback(
    () => setShouldResizeWithWindow(true),
    [setShouldResizeWithWindow]
  );
  const disableResizeWithWindow = useCallback(
    () => setShouldResizeWithWindow(false),
    [setShouldResizeWithWindow]
  );

  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const initialDist = useRef<number>(0);
  const lastTapRef = useRef<number>(0);

  const prepareForTransform = useCallback(() => {
    const img = imageRef.current;
    if (img) {
      img.style.transition = '';
    }
  }, []);

  const updateZoom = useCallback((next: number | ((prev: number) => number)) => {
    setTransforms((prev) => {
      if (typeof next === 'function') {
        return {
          ...prev,
          zoom: next(prev.zoom),
        };
      }
      return {
        ...prev,
        zoom: next,
      };
    });
  }, []);

  const setZoom = useCallback(
    (next: number | ((prev: number) => number)) => {
      disableResizeWithWindow();
      prepareForTransform();
      updateZoom(next);
    },
    [disableResizeWithWindow, prepareForTransform, updateZoom]
  );

  const setZoomSilently = useCallback(
    (next: number | ((prev: number) => number)) => {
      prepareForTransform();
      updateZoom(next);
    },
    [prepareForTransform, updateZoom]
  );

  const setPan = useCallback((next: Vector2 | ((prev: Vector2) => Vector2)) => {
    setTransforms((prev) => {
      if (typeof next === 'function') {
        return {
          ...prev,
          pan: next(prev.pan),
        };
      }
      return {
        ...prev,
        pan: next,
      };
    });
  }, []);

  const resetTransforms = useCallback(() => {
    setTransforms({ zoom: 1, pan: { x: 0, y: 0 } });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!active || (e.pointerType === 'mouse' && e.button === 2)) return;

      disableResizeWithWindow();
      prepareForTransform();
      e.stopPropagation();
      const target = e.target as HTMLElement;
      target.setPointerCapture(e.pointerId);

      // Double click zoom
      const now = Date.now();
      if (now - lastTapRef.current < 300 && now - lastTapRef.current > 30) {
        // If two cursors are active, this isn't a double click.
        if (activePointers.current.size === 2) {
          const points = Array.from(activePointers.current.values());
          initialDist.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
          return;
        }

        const container = target.parentElement ?? target;
        const containerRect = container.getBoundingClientRect();
        setTransforms((prev) => {
          if (prev.zoom !== 1) {
            return { zoom: 1, pan: { x: 0, y: 0 } };
          }

          // pan using the pointer's offset relative to the center of the image
          const offset = getCursorOffsetFromImageCenter(e, containerRect, prev.pan);
          return {
            zoom: 2,
            pan: {
              x: offset.x + prev.pan.x,
              y: offset.y + prev.pan.y,
            },
          };
        });
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setCursor('grabbing');

      // Initialize pinch zoom
      if (activePointers.current.size === 2) {
        const points = Array.from(activePointers.current.values());
        initialDist.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      }
    },
    [active, disableResizeWithWindow, prepareForTransform]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!activePointers.current.has(e.pointerId)) return;

      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Disable transitions for responsive movement
      if (e.target instanceof HTMLElement) {
        e.target.style.transition = 'none';
      }

      // Pinch zoom
      if (activePointers.current.size === 2) {
        const points = Array.from(activePointers.current.values());
        const currentDist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

        const delta = currentDist / initialDist.current;
        setZoom((z) => Math.min(Math.max(z * delta, min), max));
        initialDist.current = currentDist;
        return;
      }

      // Pan
      if (activePointers.current.size === 1) {
        setPan((p) => ({
          x: p.x + e.movementX,
          y: p.y + e.movementY,
        }));
      }
    },
    [setZoom, min, max, setPan]
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

  // When the size of the container changes, zoom without a transition.
  const handleContainerResize = useCallback(
    (width: number, height: number) => {
      const img = imageRef.current;
      if (
        !img || // Image not loaded
        !shouldResizeWithWindowRef.current || // Resizing disabled
        !img.naturalWidth ||
        !img.naturalHeight // Invalid image dimensions
      ) {
        return;
      }
      const heightRatio = height / img.naturalHeight;
      const widthRatio = width / img.naturalWidth;
      const fitZoom = Math.min(heightRatio, widthRatio, 1);

      img.style.transition = 'none';
      setFitRatio(fitZoom);
      updateZoom(fitZoom);
      setTimeout(() => {
        img.style.transition = '';
      }, 15);
    },
    [updateZoom]
  );

  useElementSizeObserver(() => containerRef.current, handleContainerResize);

  const handleImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const img = event.currentTarget;
      imageRef.current = img;

      const container = containerRef.current;
      if (!container) return;

      const imgHeight = img.naturalHeight;
      const imgWidth = img.naturalWidth;
      const containerHeight = container.clientHeight || 0;
      const containerWidth = container.clientWidth || 0;

      const heightRatio = containerHeight / imgHeight;
      const widthRatio = containerWidth / imgWidth;
      const fitZoom = Math.min(heightRatio, widthRatio, 1);

      img.style.transition = 'none';
      setFitRatio(fitZoom);
      updateZoom(fitZoom);
      setTimeout(() => {
        img.style.transition = '';
      }, 15);
    },
    [updateZoom]
  );

  const zoomIn = useCallback(() => {
    disableResizeWithWindow();
    prepareForTransform();
    setTransforms((prev) => {
      const newZoom = Math.min(prev.zoom * (1 + step), max);
      const zoomMult = newZoom / prev.zoom;

      return {
        zoom: newZoom,
        pan: {
          x: prev.pan.x * zoomMult,
          y: prev.pan.y * zoomMult,
        },
      };
    });
  }, [step, max, disableResizeWithWindow, prepareForTransform]);

  const zoomOut = useCallback(() => {
    disableResizeWithWindow();
    prepareForTransform();
    setTransforms((prev) => {
      const newZoom = Math.min(prev.zoom / (1 + step), max);
      const zoomMult = newZoom / prev.zoom;

      return {
        zoom: newZoom,
        pan: {
          x: prev.pan.x * zoomMult,
          y: prev.pan.y * zoomMult,
        },
      };
    });
  }, [step, max, disableResizeWithWindow, prepareForTransform]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      const { deltaY } = e;
      // Mouse wheel scrolls only by integer delta values, therefore
      // If deltaY is an integer, then it's a mouse wheel action
      if (!Number.isInteger(deltaY)) {
        // If it's not an integer, then it's a touchpad action, do nothing and let the browser handle the zooming
        return;
      }

      disableResizeWithWindow();
      prepareForTransform();

      // the wheel handler is attached to the container element, not the image
      const containerRect = e.currentTarget.getBoundingClientRect();

      setTransforms((prev) => {
        // calculate multiplicative zoom
        const newZoom =
          deltaY < 0
            ? Math.min(prev.zoom * (1 + step), max)
            : Math.max(prev.zoom / (1 + step), min);
        const zoomMult = newZoom / prev.zoom - 1;

        // calculate pointer position relative to the image center
        //
        // manually apply transforms as if we get two+ wheel events quickly,
        // the second one might use an outdated image rect (before new transforms are applied)
        const offset = getCursorOffsetFromImageCenter(e, containerRect, prev.pan);

        return {
          zoom: newZoom,
          // magic math that happens to do what i want it to do
          pan: {
            x: offset.x * zoomMult + prev.pan.x,
            y: offset.y * zoomMult + prev.pan.y,
          },
        };
      });
    },
    [max, min, step, disableResizeWithWindow, prepareForTransform]
  );

  return {
    transforms,
    cursor,
    onPointerDown,
    handleWheel,
    handleImageLoad,
    setZoom,
    setZoomSilently,
    setPan,
    setTransforms,
    resetTransforms,
    zoomIn,
    zoomOut,
    fitRatio,
    imageRef,
    containerRef,
    shouldResizeWithWindow,
    shouldResizeWithWindowRef,
    enableResizeWithWindow,
    disableResizeWithWindow,
  };
};
