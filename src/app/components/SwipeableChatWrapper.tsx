import type { ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { useAtomValue } from 'jotai';
import { settingsAtom, RightSwipeAction } from '$state/settings';
import { mobileOrTablet } from '$utils/user-agent';

interface SwipeableChatWrapperProps {
  children: ReactNode;
  onOpenSidebar?: () => void;
  onOpenMembers?: () => void;
  onReply?: () => void;
}

export function SwipeableChatWrapper({
  children,
  onOpenSidebar,
  onOpenMembers,
  onReply,
}: SwipeableChatWrapperProps) {
  const settings = useAtomValue(settingsAtom);
  const x = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 400, damping: 40 });

  const bind = useDrag(
    ({ active, movement: [mx], velocity: [vx], direction: [dx], event: e }) => {
      if (e && 'target' in e && e.target instanceof HTMLElement) {
        if (e.target.closest('[data-gestures="ignore"]')) {
          return;
        }
      }

      if (!settings.mobileGestures || !mobileOrTablet()) return;

      let val = mx;

      const canSwipeRight = !!onOpenSidebar;
      const canSwipeLeft =
        settings.rightSwipeAction === RightSwipeAction.Members ? !!onOpenMembers : !!onReply;

      if (!canSwipeRight && val > 0) val = 0;
      if (!canSwipeLeft && val < 0) val = 0;

      if (active) {
        x.set(val);
      } else {
        const swipeThreshold = 120;
        const velocityThreshold = 0.5;

        if (val > swipeThreshold || (vx > velocityThreshold && dx > 0 && val > 0)) {
          onOpenSidebar?.();
        } else if (val < -swipeThreshold || (vx > velocityThreshold && dx < 0 && val < 0)) {
          if (settings.rightSwipeAction === RightSwipeAction.Members) {
            onOpenMembers?.();
          } else {
            onReply?.();
          }
        }
        x.set(0);
      }
    },
    {
      axis: 'x',
      bounds: { left: -200, right: 200 },
      rubberband: true,
      filterTaps: true,
    }
  );

  if (!settings.mobileGestures || !mobileOrTablet()) {
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
      {...bind()}
      style={{
        touchAction: 'pan-y',
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
          x: springX,
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          height: '100%',
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
