import { useEffect, useRef } from 'react';
import type { MatrixClient } from '$types/matrix-sdk';
import { RoomEvent } from '$types/matrix-sdk';
import { getSlidingSyncManager } from '$client/initMatrix';
import { mobileOrTablet } from '$utils/user-agent';

const PULL_THRESHOLD = 72; // px of overscroll needed to trigger refresh
const MAX_PULL = 120; // px cap for visual rubber-band effect

/**
 * Attach a pull-to-refresh gesture to a scroll container on mobile.
 *
 * When the user pulls down from the very top of the list, a CSS transform
 * is applied to the container for visual feedback. On release, if the pull
 * exceeded PULL_THRESHOLD, `mx.retryImmediately()` and
 * `SlidingSyncManager.retryNow()` are called to force a network re-sync.
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

    const doRefresh = () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;

      mx.retryImmediately();
      getSlidingSyncManager(mx)?.retryNow();

      // Rebuild timelines for every room that currently has a RoomTimeline
      // mounted.  For rooms without an active subscriber this is a no-op.
      // Rooms that received a server-side TimelineReset will already rebuild
      // via the SDK event; this covers the case where the sync response has
      // no gap (limited: false) but the user still wants fresh React state.
      mx.getRooms().forEach((room) => {
        room.emit(RoomEvent.TimelineRefresh, room, room.getUnfilteredTimelineSet());
      });

      // Brief delay so the spinner is visible before snapping back.
      setTimeout(() => {
        refreshingRef.current = false;
        el.style.transform = '';
        el.style.transition = '';
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
        // Insufficient pull — just snap back.
        el.style.transition = 'transform 0.2s ease';
        el.style.transform = '';
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
    };
  }, [scrollRef, mx]);
}
