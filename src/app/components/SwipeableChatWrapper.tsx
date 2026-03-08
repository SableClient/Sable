import { ReactNode } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import { useDrag } from '@use-gesture/react';
import { useAtomValue } from 'jotai';
import { settingsAtom, RightSwipeAction } from '$state/settings';
import { useIsMobile } from '$hooks/useIsMobile';
import { SwipeContext } from './SwipeContext';

const SWIPE_DISTANCE = 80;
const SWIPE_VELOCITY = 0.4;
const SNAP_SPRING = { type: 'spring' as const, stiffness: 600, damping: 50, mass: 0.6 };

interface SwipeableChatWrapperProps {
  children: ReactNode;
  onOpenSidebar?: () => void;
  onOpenMembers?: () => void;
}

export function SwipeableChatWrapper({
  children,
  onOpenSidebar,
  onOpenMembers,
}: SwipeableChatWrapperProps) {
  const settings = useAtomValue(settingsAtom);
  const isMobile = useIsMobile();
  const x = useMotionValue(0);

  // On mobile, MobileRoomOverlay owns the right-swipe gesture so canSwipeRight
  // is always false. canSwipeLeft is only active if Members mode is on.
  // If neither direction is active, skip binding entirely, an idle useDrag
  // with rubberband still captures and rubber-bands touches, stealing clicks.
  const canSwipeRight = !isMobile && !!onOpenSidebar;
  const canSwipeLeft =
    settings.mobileGestures &&
    isMobile &&
    settings.rightSwipeAction === RightSwipeAction.Members &&
    !!onOpenMembers;
  const gesturesEnabled = settings.mobileGestures && (canSwipeRight || canSwipeLeft);

  const bind = useDrag(
    ({ active, movement: [mx], velocity: [vx], direction: [dx], event: e }) => {
      if (e && 'target' in e && e.target instanceof HTMLElement) {
        if (e.target.closest('[data-gestures="ignore"]')) return;
      }

      let val = mx;
      if (!canSwipeRight && val > 0) val = 0;
      if (!canSwipeLeft && val < 0) val = 0;

      if (active) {
        x.set(val);
      } else {
        if (canSwipeRight && (val > SWIPE_DISTANCE || (vx > SWIPE_VELOCITY && dx > 0 && val > 0))) {
          onOpenSidebar?.();
        } else if (
          canSwipeLeft &&
          (val < -SWIPE_DISTANCE || (vx > SWIPE_VELOCITY && dx < 0 && val < 0))
        ) {
          onOpenMembers?.();
        }
        animate(x, 0, SNAP_SPRING);
      }
    },
    {
      axis: 'x',
      bounds: { left: -160, right: 160 },
      rubberband: true,
      filterTaps: true,
      pointer: { capture: false },
      enabled: gesturesEnabled,
    }
  );

  return (
    <SwipeContext.Provider value={x}>
      <div
        {...(gesturesEnabled ? bind() : {})}
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
            willChange: 'transform',
          }}
        >
          {children}
        </motion.div>
      </div>
    </SwipeContext.Provider>
  );
}
