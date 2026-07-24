import type { ReactNode } from 'react';
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AnimationPlaybackControls } from 'framer-motion';
import { animate, motion, useDragControls, useMotionValue, useReducedMotion } from 'framer-motion';
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
import { isRoomAlias, isRoomId } from '$utils/matrix';
import { PersistentRoomHost } from './PersistentRoomHost';

const SETTLE_STIFFNESS = 1000;
const SETTLE_DAMPING = 63;
const OPEN_FRACTION = 0.35;
const VELOCITY_THRESHOLD = 400;

type MobileNavDrawerProps = {
  nav: ReactNode;
  rail?: ReactNode;
  bottomNav?: ReactNode;
  children: ReactNode;
};

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
  const navPanelRef = useRef<HTMLDivElement | null>(null);
  const contentPanelRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const x = useMotionValue(0);
  const dragControls = useDragControls();
  const settleAnimRef = useRef<AnimationPlaybackControls | null>(null);

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

  const settle = useCallback(
    (target: number) => {
      settleAnimRef.current?.stop();
      settleAnimRef.current = null;

      if (reduceMotion) {
        x.jump(target);
        return;
      }
      settleAnimRef.current = animate(x, target, {
        type: 'spring',
        stiffness: SETTLE_STIFFNESS,
        damping: SETTLE_DAMPING,
        velocity: 0,
      });
    },
    [reduceMotion, x]
  );

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
    const routePanel = contentOpen ? 1 : 0;
    if (routePanel !== panelIntentRef.current) {
      panelIntentRef.current = routePanel;
      setPanelIntent(routePanel);
      const target = routePanel === 1 ? -width : 0;
      if (width > 0 && !reduceMotion) {
        settle(target);
      } else {
        settleAnimRef.current?.stop();
        settleAnimRef.current = null;
        x.jump(target);
      }
    }
  }, [contentOpen, width, x, settle, reduceMotion]);

  useLayoutEffect(() => {
    settleAnimRef.current?.stop();
    settleAnimRef.current = null;
    const target = panelIntentRef.current === 1 ? -width : 0;
    x.jump(target);
  }, [width, x]);

  return (
    <div
      onPointerDown={(event) => {
        if (!mobileGestures || width === 0) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest('[data-gestures="ignore"]')) return;
        // On the list panel, only start drag tracking when a room is available to open.
        if (panelIntentRef.current === 0 && !canOpenRoom) return;
        dragControls.start(event);
      }}
      ref={viewportRef}
      style={{
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexGrow: 1,
        height: '100%',
        width: '100%',
        touchAction: 'manipulation',
      }}
    >
      <motion.div
        drag={mobileGestures ? 'x' : false}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ left: -width, right: 0 }}
        dragDirectionLock
        dragElastic={0.05}
        dragMomentum={false}
        onDragStart={() => {
          x.stop();
          settleAnimRef.current?.stop();
          settleAnimRef.current = null;
          if (panelIntentRef.current === 0 && !roomArmed) setRoomArmed(true);
        }}
        onDragEnd={(_event, info) => {
          const { offset, velocity } = info;

          if (panelIntentRef.current === 1) {
            // Room panel → swipe right to reveal the list.
            const opened = offset.x > width * OPEN_FRACTION || velocity.x > VELOCITY_THRESHOLD;
            if (opened) {
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

          // List panel → swipe left to open the last visited room.
          const wantRoom = -offset.x > width * OPEN_FRACTION || velocity.x < -VELOCITY_THRESHOLD;
          if (wantRoom) {
            const section = resolveSection(location.pathname);
            if (section?.getRoomPath) {
              const lastRoomId = lastRoom?.[section.key];
              if (lastRoomId) {
                const roomPath = section.getRoomPath(lastRoomId);
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
        }}
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
