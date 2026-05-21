import type { ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { RightSwipeAction, type Settings } from '$state/settings';

interface SwipeableChatWrapperActiveProps {
  children: ReactNode;
  settings: Settings;
  onOpenSidebar?: () => void;
  onOpenMembers?: () => void;
  onReply?: () => void;
}

export function SwipeableChatWrapperActive({
  children,
  settings,
  onOpenSidebar,
  onOpenMembers,
  onReply,
}: SwipeableChatWrapperActiveProps) {
  const x = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 400, damping: 40 });

  const bind = useDrag(
    ({ active, movement: [mx], velocity: [vx], direction: [dx], event: e }) => {
      if (e && 'target' in e && e.target instanceof HTMLElement) {
        if (e.target.closest('[data-gestures="ignore"]')) {
          return;
        }
      }

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
