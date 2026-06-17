import { useMotionValue, useSpring, useTransform, motion } from 'motion/react';
import { useDrag } from '@use-gesture/react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { config } from 'folds';
import { ArrowBendUpLeftIcon, getPhosphorIconSize } from '$components/icons/phosphor';
import { mobileOrTablet } from '$utils/user-agent';
import { RightSwipeAction, settingsAtom } from '$state/settings';

const getGestureTargetElement = (target: EventTarget | null): Element | null => {
  if (target instanceof Element) return target;
  if (target instanceof Text) return target.parentElement;
  return null;
};

const shouldIgnoreSwipeGesture = (target: EventTarget | null): boolean => {
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) return true;

  const element = getGestureTargetElement(target);
  if (!element) return false;

  return !!element.closest(
    'a, button, input, textarea, select, video, audio, [contenteditable="true"], [data-gestures="ignore"]'
  );
};

function ActiveSwipeWrapper({ children, onReply }: { children: ReactNode; onReply: () => void }) {
  const x = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 35 });
  const [isReady, setIsReady] = useState(false);
  const iconOpacity = useTransform(x, [0, -8], [0, 1]);

  const bind = useDrag(
    ({ active, movement: [mx], event }) => {
      if (shouldIgnoreSwipeGesture(event?.target ?? null)) {
        return;
      }

      if (active) {
        const val = mx < 0 ? mx : 0;
        x.set(Math.max(-80, val));
        if (mx < -80 !== isReady) setIsReady(mx < -80);
      } else {
        if (mx < -80) onReply();
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
      <motion.div style={{ x: springX, position: 'relative', zIndex: 1 }}>{children}</motion.div>
    </div>
  );
}

export function SwipeableMessageWrapper({
  children,
  onReply,
}: {
  children: ReactNode;
  onReply: () => void;
}) {
  const settings = useAtomValue(settingsAtom);

  const isSwipeToReplyEnabled = useMemo(
    () =>
      settings.mobileGestures &&
      mobileOrTablet() &&
      settings.rightSwipeAction !== RightSwipeAction.Members,
    [settings.mobileGestures, settings.rightSwipeAction]
  );

  if (!isSwipeToReplyEnabled) {
    return children;
  }

  return <ActiveSwipeWrapper onReply={onReply}>{children}</ActiveSwipeWrapper>;
}
