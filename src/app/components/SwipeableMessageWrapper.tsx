import type { ReactNode } from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { ArrowBendUpLeftIcon, PencilSimple, getPhosphorIconSize } from '$components/icons/phosphor';
import { haptic } from '$utils/haptics';
import { isMobileOrTablet } from '$utils/platform';
import { RightSwipeAction, settingsAtom } from '$state/settings';
import { useMobileNavDrawer } from '$components/page/MobileNavDrawerContext';
import {
  classifyMobileGesture,
  type MobileGestureMode,
} from '$components/page/mobileSwipeCoordinator';
import {
  getTranslateX,
  NATIVE_EASE_OUT,
  setTranslateX,
  transitionTo,
} from '$utils/nativeAnimation';

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
  const messageRef = useRef<HTMLDivElement | null>(null);
  const actionRef = useRef<HTMLDivElement | null>(null);
  const xRef = useRef(0);
  const [actionMode, setActionMode] = useState<SwipeActionMode>('none');
  const actionModeRef = useRef<SwipeActionMode>('none');
  const gestureActiveRef = useRef(false);
  const settleRef = useRef<{ cancel: () => void } | undefined>(undefined);
  const drawer = useMobileNavDrawer();

  const setOffset = useCallback((value: number) => {
    xRef.current = value;
    if (messageRef.current) setTranslateX(messageRef.current, value);
    if (actionRef.current) {
      actionRef.current.style.width = `${Math.abs(Math.min(0, value))}px`;
      actionRef.current.style.opacity = `${Math.min(1, Math.max(0, -value / 24))}`;
    }
  }, []);

  const cancelSettle = useCallback(() => {
    const message = messageRef.current;
    const liveOffset = message ? getTranslateX(message, xRef.current) : xRef.current;
    settleRef.current?.cancel();
    settleRef.current = undefined;
    if (message) message.style.transition = 'none';
    if (actionRef.current) actionRef.current.style.transition = 'none';
    setOffset(liveOffset);
  }, [setOffset]);

  const settleToRest = useCallback(() => {
    const message = messageRef.current;
    const action = actionRef.current;
    if (!message || !action) return;

    cancelSettle();
    const transition = `transform 220ms ${NATIVE_EASE_OUT}`;
    const actionTransition = `width 220ms ${NATIVE_EASE_OUT}, opacity 220ms ${NATIVE_EASE_OUT}`;
    action.style.transition = actionTransition;
    settleRef.current = transitionTo(
      message,
      transition,
      () => setOffset(0),
      220,
      () => {
        settleRef.current = undefined;
      }
    );
  }, [cancelSettle, setOffset]);

  const move = useCallback(
    (distanceX: number) => {
      if (!gestureActiveRef.current) {
        gestureActiveRef.current = true;
        cancelSettle();
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
      setOffset(-smoothedDist);

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
    [cancelSettle, onActionModeChange, onEdit, setOffset]
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
      settleToRest();
      actionModeRef.current = 'none';
      setActionMode('none');
      onActionModeChange?.('none');
    },
    [onActionModeChange, onEdit, onReply, settleToRest]
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

  // Above the mobile breakpoint there is no nav drawer to coordinate the touch,
  // so track it on the message itself. Tablets and touch desktops reach this;
  // iPadOS in fullscreen is the case that has no drawer but is still a touch device.
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (drawer || !element) return undefined;

    let gesture: { startX: number; startY: number; mode: MobileGestureMode } | undefined;
    const release = (commit: boolean) => {
      const active = gesture?.mode === 'message';
      gesture = undefined;
      if (active) finish(commit);
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || event.touches.length !== 1) {
        release(false);
        return;
      }
      gesture = { startX: touch.clientX, startY: touch.clientY, mode: 'pending' };
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!gesture || !touch) return;
      if (gesture.mode === 'blocked' || gesture.mode === 'vertical') return;

      const distanceX = touch.clientX - gesture.startX;
      if (gesture.mode === 'pending') {
        // width 0 and canOpenRoom false leave `drawer` unreachable, so this only
        // ever resolves to vertical, message, or blocked.
        gesture.mode = classifyMobileGesture({
          distanceX,
          distanceY: touch.clientY - gesture.startY,
          startPosition: 0,
          width: 0,
          canOpenRoom: false,
          hasMessage: true,
          hasChat: false,
        });
      }
      if (gesture.mode === 'message') move(distanceX);
    };

    const onTouchEnd = () => release(true);
    const onTouchCancel = () => release(false);

    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: true });
    element.addEventListener('touchend', onTouchEnd, { passive: true });
    element.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchCancel);
      release(false);
    };
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
      <div
        ref={actionRef}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
          pointerEvents: 'none',
          overflow: 'hidden',
          opacity: 0,
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
      </div>

      <div
        ref={messageRef}
        style={{
          transform: 'translate3d(0, 0, 0)',
          position: 'relative',
          zIndex: 2,
          willChange: 'transform',
        }}
      >
        {children}
      </div>
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
    () => isMobileOrTablet() && settings.rightSwipeAction !== RightSwipeAction.Members,
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
