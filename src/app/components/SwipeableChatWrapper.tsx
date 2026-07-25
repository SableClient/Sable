import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';
import { animate, motion, useMotionValue } from 'framer-motion';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom, RightSwipeAction } from '$state/settings';
import { haptic } from '$utils/haptics';
import { mobileOrTablet } from '$utils/user-agent';
import { useMobileNavDrawer } from '$components/page/MobileNavDrawerContext';

interface SwipeableChatWrapperProps {
  children: ReactNode;
  onOpenMembers?: () => void;
  onReply?: () => void;
}

export function SwipeableChatWrapper({
  children,
  onOpenMembers,
  onReply,
}: SwipeableChatWrapperProps) {
  const [rightSwipeAction] = useSetting(settingsAtom, 'rightSwipeAction');
  const x = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const gestureActiveRef = useRef(false);
  const drawer = useMobileNavDrawer();

  const move = useCallback(
    (distanceX: number) => {
      if (!gestureActiveRef.current) {
        gestureActiveRef.current = true;
        x.stop();
      }

      const canSwipeLeft =
        rightSwipeAction === RightSwipeAction.Members ? !!onOpenMembers : !!onReply;
      x.set(canSwipeLeft ? Math.max(-200, Math.min(0, distanceX)) : 0);
    },
    [onOpenMembers, onReply, rightSwipeAction, x]
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
      animate(x, 0, { type: 'spring', stiffness: 400, damping: 40 });
    },
    [onOpenMembers, onReply, rightSwipeAction, x]
  );

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!drawer || !element || !mobileOrTablet()) return undefined;

    return drawer.registerChatSwipe(element, {
      move,
      end: ({ distanceX, velocityX }) => finish(true, distanceX, velocityX),
      cancel: () => finish(false),
    });
  }, [drawer, finish, move]);

  if (!mobileOrTablet()) {
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
      <motion.div
        style={{
          x,
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          height: '100%',
          willChange: 'transform',
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
