import { useMotionValue, useTransform, motion, animate } from 'framer-motion';
import type { ReactNode } from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { ArrowBendUpLeftIcon, PencilSimple, getPhosphorIconSize } from '$components/icons/phosphor';
import { haptic } from '$utils/haptics';
import { mobileOrTablet } from '$utils/user-agent';
import { RightSwipeAction, settingsAtom } from '$state/settings';
import { useMobileNavDrawer } from '$components/page/MobileNavDrawerContext';

export type SwipeActionMode = 'none' | 'reply' | 'edit';

function ActiveSwipeWrapper({
  children,
  onReply,
  onEdit,
  onActionModeChange,
}: {
  children: ReactNode;
  onReply: () => void;
  onEdit?: () => void;
  onActionModeChange?: (mode: SwipeActionMode) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);
  const [actionMode, setActionMode] = useState<SwipeActionMode>('none');
  const actionModeRef = useRef<SwipeActionMode>('none');
  const gestureActiveRef = useRef(false);
  const iconOpacity = useTransform(x, [0, -24], [0, 1]);
  const gapWidth = useTransform(x, (val) => Math.abs(Math.min(0, val)));
  const drawer = useMobileNavDrawer();

  const move = useCallback(
    (distanceX: number) => {
      if (!gestureActiveRef.current) {
        gestureActiveRef.current = true;
        x.stop();
      }

      const width = containerRef.current?.clientWidth || 360;
      const replyThreshold = -Math.min(50, width * 0.2);
      const linearLimit = onEdit ? Math.min(100, width * 0.32) : Math.min(60, width * 0.18);
      // Enter edit only deep into the resistant tail, when the message is
      // visually close to its maximum travel.
      const editThreshold = -(linearLimit + 90);

      const dragDist = Math.abs(Math.min(0, distanceX));
      let smoothedDist = dragDist;

      if (dragDist > linearLimit) {
        const excess = dragDist - linearLimit;
        const maxExcess = 45;
        smoothedDist = linearLimit + maxExcess * (1 - Math.exp(-excess / 40));
      }
      x.set(-smoothedDist);

      let nextMode: SwipeActionMode = 'none';
      if (onEdit && distanceX < editThreshold) {
        nextMode = 'edit';
      } else if (distanceX < replyThreshold) {
        nextMode = 'reply';
      }

      if (nextMode !== actionModeRef.current) {
        actionModeRef.current = nextMode;
        setActionMode(nextMode);
        onActionModeChange?.(nextMode);
        if (nextMode !== 'none') {
          haptic(nextMode === 'edit' ? 'medium' : 'selection');
        }
      }
    },
    [onActionModeChange, onEdit, x]
  );

  const finish = useCallback(
    (commit: boolean) => {
      if (commit) {
        const currentMode = actionModeRef.current;
        if (currentMode === 'edit' && onEdit) {
          onEdit();
        } else if (currentMode === 'reply') {
          onReply();
        }
      }

      gestureActiveRef.current = false;
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 26 });
      actionModeRef.current = 'none';
      setActionMode('none');
      onActionModeChange?.('none');
    },
    [onActionModeChange, onEdit, onReply, x]
  );

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!drawer || !element) return undefined;

    return drawer.registerMessageSwipe(element, {
      move,
      end: () => finish(true),
      cancel: () => finish(false),
    });
  }, [drawer, finish, move]);

  const IconComponent = actionMode === 'edit' ? PencilSimple : ArrowBendUpLeftIcon;
  const iconColor =
    actionMode === 'edit'
      ? 'var(--sable-primary-color, #6e56cf)'
      : actionMode === 'reply'
        ? 'var(--sable-surface-on-container, #ffffff)'
        : 'rgba(255, 255, 255, 0.6)';

  return (
    <div
      data-gestures="ignore"
      data-message-swipe
      ref={containerRef}
      style={{
        position: 'relative',
        touchAction: 'pan-y',
      }}
    >
      {/* Keep the action centered in the portion of the message background being revealed. */}
      <motion.div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: gapWidth,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
          pointerEvents: 'none',
          overflow: 'hidden',
          opacity: iconOpacity,
        }}
      >
        <IconComponent
          size={getPhosphorIconSize('toolbar')}
          style={{
            flexShrink: 0,
            color: iconColor,
            transition: 'color 0.2s, transform 0.2s',
            transform: actionMode === 'edit' ? 'scale(1.2)' : 'scale(1)',
          }}
        />
      </motion.div>

      <motion.div style={{ x, position: 'relative', zIndex: 2, willChange: 'transform' }}>
        {children}
      </motion.div>
    </div>
  );
}

export function SwipeableMessageWrapper({
  children,
  onReply,
  onEdit,
  onActionModeChange,
}: {
  children: ReactNode;
  onReply?: () => void;
  onEdit?: () => void;
  onActionModeChange?: (mode: SwipeActionMode) => void;
}) {
  const settings = useAtomValue(settingsAtom);

  const isSwipeToReplyEnabled = useMemo(
    () => mobileOrTablet() && settings.rightSwipeAction !== RightSwipeAction.Members,
    [settings.rightSwipeAction]
  );

  if (!isSwipeToReplyEnabled || !onReply) {
    return children;
  }

  return (
    <ActiveSwipeWrapper onReply={onReply} onEdit={onEdit} onActionModeChange={onActionModeChange}>
      {children}
    </ActiveSwipeWrapper>
  );
}
