import type { ReactNode } from 'react';
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { matchPath, useLocation, useNavigate } from 'react-router';
import { lastVisitedRoomAtom } from '$state/room/lastRoom';
import { usePrefersReducedMotion } from '$hooks/usePrefersReducedMotion';
import { DIRECT_PATH, EXPLORE_PATH, HOME_PATH, INBOX_PATH, SPACE_PATH } from '$pages/paths';
import { resolveSection } from '$pages/pathUtils';
import { matchRoomRoute } from '$pages/roomRouteMatch';
import { PersistentRoomHost } from './PersistentRoomHost';
import { MobileNavDrawerContext, type MobileSwipeTarget } from './MobileNavDrawerContext';
import {
  classifyMobileGesture,
  getDrawerSettlePosition,
  type MobileGestureMode,
} from './mobileSwipeCoordinator';

type MobileNavDrawerProps = {
  nav: ReactNode;
  rail?: ReactNode;
  bottomNav?: ReactNode;
  children: ReactNode;
};

const DRAWER_TRANSITION_MS = 220;

type ActiveTouchGesture = {
  startX: number;
  startY: number;
  startPosition: number;
  lastX: number;
  lastTime: number;
  velocityX: number;
  mode: MobileGestureMode;
  message?: MobileSwipeTarget;
  chat?: MobileSwipeTarget;
};

