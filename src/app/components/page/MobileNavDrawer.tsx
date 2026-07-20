import type { ReactNode } from 'react';
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { useAtomValue, useSetAtom } from 'jotai';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { lastVisitedRoomAtom } from '$state/room/lastRoom';
import {
  DIRECT_PATH,
  DIRECT_ROOM_PATH,
  EXPLORE_PATH,
  HOME_PATH,
  HOME_ROOM_PATH,
  INBOX_PATH,
  SPACE_PATH,
  SPACE_ROOM_PATH,
} from '$pages/paths';
import { resolveSection } from '$pages/pathUtils';
import { haptic } from '$utils/haptics';
import { isRoomAlias, isRoomId } from '$utils/matrix';
import { PersistentRoomHost } from './PersistentRoomHost';

const SLIDE_MS = 300;
const SLIDE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const OPEN_FRACTION = 0.35;
const VELOCITY_THRESHOLD = 0.4;
const DIRECTION_DEADZONE = 10;

type MobileNavDrawerProps = {
  nav: ReactNode;
  rail?: ReactNode;
  bottomNav?: ReactNode;
  children: ReactNode;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** Sliding mobile drawer: the list and active room are adjacent panels; dragging
 * reveals the list and commits the route on release. */
export function MobileNavDrawer({ nav, rail, bottomNav, children }: MobileNavDrawerProps) {
  const [mobileGestures] = useSetting(settingsAtom, 'mobileGestures');
  const reduceMotion = useReducedMotion();
  const location = useLocation();
  const navigate = useNavigate();
  const setLastRoom = useSetAtom(lastVisitedRoomAtom);
  const lastRoom = useAtomValue(lastVisitedRoomAtom);

  const openableSection = resolveSection(location.pathname);
  const canOpenRoom = Boolean(
    openableSection && openableSection.getRoomPath && lastRoom?.[openableSection.key]
  );

  const roomMatch =
    matchPath({ path: HOME_ROOM_PATH, end: false }, location.pathname) ??
    matchPath({ path: DIRECT_ROOM_PATH, end: false }, location.pathname) ??
    matchPath({ path: SPACE_ROOM_PATH, end: false }, location.pathname);
  const matchedRoomId = roomMatch?.params.roomIdOrAlias
    ? decodeURIComponent(roomMatch.params.roomIdOrAlias)
    : undefined;
  // `:roomIdOrAlias` also matches non-room segments like `create`, `search`, `lobby`.
  // Only treat it as a room when it's a real Matrix id/alias.
  const isRoomRoute = !!matchedRoomId && (isRoomId(matchedRoomId) || isRoomAlias(matchedRoomId));

  const listView =
    matchPath({ path: HOME_PATH, end: true }, location.pathname) !== null ||
    matchPath({ path: DIRECT_PATH, end: true }, location.pathname) !== null ||
    matchPath({ path: SPACE_PATH, end: true }, location.pathname) !== null ||
    matchPath({ path: EXPLORE_PATH, end: true }, location.pathname) !== null ||
    matchPath({ path: INBOX_PATH, end: true }, location.pathname) !== null;
  const contentOpen = !listView;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const navPanelRef = useRef<HTMLDivElement | null>(null);
  const contentPanelRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const x = useMotionValue(0);
  const draggingRef = useRef(false);

  const initialIntent = contentOpen ? 1 : 0;
  const [panelIntent, setPanelIntent] = useState(initialIntent);
  const panelIntentRef = useRef(initialIntent);

  const [roomArmed, setRoomArmed] = useState(isRoomRoute);
  useEffect(() => {
    if (isRoomRoute) {
      setRoomArmed(true);
      return undefined;
    }
    if (roomArmed) return undefined;
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    const cic = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = ric(() => setRoomArmed(true));
    return () => cic(handle as number);
  }, [isRoomRoute, roomArmed]);

  const applyTransition = useCallback((animated: boolean) => {
    const el = sliderRef.current;
    if (el) el.style.transition = animated ? `transform ${SLIDE_MS}ms ${SLIDE_EASE}` : 'none';
  }, []);

  const settle = useCallback(
    (target: number) => {
      if (reduceMotion) {
        applyTransition(false);
        x.jump(target);
        return;
      }
      applyTransition(true);
      x.set(target);
    },
    [reduceMotion, x, applyTransition]
  );

  const readX = useCallback((): number => {
    const el = sliderRef.current;
    if (!el) return x.get();
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    try {
      return new DOMMatrix(t).m41;
    } catch {
      return x.get();
    }
  }, [x]);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    navPanelRef.current?.toggleAttribute('inert', panelIntent === 1);
    contentPanelRef.current?.toggleAttribute('inert', panelIntent === 0);
  }, [panelIntent]);

  useLayoutEffect(() => {
    if (draggingRef.current) return;
    const routePanel = contentOpen ? 1 : 0;
    if (routePanel !== panelIntentRef.current) {
      panelIntentRef.current = routePanel;
      setPanelIntent(routePanel);
      const target = routePanel === 1 ? -width : 0;
      if (width > 0 && !reduceMotion) {
        settle(target);
      } else {
        applyTransition(false);
        x.jump(target);
      }
    }
  }, [contentOpen, width, x, settle, applyTransition, reduceMotion]);

  useLayoutEffect(() => {
    if (draggingRef.current) return;
    const target = panelIntentRef.current === 1 ? -width : 0;
    applyTransition(false);
    x.jump(target);
  }, [width, x, applyTransition]);

  const bind = useDrag(
    ({
      first,
      active,
      canceled,
      movement: [mx],
      offset: [ox],
      velocity: [vx],
      direction: [dx],
      event,
      cancel,
    }) => {
      if (canceled) {
        if (draggingRef.current) {
          draggingRef.current = false;
          settle(panelIntentRef.current === 1 ? -width : 0);
        }
        return;
      }
      if (!mobileGestures || width === 0) return;

      const target = event?.target;
      if (target instanceof HTMLElement && target.closest('[data-gestures="ignore"]')) {
        cancel();
        return;
      }

      if (panelIntentRef.current === 1) {
        if (mx < -DIRECTION_DEADZONE) {
          if (draggingRef.current) {
            draggingRef.current = false;
            settle(-width);
          }
          cancel();
          return;
        }
        if (active) {
          if (first) {
            x.stop();
            applyTransition(false);
          }
          draggingRef.current = true;
          x.set(clamp(ox, -width, 0));
          return;
        }
        draggingRef.current = false;
        const opened = width + ox > width * OPEN_FRACTION || (vx > VELOCITY_THRESHOLD && dx > 0);
        if (opened) {
          haptic('light');
          panelIntentRef.current = 0;
          setPanelIntent(0);
          settle(0);
          const section = resolveSection(location.pathname);
          if (section?.getRoomPath && matchedRoomId && isRoomRoute) {
            setLastRoom((prev) => ({ ...prev, [section.key]: matchedRoomId }));
          }
          if (section) startTransition(() => navigate(section.listPath));
        } else {
          settle(-width);
        }
        return;
      }

      if (mx > DIRECTION_DEADZONE) {
        cancel();
        return;
      }
      if (!canOpenRoom && mx < -DIRECTION_DEADZONE) {
        cancel();
        return;
      }
      if (active) {
        if (first) {
          x.stop();
          applyTransition(false);
          if (!roomArmed) setRoomArmed(true);
        }
        draggingRef.current = true;
        x.set(clamp(ox, -width, 0));
        return;
      }
      draggingRef.current = false;
      const wantRoom = -ox > width * OPEN_FRACTION || (vx > VELOCITY_THRESHOLD && dx < 0);
      if (wantRoom) {
        const section = resolveSection(location.pathname);
        if (section?.getRoomPath) {
          const lastRoomId = lastRoom?.[section.key];
          if (lastRoomId) {
            const roomPath = section.getRoomPath(lastRoomId);
            haptic('light');
            panelIntentRef.current = 1;
            setPanelIntent(1);
            settle(-width);
            startTransition(() => navigate(roomPath));
          } else {
            settle(0);
          }
        } else {
          settle(0);
        }
      } else {
        settle(0);
      }
    },
    // axis:'x' + touch-action:pan-y lets the browser keep native vertical scroll.
    {
      axis: 'x',
      filterTaps: true,
      tapsThreshold: DIRECTION_DEADZONE,
      pointer: { capture: false },
      from: () => [readX(), 0],
    }
  );

  return (
    <div
      {...bind()}
      ref={viewportRef}
      style={{
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexGrow: 1,
        height: '100%',
        width: '100%',
        touchAction: 'pan-y',
      }}
    >
      <motion.div
        ref={sliderRef}
        style={{ x, display: 'flex', height: '100%', willChange: 'transform' }}
      >
        <div
          ref={navPanelRef}
          style={{
            width,
            height: '100%',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              flexGrow: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'row',
              overflow: 'hidden',
            }}
          >
            {rail && (
              <div style={{ flexShrink: 0, display: 'flex', overflow: 'hidden' }}>{rail}</div>
            )}
            <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
              {nav}
            </div>
          </div>
          {bottomNav}
        </div>
        <div
          ref={contentPanelRef}
          style={{
            width,
            height: '100%',
            flexShrink: 0,
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          {isRoomRoute ? (
            <PersistentRoomHost inactive={panelIntent === 0} />
          ) : listView ? (
            roomArmed ? (
              <PersistentRoomHost inactive={panelIntent === 0} />
            ) : null
          ) : (
            children
          )}
        </div>
      </motion.div>
    </div>
  );
}
