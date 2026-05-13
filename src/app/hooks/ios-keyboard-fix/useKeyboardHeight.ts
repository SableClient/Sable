// Vendored from https://github.com/Crscristi28/ios-pwa-keyboard-fix (MIT)
// Replace this import path with 'ios-pwa-keyboard-fix' once published to npm.
import { useEffect, useRef, useState } from 'react';

// Measures iOS keyboard height via the Visual Viewport API and synchronously
// manages the --sable-visible-height / --sable-safe-bottom CSS custom properties
// that control #root layout height.
//
// CSS variables are set/cleared directly inside the event handler (no React
// useEffect) so there is no frame gap between "keyboard closed" being detected
// and the layout reverting to full height. This eliminates the race condition
// where a follow-on viewport.resize event would re-set the variable after the
// React async effect had already removed it, causing a persistent bottom gap.
//
// Stability filter — only commits React state (isKeyboardVisible, keyboardHeight)
// once iOS reports the same viewport height for STABILITY_MS ms. iOS emits
// chaotic transient values during keyboard transitions (text ↔ emoji), so the
// filter prevents those from triggering unnecessary re-renders.
//
// triggerPreLift: called from onMouseDown so Safari sees the textarea as already
// visible and skips its document-scroll prediction.
const STABILITY_MS = 80;

// Module-level state shared across all useKeyboardHeight instances.
// The keyboard height is a device property — it's the same regardless of
// which input has focus. Sharing savedHeight prevents the case where two
// simultaneous RoomInput instances (main timeline + open thread drawer) race
// on keyboard open: the thread instance starts with savedHeight=0 and would
// overwrite the main instance's correct estimate with the wrong mid-animation
// viewport.height.
// mountCount is a reference counter so only the last unmounting instance
// clears the CSS vars (prevents the thread drawer unmounting mid-keyboard-open
// from wiping --sable-visible-height while the main room input still uses it).
let sharedSavedHeight = 0;
let mountCount = 0;
// Whether --sable-visible-height is currently applied. Shared so multiple
// instances see the same state and the "only set once while open" guard works
// across instances.
let cssVarsApplied = false;

export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Mirror state in refs so triggerPreLift sees fresh values from
  // an onMouseDown handler without re-creating the function each render.
  const hasOpenedOnce = useRef(false);
  const isVisibleRef = useRef(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    mountCount += 1;
    let baselineHeight = window.innerHeight;
    let stabilityTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingValue = 0;

    const setCSSVars = (viewportHeight: number) => {
      document.documentElement.style.setProperty(
        '--sable-visible-height',
        `${Math.round(viewportHeight)}px`
      );
      document.documentElement.style.setProperty('--sable-safe-bottom', '0px');
      cssVarsApplied = true;
    };

    const clearCSSVars = () => {
      document.documentElement.style.removeProperty('--sable-visible-height');
      document.documentElement.style.removeProperty('--sable-safe-bottom');
      cssVarsApplied = false;
    };

    const handleResize = () => {
      const calculatedHeight = baselineHeight - viewport.height;

      // Keyboard closing — act immediately, no stability wait.
      // clearCSSVars() runs synchronously here, before React schedules any
      // re-render, so there is no window in which a follow-on resize event
      // can observe the variable as missing and incorrectly re-set it.
      if (calculatedHeight < 30) {
        if (stabilityTimer) {
          clearTimeout(stabilityTimer);
          stabilityTimer = null;
        }
        clearCSSVars();
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
        isVisibleRef.current = false;
        return;
      }

      // Keyboard opening / open.
      // On the very first resize that signals a keyboard, immediately shrink
      // the layout (before the stability gate) so the input bar rises before
      // iOS applies its own scroll-prediction pass.
      // Use the previously-measured keyboard height as the estimate so the
      // immediate and stability-timer setCSSVars calls land on the same pixel
      // value — eliminating the second layout change that causes visible
      // timeline stutter during the keyboard animation.
      if (!cssVarsApplied) {
        const estimatedViewportHeight =
          sharedSavedHeight > 0 ? baselineHeight - sharedSavedHeight : viewport.height;
        setCSSVars(estimatedViewportHeight);
      }

      // Cancel any document scroll iOS may have applied as scroll-prediction.
      if (window.scrollY !== 0) {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      }

      // Wait for the height to settle. Each resize within STABILITY_MS
      // restarts the timer, so transient mid-transition readings never
      // commit — only the final settled value does.
      pendingValue = calculatedHeight;
      if (stabilityTimer) clearTimeout(stabilityTimer);
      stabilityTimer = setTimeout(() => {
        sharedSavedHeight = pendingValue;
        hasOpenedOnce.current = true;
        isVisibleRef.current = true;
        setCSSVars(viewport.height); // refine to final settled viewport height
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
      sharedSavedHeight = 0;
      hasOpenedOnce.current = false;
      isVisibleRef.current = false;
      clearCSSVars();
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
      mountCount -= 1;
      if (stabilityTimer) clearTimeout(stabilityTimer);
      viewport.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      // Only clear CSS vars when the last instance unmounts — prevents the thread
      // drawer unmounting mid-keyboard-open from wiping the variable while the
      // main room's RoomInput still has the keyboard open.
      if (mountCount === 0) clearCSSVars();
    };
  }, []);

  // Pre-lift: called from onMouseDown, BEFORE focus event fires.
  // Only acts if the keyboard is currently open — otherwise a button
  // tap would lift the bar with no keyboard behind it.
  // Reads from refs so it always sees the latest state, even when
  // captured by an onMouseDown handler that mounted earlier.
  const triggerPreLift = () => {
    if (hasOpenedOnce.current && sharedSavedHeight > 0 && isVisibleRef.current) {
      setKeyboardHeight(sharedSavedHeight);
    }
  };

  return { keyboardHeight, isKeyboardVisible, triggerPreLift };
}
