import { ReactNode, useRef, useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { settingsAtom } from '$state/settings';
import { useIsMobile } from '$hooks/useIsMobile';
import { createLogger } from '$utils/debug';

const log = createLogger('SwipeableOverlayWrapper');

const SWIPE_DISTANCE = 60;
const AXIS_LOCK_RATIO = 1.5;
const SWIPE_VELOCITY = 0.3;

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

  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const startTime = useRef<number | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!settings.mobileGestures || !isMobile) return;
      const t = e.touches[0];
      startX.current = t.clientX;
      startY.current = t.clientY;
      startTime.current = Date.now();
    },
    [settings.mobileGestures, isMobile]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!settings.mobileGestures || !isMobile) return;
      if (startX.current === null || startY.current === null || startTime.current === null) return;

      const t = e.changedTouches[0];
      const dx = t.clientX - startX.current;
      const dy = t.clientY - startY.current;
      const dt = Date.now() - startTime.current;
      const velocity = Math.abs(dx) / dt;

      const axisBlocked = Math.abs(dy) * AXIS_LOCK_RATIO > Math.abs(dx);
      const swipedLeft =
        direction === 'left' &&
        dx < 0 &&
        (Math.abs(dx) > SWIPE_DISTANCE || velocity > SWIPE_VELOCITY);
      const swipedRight =
        direction === 'right' &&
        dx > 0 &&
        (Math.abs(dx) > SWIPE_DISTANCE || velocity > SWIPE_VELOCITY);

      log.log(
        `touchend — dx:${dx.toFixed(1)} dy:${dy.toFixed(1)} dt:${dt}ms vel:${velocity.toFixed(3)}`,
        `| axisBlocked:${axisBlocked} swipedLeft:${swipedLeft} swipedRight:${swipedRight}`,
        `| direction:${direction}`
      );

      startX.current = null;
      startY.current = null;
      startTime.current = null;

      if (axisBlocked) {
        log.log('axis blocked — ignoring (vertical scroll)');
        return;
      }

      if (swipedLeft || swipedRight) {
        log.log('swipe detected — calling onClose');
        onClose();
      } else {
        log.log('not a swipe — ignoring');
      }
    },
    [settings.mobileGestures, isMobile, direction, onClose]
  );

  const handleTouchCancel = useCallback(() => {
    startX.current = null;
    startY.current = null;
    startTime.current = null;
  }, []);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
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
