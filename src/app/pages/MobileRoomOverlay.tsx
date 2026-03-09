import { ReactNode, useEffect, useRef } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import { useDrag } from '@use-gesture/react';
import { useAtomValue } from 'jotai';
import { settingsAtom } from '$state/settings';
import { mobileOrTablet } from '$utils/user-agent';
import { useBackRoute } from '$hooks/useBackRoute';
import { createLogger } from '$utils/debug';

const log = createLogger('MobileRoomOverlay');

const SWIPE_DISTANCE = 80;
const SWIPE_VELOCITY = 0.4;
const SNAP_SPRING = { type: 'spring' as const, stiffness: 600, damping: 50, mass: 0.6 };
const TRANSITION_SPRING = { type: 'spring' as const, stiffness: 380, damping: 36 };

export function MobileRoomOverlay({ children }: { children: ReactNode }) {
  const settings = useAtomValue(settingsAtom);
  const goBack = useBackRoute();
  const x = useMotionValue(window.innerWidth);
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.log('mounted, starting slide-in animation');
    animate(x, 0, TRANSITION_SPRING);
  }, [x]);

  const navigateBack = () => {
    log.log('navigateBack — disabling pointer events, starting exit animation');
    // Disable hit-testing immediately so the nav beneath becomes interactive
    // before the animation completes and the component unmounts.
    if (divRef.current) divRef.current.style.pointerEvents = 'none';
    animate(x, window.innerWidth, {
      ...TRANSITION_SPRING,
      onComplete: () => {
        log.log('exit animation complete — calling goBack');
        goBack();
      },
    });
  };

  const bind = useDrag(
    ({ active, movement: [mx], velocity: [vx], direction: [dx] }) => {
      if (!settings.mobileGestures || !mobileOrTablet()) return;

      if (active) {
        x.set(Math.max(0, mx));
      } else {
        const flung = vx > SWIPE_VELOCITY && dx > 0 && mx > 0;
        log.log(`drag end — mx:${mx.toFixed(0)} vx:${vx.toFixed(2)} dx:${dx} flung:${flung}`);
        if (mx > SWIPE_DISTANCE || flung) {
          log.log('threshold met — calling navigateBack');
          navigateBack();
        } else {
          log.log('snapping back');
          animate(x, 0, SNAP_SPRING);
        }
      }
    },
    {
      axis: 'x',
      bounds: { left: 0 },
      rubberband: true,
      filterTaps: true,
      pointer: { capture: false },
    }
  );

  return (
    <motion.div
      ref={divRef}
      {...(bind() as any)}
      style={{
        x,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
        touchAction: 'pan-y',
        willChange: 'transform',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-base)',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
        width: '100vw',
        overflow: 'hidden',
      }}
    >
      {children}
    </motion.div>
  );
}
