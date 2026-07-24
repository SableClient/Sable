import { useMotionValue, useTransform, motion, animate } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { config } from 'folds';
import { ArrowBendUpLeftIcon, getPhosphorIconSize } from '$components/icons/phosphor';
import { haptic } from '$utils/haptics';
import { mobileOrTablet } from '$utils/user-agent';
import { RightSwipeAction, settingsAtom } from '$state/settings';

function ActiveSwipeWrapper({ children, onReply }: { children: ReactNode; onReply: () => void }) {
  const x = useMotionValue(0);
  const [isReady, setIsReady] = useState(false);
  const isReadyRef = useRef(false);
  const iconOpacity = useTransform(x, [0, -8], [0, 1]);

  const bind = useDrag(
    ({ first, active, movement: [mx] }) => {
      if (first) x.stop();

      if (active) {
        const val = mx < 0 ? mx : 0;
        x.set(Math.max(-80, val));
        const nextReady = mx < -50;
        if (nextReady !== isReadyRef.current) {
          isReadyRef.current = nextReady;
          setIsReady(nextReady);
          if (nextReady) haptic('selection');
        }
      } else {
        if (mx < -50) onReply();
        animate(x, 0, { type: 'spring', stiffness: 300, damping: 35 });
        isReadyRef.current = false;
        setIsReady(false);
      }
    },
    {
      axis: 'x',
      bounds: { right: 0 },
      rubberband: true,
      filterTaps: true,
      eventOptions: { passive: true },
    }
  );

  return (
    <div {...bind()} style={{ position: 'relative', touchAction: 'pan-y' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          paddingRight: config.space.S400,
          display: 'flex',
          alignItems: 'center',
          zIndex: 0,
        }}
      >
        <motion.div style={{ opacity: iconOpacity }}>
          <ArrowBendUpLeftIcon
            size={getPhosphorIconSize('toolbar')}
            style={{
              color: isReady
                ? 'var(--sable-surface-on-container)'
                : 'var(--sable-surface-container)',
              transition: 'color 0.2s',
            }}
          />
        </motion.div>
      </div>
      <motion.div style={{ x, position: 'relative', zIndex: 1, willChange: 'transform' }}>
        {children}
      </motion.div>
    </div>
  );
}

export function SwipeableMessageWrapper({
  children,
  onReply,
}: {
  children: ReactNode;
  onReply?: () => void;
}) {
  const settings = useAtomValue(settingsAtom);

  const isSwipeToReplyEnabled = useMemo(
    () =>
      settings.mobileGestures &&
      mobileOrTablet() &&
      settings.rightSwipeAction !== RightSwipeAction.Members,
    [settings.mobileGestures, settings.rightSwipeAction]
  );

  if (!isSwipeToReplyEnabled || !onReply) {
    return children;
  }

  return <ActiveSwipeWrapper onReply={onReply}>{children}</ActiveSwipeWrapper>;
}
