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

  const activePointers = useRef(new Map<number, Vector2>());
  const pendingPan = useRef({ x: 0, y: 0 });
  const gestureFrame = useRef(0);
  const pinchRef = useRef<
    | {
        startDist: number;
        startZoom: number;
        startPan: Vector2;
        startCenter: Vector2;
        origin: Vector2;
      }
    | undefined
  >(undefined);
  const didPinchRef = useRef(false);
  const transformsRef = useRef(transforms);
  transformsRef.current = transforms;
  const lastTapRef = useRef(0);
  const fittedSwipeRef = useRef<
    | {
        startX: number;
        startY: number;
        direction?: 'horizontal' | 'vertical';
      }
    | undefined
  >(undefined);
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

  const beginPinch = useCallback(() => {
    const points = Array.from(activePointers.current.values());
    if (points.length < 2) return;
    const [a, b] = points as [Vector2, Vector2];
    const startDist = Math.hypot(a.x - b.x, a.y - b.y);
    if (!startDist) return;

    const rect = containerRef.current?.getBoundingClientRect();
    const origin = rect
      ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      : { x: 0, y: 0 };
    pinchRef.current = {
      startDist,
      startZoom: transformsRef.current.zoom,
      startPan: transformsRef.current.pan,
      startCenter: { x: (a.x + b.x) / 2 - origin.x, y: (a.y + b.y) / 2 - origin.y },
      origin,
    };
    pendingPan.current = { x: 0, y: 0 };
    didPinchRef.current = true;
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
          beginPinch();
          return;
        }

        const container = target.parentElement ?? target;
        const containerRect = container.getBoundingClientRect();
        setTransforms((prev) => {
          if (Math.abs(prev.zoom - fitRatio) > 0.01 || prev.pan.x !== 0 || prev.pan.y !== 0) {
            return { zoom: fitRatio, pan: { x: 0, y: 0 } };
          }

          // pan using the pointer's offset relative to the center of the image
          const offset = getCursorOffsetFromImageCenter(e, containerRect, prev.pan);
          return {
            zoom: fitRatio * 2,
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
      if (activePointers.current.size === 1 && transforms.zoom <= fitRatio + 0.01) {
        fittedSwipeRef.current = { startX: e.clientX, startY: e.clientY };
      }
      setCursor('grabbing');

      // Initialize pinch zoom
      if (activePointers.current.size === 2) {
        fittedSwipeRef.current = undefined;
        beginPinch();
      }
    },
    [active, beginPinch, disableResizeWithWindow, fitRatio, prepareForTransform, transforms.zoom]
  );

  const applyTransforms = useCallback((next: { zoom: number; pan: Vector2 }) => {
    // Gestures read back what they just wrote, so the ref leads the state.
    transformsRef.current = next;
    setTransforms(next);
  }, []);

  const flushGesture = useCallback(() => {
    gestureFrame.current = 0;
    const pinch = pinchRef.current;

    if (pinch && activePointers.current.size >= 2) {
      const [a, b] = Array.from(activePointers.current.values()) as [Vector2, Vector2];
      const zoom = Math.min(
        Math.max((Math.hypot(a.x - b.x, a.y - b.y) / pinch.startDist) * pinch.startZoom, min),
        max
      );
      const factor = zoom / pinch.startZoom;
      // Pins the midpoint between the fingers as the zoom changes.
      const center = {
        x: (a.x + b.x) / 2 - pinch.origin.x,
        y: (a.y + b.y) / 2 - pinch.origin.y,
      };
      applyTransforms({
        zoom,
        pan: {
          x: center.x - (pinch.startCenter.x - pinch.startPan.x) * factor,
          y: center.y - (pinch.startCenter.y - pinch.startPan.y) * factor,
        },
      });
      return;
    }

    const { x, y } = pendingPan.current;
    pendingPan.current = { x: 0, y: 0 };
    if (x === 0 && y === 0) return;
    const prev = transformsRef.current;
    applyTransforms({ zoom: prev.zoom, pan: { x: prev.pan.x + x, y: prev.pan.y + y } });
  }, [min, max, applyTransforms]);

  const scheduleGesture = useCallback(() => {
    if (gestureFrame.current) return;
    gestureFrame.current = requestAnimationFrame(flushGesture);
  }, [flushGesture]);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const previous = activePointers.current.get(e.pointerId);
      if (!previous) return;

      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Off for the whole gesture, or every frame chases the css tween.
      const img = imageRef.current;
      if (img) img.style.transition = 'none';

      // Pinch zoom
      if (activePointers.current.size === 2) {
        if (!pinchRef.current) beginPinch();
        scheduleGesture();
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
        // movementX/Y is unreliable for touch pointers.
        pendingPan.current.x += e.clientX - previous.x;
        pendingPan.current.y += e.clientY - previous.y;
        scheduleGesture();
      }
    },
    [beginPinch, scheduleGesture]
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
      if (activePointers.current.size < 2) {
        pinchRef.current = undefined;
      }
      if (activePointers.current.size === 0) {
        fittedSwipeRef.current = undefined;
        setCursor(active ? 'grab' : 'initial');
        if (gestureFrame.current) {
          cancelAnimationFrame(gestureFrame.current);
          flushGesture();
        }
        const img = imageRef.current;
        if (img) img.style.transition = '';

        if (didPinchRef.current && transformsRef.current.zoom < fitRatio - 0.01) {
          applyTransforms({ zoom: fitRatio, pan: { x: 0, y: 0 } });
          enableResizeWithWindow();
        }
        didPinchRef.current = false;
      }
    },
    [active, applyTransforms, enableResizeWithWindow, fitRatio, flushGesture]
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
      if (gestureFrame.current) cancelAnimationFrame(gestureFrame.current);
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
