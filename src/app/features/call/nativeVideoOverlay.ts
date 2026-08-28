import { useEffect, useRef } from 'react';
import {
  clearNativeCallLocalVideoOverlay,
  clearNativeCallRemoteVideoOverlay,
  setNativeCallLocalVideoOverlay,
  setNativeCallRemoteVideoOverlay,
} from '@sableclient/tauri-plugin-livekit-mobile';

export type OverlayTarget = {
  participantIdentity: string;
  trackId: string;
};

/** Detect overlays that do not change the slot's geometry. */
export function nativeSlotOccluded(slotNode: HTMLDivElement, rect: DOMRect): boolean {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return true;
  const topElement = document.elementFromPoint(cx, cy);
  return topElement === null || (topElement !== slotNode && !slotNode.contains(topElement));
}

export type OverlayGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
};

export function useNativeVideoOverlay(
  callId: string,
  active: boolean,
  slotNode: HTMLDivElement | null,
  set: (callId: string, geometry: OverlayGeometry) => Promise<unknown>,
  clear: (callId: string) => Promise<unknown>
): void {
  const bridgeRef = useRef({ set, clear });
  bridgeRef.current = { set, clear };

  useEffect(() => {
    if (!active || !slotNode) return undefined;

    let lastGeometryKey = '';
    const report = () => {
      // Never tear down the overlay while the page is hidden (e.g. PiP owns the
      // layer during backgrounding).
      if (document.visibilityState !== 'visible') return;
      const rect = slotNode.getBoundingClientRect();
      // Slot hidden, outside the viewport (display:none page, scrolled away), or
      // occluded by an overlaying page/drawer: hide the native overlay too,
      // otherwise it stays painted at a stale position over unrelated content.
      const hidden =
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.right < 0 ||
        rect.bottom < 0 ||
        rect.left > window.innerWidth ||
        rect.top > window.innerHeight ||
        nativeSlotOccluded(slotNode, rect);
      if (hidden) {
        if (lastGeometryKey !== '') {
          lastGeometryKey = '';
          void bridgeRef.current.clear(callId).catch(() => undefined);
        }
        return;
      }
      const geometryKey = `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}`;
      if (geometryKey === lastGeometryKey) return;
      lastGeometryKey = geometryKey;
      void bridgeRef.current
        .set(callId, {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          devicePixelRatio: window.devicePixelRatio || 1,
        })
        .catch(() => undefined);
    };

    report();
    const resizeObserver = new ResizeObserver(report);
    resizeObserver.observe(slotNode);
    // Fires during slide transitions (transforms move the slot without any
    // scroll/resize event), which is how recovery after a room change works.
    const intersectionObserver = new IntersectionObserver(report, {
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });
    intersectionObserver.observe(slotNode);
    window.addEventListener('resize', report);
    // Scroll is the dominant rect-changing event: any nested scroll container
    // moves the slot without resizing it. Capture phase reaches scrolls from
    // nested containers, which don't bubble.
    document.addEventListener('scroll', report, { capture: true, passive: true });
    const mutationObserver = new MutationObserver(report);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener('resize', report);
      document.removeEventListener('scroll', report, { capture: true });
      mutationObserver.disconnect();
    };
  }, [callId, active, slotNode]);

  // No eligible target (camera muted/unpublished, reconnecting, error): the
  // overlay must not linger over the tile grid.
  useEffect(() => {
    if (active) return;
    void bridgeRef.current.clear(callId).catch(() => undefined);
  }, [callId, active]);

  useEffect(
    () => () => {
      // Unmount safety: a stale callId is a native no-op.
      void bridgeRef.current.clear(callId).catch(() => undefined);
    },
    [callId]
  );
}

export const setRemoteOverlay = (
  target: OverlayTarget,
  callId: string,
  geometry: OverlayGeometry
): Promise<unknown> => setNativeCallRemoteVideoOverlay({ callId, ...target, ...geometry });

export const clearRemoteOverlay = (callId: string): Promise<unknown> =>
  clearNativeCallRemoteVideoOverlay({ callId });

export const setLocalOverlay = (callId: string, geometry: OverlayGeometry): Promise<unknown> =>
  setNativeCallLocalVideoOverlay({ callId, ...geometry });

export const clearLocalOverlay = (callId: string): Promise<unknown> =>
  clearNativeCallLocalVideoOverlay({ callId });
