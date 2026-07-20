import type { ReactNode } from 'react';
import { animate, motion, useMotionValue } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom, RightSwipeAction } from '$state/settings';
import { haptic } from '$utils/haptics';
import { mobileOrTablet } from '$utils/user-agent';

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
  const [mobileGestures] = useSetting(settingsAtom, 'mobileGestures');
  const [rightSwipeAction] = useSetting(settingsAtom, 'rightSwipeAction');
  const x = useMotionValue(0);

  const bind = useDrag(
    ({ first, active, offset: [ox], velocity: [vx], direction: [dx], event: e }) => {
      if (e && 'target' in e && e.target instanceof HTMLElement) {
        if (e.target.closest('[data-gestures="ignore"]')) {
          return;
        }
      }

      if (!mobileGestures || !mobileOrTablet()) return;

      let val = ox;

      const canSwipeLeft =
        rightSwipeAction === RightSwipeAction.Members ? !!onOpenMembers : !!onReply;

      // The drawer owns the rightward reveal; this wrapper only handles leftward actions.
      if (val > 0) val = 0;
      if (!canSwipeLeft && val < 0) val = 0;

      if (active) {
        // Take over any settling spring; offset is seeded from the live position.
        if (first) x.stop();
        x.set(val);
      } else {
        const swipeThreshold = 120;
        const velocityThreshold = 0.5;

        if (val < -swipeThreshold || (vx > velocityThreshold && dx < 0 && val < 0)) {
          haptic('light');
          if (rightSwipeAction === RightSwipeAction.Members) {
            onOpenMembers?.();
          } else {
            onReply?.();
          }
        }
        animate(x, 0, { type: 'spring', stiffness: 400, damping: 40 });
      }
    },
    {
      axis: 'x',
      bounds: { left: -200, right: 200 },
      rubberband: true,
      filterTaps: true,
      pointer: { capture: false },
      from: () => [x.get(), 0],
    }
  );

  if (!mobileGestures || !mobileOrTablet()) {
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
          x,
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
