import { animate, useMotionValue, useTransform, motion } from 'motion/react';
import { useDrag } from '@use-gesture/react';
import { ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { config, Icon, Icons } from 'folds';
import { useIsMobile } from '$hooks/useIsMobile';
import { RightSwipeAction, settingsAtom } from '$state/settings';

const SWIPE_DISTANCE = 50;
const SWIPE_VELOCITY = 0.3;
const SNAP_SPRING = { type: 'spring' as const, stiffness: 600, damping: 50, mass: 0.6 };

function useLongPress(
  onLongPress: () => void,
  { delay = 500, moveThreshold = 8 }: { delay?: number; moveThreshold?: number } = {}
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    startPosRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => {
        onLongPress();
        cancel();
      }, delay);
    },
    [onLongPress, delay, cancel]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startPosRef.current) return;
      const dx = e.clientX - startPosRef.current.x;
      const dy = e.clientY - startPosRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > moveThreshold) cancel();
    },
    [cancel, moveThreshold]
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
  };
}

function ActiveSwipeWrapper({
  children,
  onReply,
  onLongPress,
}: {
  children: ReactNode;
  onReply: () => void;
  onLongPress?: () => void;
}) {
  const x = useMotionValue(0);
  const [isReady, setIsReady] = useState(false);
  const iconOpacity = useTransform(x, [0, -8], [0, 1]);
  const longPressHandlers = useLongPress(onLongPress ?? (() => {}), { delay: 500 });

  const bind = useDrag(
    ({ active, movement: [mx], velocity: [vx], direction: [dx] }) => {
      if (active) {
        x.set(mx < 0 ? Math.max(-80, mx) : 0);
        const nextReady = mx < -SWIPE_DISTANCE;
        if (nextReady !== isReady) setIsReady(nextReady);
      } else {
        if (mx < -SWIPE_DISTANCE || (vx > SWIPE_VELOCITY && dx < 0 && mx < 0)) onReply();
        setIsReady(false);
        animate(x, 0, SNAP_SPRING);
      }
    },
    {
      axis: 'x',
      bounds: { right: 0 },
      rubberband: true,
      filterTaps: true,
      eventOptions: { passive: true },
      // Without this, useDrag calls setPointerCapture on pointerdown, stealing the pointer from MobileRoomOverlay on rightward swipes, causing it to always see mx=0 and snap back instead of navigating.
      pointer: { capture: false },
    }
  );

  return (
    <div
      {...bind()}
      {...(onLongPress ? longPressHandlers : {})}
      style={{
        position: 'relative',
        touchAction: 'pan-y',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
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
              color: isReady
                ? 'var(--sable-surface-on-container)'
                : 'var(--sable-surface-container)',
              transition: 'color 0.15s',
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

function LongPressOnly({
  children,
  onLongPress,
}: {
  children: ReactNode;
  onLongPress: () => void;
}) {
  const handlers = useLongPress(onLongPress);
  return (
    <div
      {...handlers}
      style={{
        touchAction: 'pan-y pan-x',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {children}
    </div>
  );
}

export function SwipeableMessageWrapper({
  children,
  onReply,
  onLongPress,
}: {
  children: ReactNode;
  onReply: () => void;
  onLongPress?: () => void;
}) {
  const settings = useAtomValue(settingsAtom);
  const isMobile = useIsMobile();

  const isSwipeToReplyEnabled = useMemo(
    () =>
      settings.mobileGestures && isMobile && settings.rightSwipeAction !== RightSwipeAction.Members,
    [settings.mobileGestures, settings.rightSwipeAction, isMobile]
  );

  if (!isSwipeToReplyEnabled) {
    if (onLongPress && isMobile)
      return <LongPressOnly onLongPress={onLongPress}>{children}</LongPressOnly>;
    return <>{children}</>;
  }

  return (
    <ActiveSwipeWrapper onReply={onReply} onLongPress={onLongPress}>
      {children}
    </ActiveSwipeWrapper>
  );
}
