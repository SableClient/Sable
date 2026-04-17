import type { ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { useAtomValue } from 'jotai';
import { settingsAtom } from '$state/settings';
import { mobileOrTablet } from '$utils/user-agent';

interface SwipeableOverlayWrapperProps {
  children: ReactNode;
  onClose: () => void;
  direction: 'left' | 'right';
}

export function SwipeableOverlayWrapper({
  children,
  onClose,
  direction,
}: SwipeableOverlayWrapperProps) {
  const settings = useAtomValue(settingsAtom);
  const x = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 400, damping: 40 });

  const bind = useDrag(
    ({ active, movement: [mx], velocity: [vx], direction: [dx], event, event: e }) => {
      if (e && 'target' in e && e.target instanceof HTMLElement) {
        if (e.target.closest('[data-gestures="ignore"]')) {
          return;
        }
      }

      if (!settings.mobileGestures || !mobileOrTablet()) return;

      event.stopPropagation();

      let val = mx;

      if (direction === 'left' && val > 0) val = 0;
      if (direction === 'right' && val < 0) val = 0;

      if (active) {
        x.set(val);
      } else {
        const swipeThreshold = 100;
        const velocityThreshold = 0.5;

        const swipedLeft =
          direction === 'left' && (val < -swipeThreshold || (vx > velocityThreshold && dx < 0));
        const swipedRight =
          direction === 'right' && (val > swipeThreshold || (vx > velocityThreshold && dx > 0));

        if (swipedLeft || swipedRight) {
          onClose();
        }

        x.set(0);
      }
    },
    {
      axis: 'x',
      bounds: direction === 'left' ? { left: -300, right: 0 } : { left: 0, right: 300 },
      rubberband: true,
      filterTaps: true,
      pointer: { capture: true },
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
