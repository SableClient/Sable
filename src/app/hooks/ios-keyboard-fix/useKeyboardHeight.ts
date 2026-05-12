// Vendored from https://github.com/Crscristi28/ios-pwa-keyboard-fix (MIT)
// Replace this import path with 'ios-pwa-keyboard-fix' once published to npm.
import { useEffect, useRef, useState } from 'react';

// Measures iOS keyboard height via the Visual Viewport API.
// Stability filter — only commits a height when iOS reports the same
// value for STABILITY_MS. iOS emits chaotic transient values during
// keyboard transitions (text ↔ emoji); waiting for the value to settle
// filters those out without a hardcoded whitelist of device heights.
//
// triggerPreLift lifts the bar to the last known height in onMouseDown,
// before focus, so Safari sees the textarea as already visible and
// skips its document-scroll prediction.
const STABILITY_MS = 80;

export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Mirror state in refs so triggerPreLift sees fresh values from
  // an onMouseDown handler without re-creating the function each render.
  const savedHeight = useRef(0);
  const hasOpenedOnce = useRef(false);
  const isVisibleRef = useRef(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    let baselineHeight = window.innerHeight;
    let stabilityTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingValue = 0;

    const handleResize = () => {
      const calculatedHeight = baselineHeight - viewport.height;

      // Closing the keyboard — react instantly, no stability check
      if (calculatedHeight < 30) {
        if (stabilityTimer) {
          clearTimeout(stabilityTimer);
          stabilityTimer = null;
        }
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
        isVisibleRef.current = false;
        return;
      }

      // Wait for the value to settle. Each new resize within STABILITY_MS
      // restarts the timer, so transient mid-transition readings never
      // commit — only the value iOS finally lands on does.
      pendingValue = calculatedHeight;
      if (stabilityTimer) clearTimeout(stabilityTimer);
      stabilityTimer = setTimeout(() => {
        savedHeight.current = pendingValue;
        hasOpenedOnce.current = true;
        isVisibleRef.current = true;
        setKeyboardHeight(pendingValue);
        setIsKeyboardVisible(true);
      }, STABILITY_MS);
    };

    // Orientation change resets everything — keyboard heights measured
    // in portrait don't apply in landscape and vice versa. Drop saved
    // state and start fresh; the next focus will re-measure.
    const handleOrientationChange = () => {
      if (stabilityTimer) {
        clearTimeout(stabilityTimer);
        stabilityTimer = null;
      }
      pendingValue = 0;
      savedHeight.current = 0;
      hasOpenedOnce.current = false;
      isVisibleRef.current = false;
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
      // Re-baseline after iOS settles the new layout.
      setTimeout(() => {
        baselineHeight = window.innerHeight;
      }, 200);
    };

    viewport.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    return () => {
      if (stabilityTimer) clearTimeout(stabilityTimer);
      viewport.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  // Pre-lift: called from onMouseDown, BEFORE focus event fires.
  // Only acts if the keyboard is currently open — otherwise a button
  // tap would lift the bar with no keyboard behind it.
  // Reads from refs so it always sees the latest state, even when
  // captured by an onMouseDown handler that mounted earlier.
  const triggerPreLift = () => {
    if (hasOpenedOnce.current && savedHeight.current > 0 && isVisibleRef.current) {
      setKeyboardHeight(savedHeight.current);
    }
  };

  return { keyboardHeight, isKeyboardVisible, triggerPreLift };
}
