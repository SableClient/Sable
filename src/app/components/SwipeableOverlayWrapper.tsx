import { ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { settingsAtom } from '$state/settings';
import { useIsMobile } from '$hooks/useIsMobile';
import { useDrag } from '@use-gesture/react';
import { createLogger } from '$utils/debug';

const log = createLogger('SwipeableOverlayWrapper');

const SWIPE_DISTANCE = 60;
const SWIPE_VELOCITY = 0.3;
const AXIS_LOCK_RATIO = 1.5;

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
  const isMobile = useIsMobile();
  const gesturesEnabled = settings.mobileGestures && isMobile;

  const bind = useDrag(
    ({ active, movement: [mx, my], velocity: [vx], direction: [dx] }) => {
      if (active) return;

      const axisBlocked = Math.abs(my) * AXIS_LOCK_RATIO > Math.abs(mx);
      if (axisBlocked) return;

      const thresholdMet =
        direction === 'left'
          ? mx < -SWIPE_DISTANCE || (vx > SWIPE_VELOCITY && dx < 0 && mx < 0)
          : mx > SWIPE_DISTANCE || (vx > SWIPE_VELOCITY && dx > 0 && mx > 0);

      if (thresholdMet) {
        log.log('swipe detected — calling onClose');
        onClose();
      }
    },
    {
      axis: 'x',
      filterTaps: true,
      pointer: { capture: false },
      enabled: gesturesEnabled,
    }
  );

  return (
    <div
      {...(gesturesEnabled ? bind() : {})}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        height: '100%',
        width: '100%',
        touchAction: 'pan-y',
      }}
    >
      {children}
    </div>
  );
}
