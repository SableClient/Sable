import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useMotionValue, useSpring, useTransform, motion } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { config, Icon, Icons } from 'folds';

export function SwipeableMessageWrapperActive({
  children,
  onReply,
}: {
  children: ReactNode;
  onReply: () => void;
}) {
  const x = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 35 });
  const [isReady, setIsReady] = useState(false);
  const iconOpacity = useTransform(x, [0, -8], [0, 1]);

  const bind = useDrag(
    ({ active, movement: [mx] }) => {
      if (active) {
        const val = mx < 0 ? mx : 0;
        x.set(Math.max(-80, val));
        if (mx < -50 !== isReady) setIsReady(mx < -50);
      } else {
        if (mx < -50) onReply();
        x.set(0);
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

  const iconColor = useMemo(
    () => (isReady ? 'var(--sable-surface-on-container)' : 'var(--sable-surface-container)'),
    [isReady]
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
          <Icon
            src={Icons.ReplyArrow}
            size="400"
            style={{
              color: iconColor,
              transition: 'color 0.2s',
            }}
          />
        </motion.div>
      </div>
      <motion.div style={{ x: springX, position: 'relative', zIndex: 1 }}>{children}</motion.div>
    </div>
  );
}
