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
    // Tracks whether --sable-visible-height is currently set so the opening
    // path only fires setCSSVars once (avoids double-setting on repeated
    // resize events while the keyboard is already open).
    let cssVarsSet = false;
    // Timestamp of the last clearCSSVars call. Used to suppress re-setting CSS
    // vars from post-close-animation iOS viewport bounces: after the keyboard
    // fully closes, iOS sometimes emits one or two more viewport.resize events
    // with a residual calculatedHeight (30–80px). Without suppression these
    // events call setCSSVars() with a sub-full-screen viewport.height, leaving
    // --sable-visible-height stuck and producing a persistent bottom gap.
    let recentlyClearedAt = 0;
    // How long to suppress small-calculatedHeight re-sets after a clear.
    const POST_CLEAR_SUPPRESS_MS = 500;
    // Minimum calculatedHeight that overrides the bounce-suppression window.
    // Any value >= this is unambiguously a real keyboard (250 px is far below
    // the smallest real iOS keyboard). Values below this within the suppress
    // window are treated as animation noise and ignored.
    const UNAMBIGUOUS_KEYBOARD_PX = 100;

    const setCSSVars = (viewportHeight: number) => {
      document.documentElement.style.setProperty(
        '--sable-visible-height',
        `${Math.round(viewportHeight)}px`
      );
      document.documentElement.style.setProperty('--sable-safe-bottom', '0px');
      cssVarsSet = true;
    };

    const clearCSSVars = () => {
      document.documentElement.style.removeProperty('--sable-visible-height');
      document.documentElement.style.removeProperty('--sable-safe-bottom');
      cssVarsSet = false;
      recentlyClearedAt = Date.now();
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
      //
      // Bounce-suppression: within POST_CLEAR_SUPPRESS_MS of a clearCSSVars
      // call, only set vars if the calculatedHeight is unambiguously a real
      // keyboard (>= UNAMBIGUOUS_KEYBOARD_PX). This stops post-close-animation
      // iOS viewport noise (typically 30–80 px residual) from re-setting
      // --sable-visible-height to a sub-full-screen value and creating a gap.
      if (!cssVarsSet) {
        const withinSuppressWindow = Date.now() - recentlyClearedAt < POST_CLEAR_SUPPRESS_MS;
        if (!withinSuppressWindow || calculatedHeight >= UNAMBIGUOUS_KEYBOARD_PX) {
          setCSSVars(viewport.height);
        }
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
        savedHeight.current = pendingValue;
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
      savedHeight.current = 0;
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
      if (stabilityTimer) clearTimeout(stabilityTimer);
      viewport.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      clearCSSVars();
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
