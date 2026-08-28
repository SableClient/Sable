import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  getTranslateX,
  NATIVE_EASE_OUT,
  setTranslateX,
  transitionTo,
} from '$utils/nativeAnimation';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom, RightSwipeAction } from '$state/settings';
import { haptic } from '$utils/haptics';
import { isMobileOrTablet } from '$utils/platform';
import { useMobileNavDrawer } from '$components/page/MobileNavDrawerContext';

interface SwipeableChatWrapperProps {
  children: ReactNode;
  onOpenMembers?: () => void;
  onReply?: () => void;
}

const SETTLE_MS = 220;
const SETTLE_TRANSITION = `transform ${SETTLE_MS}ms ${NATIVE_EASE_OUT}`;

export function SwipeableChatWrapper({
  children,
  onOpenMembers,
  onReply,
}: SwipeableChatWrapperProps) {
  const [rightSwipeAction] = useSetting(settingsAtom, 'rightSwipeAction');
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const xRef = useRef(0);
  const gestureActiveRef = useRef(false);
  const settleRef = useRef<{ cancel: () => void } | undefined>(undefined);
  const drawer = useMobileNavDrawer();

  const setOffset = useCallback((value: number) => {
    xRef.current = value;
    if (contentRef.current) setTranslateX(contentRef.current, value);
  }, []);

  const cancelSettle = useCallback(() => {
    const element = contentRef.current;
    const liveOffset = element ? getTranslateX(element, xRef.current) : xRef.current;
    settleRef.current?.cancel();
    settleRef.current = undefined;
    if (element) element.style.transition = 'none';
    setOffset(liveOffset);
  }, [setOffset]);

  const settleToRest = useCallback(() => {
    const element = contentRef.current;
    if (!element) return;
    cancelSettle();
    settleRef.current = transitionTo(
      element,
      SETTLE_TRANSITION,
      () => setOffset(0),
      SETTLE_MS,
      () => {
        settleRef.current = undefined;
      }
    );
  }, [cancelSettle, setOffset]);

  const move = useCallback(
    (distanceX: number) => {
      if (!gestureActiveRef.current) {
        gestureActiveRef.current = true;
        cancelSettle();
      }

      if (!isMobileOrTablet()) return;

      const canSwipeLeft =
        rightSwipeAction === RightSwipeAction.Members ? !!onOpenMembers : !!onReply;
      setOffset(canSwipeLeft ? Math.max(-200, Math.min(0, distanceX)) : 0);
    },
    [cancelSettle, onOpenMembers, onReply, rightSwipeAction, setOffset]
  );

  const finish = useCallback(
    (commit: boolean, distanceX = 0, velocityX = 0) => {
      if (commit && (distanceX < -120 || velocityX < -0.5)) {
        haptic('light');
        if (rightSwipeAction === RightSwipeAction.Members) {
          onOpenMembers?.();
        } else {
          onReply?.();
        }
      }

      gestureActiveRef.current = false;
      settleToRest();
    },
    [onOpenMembers, onReply, rightSwipeAction, settleToRest]
  );

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!drawer || !element || !isMobileOrTablet()) return undefined;

    return drawer.registerChatSwipe(element, {
      move,
      end: ({ distanceX, velocityX }) => finish(true, distanceX, velocityX),
      cancel: () => finish(false),
    });
  }, [drawer, finish, move]);

  if (!isMobileOrTablet()) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          height: '100%',
          width: '100%',
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-chat-swipe
      style={{
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        height: '100%',
        width: '100%',
      }}
    >
      <div
        ref={contentRef}
        style={{
          transform: 'translate3d(0, 0, 0)',
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          height: '100%',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}
