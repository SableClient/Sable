import { useEffect, useRef } from 'react';
import type { MatrixClient } from '$types/matrix-sdk';
import { getSlidingSyncManager } from '$client/initMatrix';
import { mobileOrTablet } from '$utils/user-agent';

const PULL_THRESHOLD = 72; // px of overscroll needed to trigger refresh
const MAX_PULL = 120; // px cap for visual rubber-band effect

// Indicator size + gap from the safe-area edge (px).
const INDICATOR_SIZE = 40;
const INDICATOR_GAP = 10;

// SVGs for the two indicator states.
const ARROW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;transition:transform 0.15s ease"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;
const SPINNER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="display:block;animation:sable-ptr-spin 0.7s linear infinite"><path d="M12 2a10 10 0 1 0 10 10"/></svg>`;

/** Inject the spin keyframe once into the document. */
function ensurePTRStyles(): void {
  if (document.getElementById('sable-ptr-styles')) return;
  const s = document.createElement('style');
  s.id = 'sable-ptr-styles';
  s.textContent = `@keyframes sable-ptr-spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(s);
}

/** Create the fixed-position circular indicator element. */
function createIndicator(): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('role', 'status');
  Object.assign(el.style, {
    position: 'fixed',
    // Sit just below the device safe-area (notch / dynamic island).
    top: `calc(env(safe-area-inset-top, 0px) + ${INDICATOR_GAP}px)`,
    left: '50%',
    // Start off-screen above; brought into view during pull.
    transform: `translate(-50%, -${INDICATOR_SIZE + INDICATOR_GAP + 4}px)`,
    zIndex: '9998',
    width: `${INDICATOR_SIZE}px`,
    height: `${INDICATOR_SIZE}px`,
    borderRadius: '50%',
    background: 'var(--sable-surface-container, #fff)',
    color: 'var(--sable-surface-on-container, #000)',
    border: '1px solid var(--sable-surface-container-line, rgba(0,0,0,0.1))',
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    willChange: 'transform',
    transition: 'none',
  });
  el.innerHTML = ARROW_SVG;
  return el;
}

/**
 * Attach a pull-to-refresh gesture to a scroll container on mobile.
 *
 * When the user pulls down from the very top of the list, a CSS transform
 * is applied to the container for visual feedback, and a circular indicator
 * slides into view. On release, if the pull exceeded PULL_THRESHOLD,
 * `mx.retryImmediately()` and `SlidingSyncManager.retryNow()` are called to
 * force a network re-sync.
 */
export function usePullToRefresh(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  mx: MatrixClient
) {
  // Mutable refs so event handlers always see the latest values without
  // causing re-attachment of listeners.
  const startYRef = useRef<number | null>(null);
  const pullDistRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    // Only activate on actual mobile / tablet devices.
    if (!mobileOrTablet()) return;

    const el = scrollRef.current;
    if (!el) return;

    ensurePTRStyles();
    const indicator = createIndicator();
    document.body.appendChild(indicator);

    /** Move the indicator to match the current pull ratio (0–1). */
    const updateIndicator = (ratio: number) => {
      // Translate from fully hidden (-size px) to fully visible (0px).
      const hidden = -(INDICATOR_SIZE + INDICATOR_GAP + 4);
      const translateY = hidden + ratio * (INDICATOR_SIZE + INDICATOR_GAP + 4);
      indicator.style.transform = `translate(-50%, ${translateY}px)`;

      // Rotate arrow: 0° at start → 180° at threshold (points up = "release").
      const arrowSvg = indicator.querySelector('svg');
      if (arrowSvg) {
        (arrowSvg as SVGElement).style.transform = `rotate(${ratio * 180}deg)`;
      }
    };

    const showRefreshing = () => {
      indicator.innerHTML = SPINNER_SVG;
      indicator.style.transform = 'translate(-50%, 0px)';
    };

    const hideIndicator = () => {
      indicator.style.transition = 'transform 0.25s ease';
      indicator.style.transform = `translate(-50%, -${INDICATOR_SIZE + INDICATOR_GAP + 4}px)`;
      // Restore arrow after it has slid out of view.
      setTimeout(() => {
        indicator.innerHTML = ARROW_SVG;
        indicator.style.transition = 'none';
      }, 250);
    };

    const doRefresh = () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;

      showRefreshing();

      // Temporarily clear all active room subscriptions so the server sees
      // an empty-subscription request.  On the following cycle, subscriptions
      // are restored and the server returns initial:true for each room,
      // triggering a clean timeline reset with proper backward-pagination
      // tokens.  This recovers from stale or out-of-order in-memory timelines
      // that a normal delta sync cannot fix.
      getSlidingSyncManager(mx)?.scheduleForceReset();

      // Brief delay so the spinner is visible before snapping back.
      setTimeout(() => {
        refreshingRef.current = false;
        el.style.transform = '';
        el.style.transition = '';
        hideIndicator();
      }, 800);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop !== 0) return;
      const touch = e.touches[0];
      if (!touch) return;
      startYRef.current = touch.clientY;
      pullDistRef.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null) return;
      // Re-check in case the user scrolled after touch started.
      if (el.scrollTop !== 0) {
        startYRef.current = null;
        return;
      }

      const touch = e.touches[0];
      if (!touch) return;
      const delta = touch.clientY - startYRef.current;
      if (delta <= 0) return;

      // Prevent the browser from scrolling while we handle the pull.
      e.preventDefault();

      // Rubber-band: resistance increases as pull grows.
      const capped = Math.min(delta * 0.5, MAX_PULL);
      pullDistRef.current = capped;

      el.style.transition = 'none';
      el.style.transform = `translateY(${capped}px)`;

      // Update indicator position and arrow rotation.
      indicator.style.transition = 'none';
      updateIndicator(Math.min(capped / PULL_THRESHOLD, 1));
    };

    const onTouchEnd = () => {
      if (startYRef.current === null) return;
      startYRef.current = null;

      const dist = pullDistRef.current;
      pullDistRef.current = 0;

      if (dist >= PULL_THRESHOLD / 2) {
        // Sufficient pull — trigger refresh and animate back.
        el.style.transition = 'transform 0.25s ease';
        el.style.transform = '';
        doRefresh();
      } else {
        // Insufficient pull — snap everything back.
        el.style.transition = 'transform 0.2s ease';
        el.style.transform = '';
        hideIndicator();
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    // passive: false is required so we can call preventDefault() in touchmove.
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      // Clean up any lingering inline styles.
      el.style.transform = '';
      el.style.transition = '';
      document.body.removeChild(indicator);
    };
  }, [scrollRef, mx]);
}
