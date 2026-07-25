import type { ReactNode } from 'react';
import { animate, motion, useMotionValue } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
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
  const x = useMotionValue(0);

  const bind = useDrag(
    ({ first, active, offset: [ox], velocity: [vx], direction: [dx], event, cancel }) => {
      if (first && event && 'target' in event && event.target instanceof HTMLElement) {
        if (event.target.closest('[data-gestures="ignore"]')) {
          cancel();
          return;
        }
      }

      if (!mobileOrTablet()) return;

      event.stopPropagation();

      let val = ox;

      if (direction === 'left' && val > 0) val = 0;
      if (direction === 'right' && val < 0) val = 0;

      if (active) {
        // Take over any settling spring; offset is seeded from the live position.
        if (first) x.stop();
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

        animate(x, 0, { type: 'spring', stiffness: 400, damping: 40 });
      }
    },
    {
      axis: 'x',
      bounds: direction === 'left' ? { left: -300, right: 0 } : { left: 0, right: 300 },
      rubberband: true,
      filterTaps: true,
      pointer: { capture: true },
      eventOptions: { passive: true },
      from: () => [x.get(), 0],
    }
  );

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
      {...bind()}
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
