import { useState, useCallback, useRef, useEffect } from 'react';
import { useElementSizeObserver } from './useElementSizeObserver';

interface Vector2 {
  x: number;
  y: number;
}

type FittedSwipeOptions = {
  onDismiss?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
};

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

export const useImageGestures = (
  active: boolean,
  step = 0.2,
  min = 0.1,
  max = 500,
  fittedSwipeOptions?: FittedSwipeOptions
) => {
  const [transforms, setTransforms] = useState({
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
  const imageRef = useRef<HTMLImageElement | HTMLCanvasElement | null>(null);

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

  const activePointers = useRef(new Map());
  const initialDist = useRef(0);
  const lastTapRef = useRef(0);
  const fittedSwipeRef = useRef<{
    startX: number;
    startY: number;
    direction?: 'horizontal' | 'vertical';
  }>();
  const fittedSwipeOptionsRef = useRef(fittedSwipeOptions);
  fittedSwipeOptionsRef.current = fittedSwipeOptions;

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
      if (activePointers.current.size === 1 && Math.abs(transforms.zoom - fitRatio) < 0.01) {
        fittedSwipeRef.current = { startX: e.clientX, startY: e.clientY };
      }
      setCursor('grabbing');

      // Initialize pinch zoom
      if (activePointers.current.size === 2) {
        fittedSwipeRef.current = undefined;
        const points = Array.from(activePointers.current.values());
        initialDist.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      }
    },
    [active, disableResizeWithWindow, fitRatio, prepareForTransform, transforms.zoom]
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
        const fittedSwipe = fittedSwipeRef.current;
        if (fittedSwipe) {
          const deltaX = e.clientX - fittedSwipe.startX;
          const deltaY = e.clientY - fittedSwipe.startY;
          if (!fittedSwipe.direction && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 12) {
            fittedSwipe.direction = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
          }
          return;
        }
        setPan((p) => ({
          x: p.x + e.movementX,
          y: p.y + e.movementY,
        }));
      }
    },
    [setZoom, min, max, setPan]
  );

  const releasePointer = useCallback(
    (e: PointerEvent, cancelled: boolean) => {
      const fittedSwipe = fittedSwipeRef.current;
      if (fittedSwipe && !cancelled && activePointers.current.size === 1) {
        const deltaX = e.clientX - fittedSwipe.startX;
        const deltaY = e.clientY - fittedSwipe.startY;
        const options = fittedSwipeOptionsRef.current;
        if (fittedSwipe.direction === 'vertical' && deltaY > 96) options?.onDismiss?.();
        if (fittedSwipe.direction === 'horizontal' && Math.abs(deltaX) > 72) {
          if (deltaX > 0) options?.onPrevious?.();
          else options?.onNext?.();
        }
      }
      activePointers.current.delete(e.pointerId);
      if (activePointers.current.size === 0) {
        fittedSwipeRef.current = undefined;
        setCursor(active ? 'grab' : 'initial');
      }
      if (activePointers.current.size < 2) {
        initialDist.current = 0;
      }
    },
    [active]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => releasePointer(e, false),
    [releasePointer]
  );
  const handlePointerCancel = useCallback(
    (e: PointerEvent) => releasePointer(e, true),
    [releasePointer]
  );

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [handlePointerMove, handlePointerUp, handlePointerCancel]);

  // When the size of the container changes, zoom without a transition.
  const handleContainerResize = useCallback(
    (width: number, height: number) => {
      const img = imageRef.current;
      if (
        !img || // Image not loaded
        !shouldResizeWithWindowRef.current || // Resizing disabled
        !(img instanceof HTMLCanvasElement ? img.width : img.naturalWidth) ||
        !(img instanceof HTMLCanvasElement ? img.height : img.naturalHeight) // Invalid dimensions
      ) {
        return;
      }
      const imageHeight = img instanceof HTMLCanvasElement ? img.height : img.naturalHeight;
      const imageWidth = img instanceof HTMLCanvasElement ? img.width : img.naturalWidth;
      const heightRatio = height / imageHeight;
      const widthRatio = width / imageWidth;
      const fitZoom = Math.min(heightRatio, widthRatio);

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

  const handleImageDimensions = useCallback(
    (width: number, height: number) => {
      const container = containerRef.current;
      if (!container || width <= 0 || height <= 0) return;

      const heightRatio = container.clientHeight / height;
      const widthRatio = container.clientWidth / width;
      const fitZoom = Math.min(heightRatio, widthRatio, 1);

      setFitRatio(fitZoom);
      updateZoom(fitZoom);
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
    handleImageDimensions,
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