/** Sliding mobile drawer with one touch coordinator and a GPU-transformed panel track. */
export function MobileNavDrawer({ nav, rail, bottomNav, children }: MobileNavDrawerProps) {
  const reduceMotion = usePrefersReducedMotion();
  const location = useLocation();
  const navigate = useNavigate();
  const setLastRoom = useSetAtom(lastVisitedRoomAtom);
  const lastRoom = useAtomValue(lastVisitedRoomAtom);

  const openableSection = resolveSection(location.pathname);
  const canOpenRoom = Boolean(
    openableSection && openableSection.getRoomPath && lastRoom?.[openableSection.key]
  );

  const roomRoute = matchRoomRoute(location.pathname);
  const matchedRoomId = roomRoute?.roomIdOrAlias;
  const isRoomRoute = roomRoute !== undefined;

  const listView =
    matchPath({ path: HOME_PATH, end: true }, location.pathname) !== null ||
    matchPath({ path: DIRECT_PATH, end: true }, location.pathname) !== null ||
    matchPath({ path: SPACE_PATH, end: true }, location.pathname) !== null ||
    matchPath({ path: EXPLORE_PATH, end: true }, location.pathname) !== null ||
    matchPath({ path: INBOX_PATH, end: true }, location.pathname) !== null;
  const contentOpen = !listView;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const navPanelRef = useRef<HTMLDivElement | null>(null);
  const contentPanelRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const positionRef = useRef(0);

  const [panelIntent, setPanelIntent] = useState(contentOpen ? 1 : 0);
  const gestureRef = useRef<ActiveTouchGesture | undefined>(undefined);
  const messageTargetsRef = useRef(new WeakMap<HTMLElement, MobileSwipeTarget>());
  const chatTargetsRef = useRef(new WeakMap<HTMLElement, MobileSwipeTarget>());
  const settleAnimationRef = useRef<number | undefined>(undefined);
  const programmaticTargetRef = useRef<number | undefined>(undefined);

  const setTrackPosition = useCallback((position: number) => {
    positionRef.current = position;
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${position}px, 0, 0)`;
    }
  }, []);

  const settleToPanel = useCallback(
    (targetPosition: number, onComplete?: () => void) => {
      if (!trackRef.current) return;

      window.cancelAnimationFrame(settleAnimationRef.current ?? 0);
      if (reduceMotion) {
        setTrackPosition(targetPosition);
        onComplete?.();
        return;
      }

      const startPosition = positionRef.current;
      const distance = targetPosition - startPosition;
      if (Math.abs(distance) <= 1) {
        setTrackPosition(targetPosition);
        onComplete?.();
        return;
      }

      const startTime = window.performance.now();
      const tick = (time: number) => {
        const progress = Math.min(1, (time - startTime) / DRAWER_TRANSITION_MS);
        const eased = 1 - (1 - progress) ** 3;
        setTrackPosition(startPosition + distance * eased);

        if (progress < 1) {
          settleAnimationRef.current = window.requestAnimationFrame(tick);
        } else {
          setTrackPosition(targetPosition);
          settleAnimationRef.current = undefined;
          onComplete?.();
        }
      };

      settleAnimationRef.current = window.requestAnimationFrame(tick);
    },
    [reduceMotion, setTrackPosition]
  );

  const registerMessageSwipe = useCallback((element: HTMLElement, target: MobileSwipeTarget) => {
    messageTargetsRef.current.set(element, target);
    return () => {
      if (messageTargetsRef.current.get(element) === target) {
        messageTargetsRef.current.delete(element);
      }
    };
  }, []);

  const registerChatSwipe = useCallback((element: HTMLElement, target: MobileSwipeTarget) => {
    chatTargetsRef.current.set(element, target);
    return () => {
      if (chatTargetsRef.current.get(element) === target) {
        chatTargetsRef.current.delete(element);
      }
    };
  }, []);

  const [roomArmed, setRoomArmed] = useState(() => isRoomRoute || canOpenRoom);
  useEffect(() => {
    if (isRoomRoute || canOpenRoom) {
      setRoomArmed(true);
      return undefined;
    }
    if (roomArmed) return undefined;
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    const cic = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = ric(() => setRoomArmed(true));
    return () => cic(handle as number);
  }, [isRoomRoute, canOpenRoom, roomArmed]);

  const openContent = useCallback(
    (path: string) => {
      const viewport = viewportRef.current;
      if (!viewport || width === 0) {
        startTransition(() => {
          void navigate(path);
        });
        return;
      }

      setRoomArmed(true);
      programmaticTargetRef.current = -width;

      // Start the exact same settle used after a swipe immediately, while the
      // selected room renders concurrently in the panel being revealed.
      settleToPanel(-width, () => {
        if (programmaticTargetRef.current === -width) {
          programmaticTargetRef.current = undefined;
        }
        setPanelIntent(1);
      });
      startTransition(() => {
        void navigate(path);
      });
    },
    [navigate, settleToPanel, width]
  );

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const update = () => {
      const nextWidth = el.clientWidth;
      const previousWidth = widthRef.current;
      const nextPosition =
        previousWidth > 0
          ? (positionRef.current / previousWidth) * nextWidth
          : contentOpen
            ? -nextWidth
            : 0;
      widthRef.current = nextWidth;
      setTrackPosition(nextPosition);
      setWidth(nextWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [contentOpen, setTrackPosition]);

  useLayoutEffect(() => {
    navPanelRef.current?.toggleAttribute('inert', panelIntent === 1);
    contentPanelRef.current?.toggleAttribute('inert', panelIntent === 0);
    // `inert` alone does not drop a mobile keyboard.
    const hiddenPanel = panelIntent === 0 ? contentPanelRef.current : navPanelRef.current;
    const focused = document.activeElement;
    if (hiddenPanel && focused instanceof HTMLElement && hiddenPanel.contains(focused)) {
      focused.blur();
    }
  }, [panelIntent]);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el || width === 0) return;
    const targetPosition = contentOpen ? -width : 0;

    if (programmaticTargetRef.current === targetPosition) return;

    if (Math.abs(positionRef.current - targetPosition) > 5) {
      settleToPanel(targetPosition, () => setPanelIntent(contentOpen ? 1 : 0));
    } else {
      setPanelIntent(contentOpen ? 1 : 0);
    }
  }, [contentOpen, settleToPanel, width]);

  const commitPanel = useCallback(
    (roomVisible: boolean) => {
      if (width === 0) return;

      setTrackPosition(roomVisible ? -width : 0);
      setPanelIntent(roomVisible ? 1 : 0);

      if (roomVisible === contentOpen) return;

      if (roomVisible) {
        const section = resolveSection(location.pathname);
        if (section?.getRoomPath) {
          const lastRoomId = lastRoom?.[section.key];
          if (lastRoomId) {
            startTransition(() => {
              void navigate(section.getRoomPath!(lastRoomId));
            });
            return;
          }
        }
        settleToPanel(0);
        setPanelIntent(0);
        return;
      }

      const section = resolveSection(location.pathname);
      if (!section) return;
      if (section.getRoomPath && matchedRoomId && isRoomRoute) {
        setLastRoom((prev) => ({ ...prev, [section.key]: matchedRoomId }));
      }
      startTransition(() => {
        void navigate(section.listPath);
      });
    },
    [
      contentOpen,
      isRoomRoute,
      lastRoom,
      location.pathname,
      matchedRoomId,
      navigate,
      settleToPanel,
      setLastRoom,
      setTrackPosition,
      width,
    ]
  );

  const finishGesture = useCallback(
    (cancelled: boolean) => {
      const gesture = gestureRef.current;
      gestureRef.current = undefined;
      if (!gesture) return;

      const distanceX = gesture.lastX - gesture.startX;
      if (gesture.mode === 'message') {
        if (cancelled) gesture.message?.cancel();
        else gesture.message?.end({ distanceX, velocityX: gesture.velocityX });
        return;
      }
      if (gesture.mode === 'chat') {
        if (cancelled) gesture.chat?.cancel();
        else gesture.chat?.end({ distanceX, velocityX: gesture.velocityX });
        return;
      }
      if (gesture.mode !== 'drawer' || width === 0) return;

      const targetPosition = getDrawerSettlePosition({
        startPosition: gesture.startPosition,
        distanceX,
        velocityX: gesture.velocityX,
        width,
        cancelled,
      });

      settleToPanel(targetPosition, () => commitPanel(targetPosition === -width));
    },
    [commitPanel, settleToPanel, width]
  );

  useEffect(() => {
    return () => {
      window.cancelAnimationFrame(settleAnimationRef.current ?? 0);
      const gesture = gestureRef.current;
      gestureRef.current = undefined;
      gesture?.message?.cancel();
      gesture?.chat?.cancel();
    };
  }, []);

  const contextValue = useMemo(
    () => ({ openContent, registerChatSwipe, registerMessageSwipe }),
    [openContent, registerChatSwipe, registerMessageSwipe]
  );

  const drawer = (
    <div
      ref={viewportRef}
      className="no-scrollbar"
      data-testid="mobile-nav-drawer-viewport"
      onTouchStartCapture={(event) => {
        const viewport = viewportRef.current;
        const touch = event.touches[0];
        if (!viewport || !touch) return;
        if (event.touches.length !== 1) {
          finishGesture(true);
          return;
        }

        const target = event.target instanceof Element ? event.target : event.currentTarget;
        const messageElement = target.closest<HTMLElement>('[data-message-swipe]');
        const chatElement = target.closest<HTMLElement>('[data-chat-swipe]');
        const ignoredElement = target.closest<HTMLElement>('[data-gestures="ignore"]');
        const scrollingElement = target.closest<HTMLElement>('[data-gestures="scroll"]');
        const message = messageElement ? messageTargetsRef.current.get(messageElement) : undefined;
        const chat = chatElement ? chatTargetsRef.current.get(chatElement) : undefined;
        // Nested ignore markers (e.g. inline media) don't block swipe if they're part of
        // this message/chat's own surface, only if they sit outside it.
        const blockedIgnored =
          ignoredElement !== null &&
          !(messageElement && messageElement.contains(ignoredElement)) &&
          !(chatElement && chatElement.contains(ignoredElement));

        // If the element is horizontally scrollable (scrollWidth > clientWidth), block gestures
        const blockedScroll =
          scrollingElement !== null && scrollingElement.scrollWidth > scrollingElement.clientWidth;

        const blocked = blockedScroll || blockedIgnored;

        gestureRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          startPosition: positionRef.current,
          lastX: touch.clientX,
          lastTime: event.timeStamp,
          velocityX: 0,
          mode: blocked ? 'blocked' : 'pending',
          message,
          chat,
        };
        if (positionRef.current > -width && canOpenRoom) setRoomArmed(true);
      }}
      onTouchMoveCapture={(event) => {
        const viewport = viewportRef.current;
        const gesture = gestureRef.current;
        const touch = event.touches[0];
        if (!viewport || !gesture || !touch || gesture.mode === 'blocked') return;

        const distanceX = touch.clientX - gesture.startX;
        const distanceY = touch.clientY - gesture.startY;
        const elapsed = event.timeStamp - gesture.lastTime;
        if (elapsed > 0) {
          gesture.velocityX = (touch.clientX - gesture.lastX) / elapsed;
          gesture.lastX = touch.clientX;
          gesture.lastTime = event.timeStamp;
        }

        if (gesture.mode === 'pending') {
          gesture.mode = classifyMobileGesture({
            distanceX,
            distanceY,
            startPosition: positionRef.current,
            width,
            canOpenRoom,
            hasMessage: gesture.message !== undefined,
            hasChat: gesture.chat !== undefined,
          });
          if (gesture.mode === 'drawer' || gesture.mode === 'message' || gesture.mode === 'chat') {
            const animationActive = settleAnimationRef.current !== undefined;
            window.cancelAnimationFrame(settleAnimationRef.current ?? 0);
            settleAnimationRef.current = undefined;
            programmaticTargetRef.current = undefined;
            if (animationActive) gesture.startPosition = positionRef.current - distanceX;
          }
        }

        if (gesture.mode === 'drawer') {
          setTrackPosition(Math.max(-width, Math.min(0, gesture.startPosition + distanceX)));
        } else if (gesture.mode === 'message') {
          gesture.message?.move(distanceX);
        } else if (gesture.mode === 'chat') {
          gesture.chat?.move(distanceX);
        }
      }}
      onTouchEndCapture={() => finishGesture(false)}
      onTouchCancelCapture={() => finishGesture(true)}
      style={{
        display: 'flex',
        flexGrow: 1,
        height: '100%',
        width: '100%',
        // `clip`, not `hidden`: hidden keeps a scrollport, so a focus or scrollIntoView on
        // the revealed panel scrolls it a full panel width out of frame, permanently.
        overflow: 'clip',
        overscrollBehaviorX: 'none',
        touchAction: 'pan-y',
      }}
    >
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      <div
        ref={trackRef}
        style={{
          display: 'flex',
          width: '200%',
          height: '100%',
          flexShrink: 0,
          transform: 'translate3d(0, 0, 0)',
          willChange: 'transform',
        }}
      >
        <div
          ref={navPanelRef}
          className="no-scrollbar"
          style={{
            width: '50%',
            flexBasis: '50%',
            height: '100%',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
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
          className="no-scrollbar"
          style={{
            width: '50%',
            flexBasis: '50%',
            height: '100%',
            flexShrink: 0,
            display: 'flex',
            overflow: 'hidden',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
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
      </div>
    </div>
  );

  return (
    <MobileNavDrawerContext.Provider value={contextValue}>{drawer}</MobileNavDrawerContext.Provider>
  );
}
