import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Box } from 'folds';
import * as css from '$features/room/message/styles.css';

interface MobileSwipeDownModalProps {
  children: (
    dragHandle: React.ReactNode,
    dragHandlers: {
      onTouchStart: (e: React.TouchEvent) => void;
      onTouchMove: (e: React.TouchEvent) => void;
      onTouchEnd: () => void;
    }
  ) => React.ReactNode;
  requestClose: () => void;
}

export function MobileSwipeDownModal({ children, requestClose }: MobileSwipeDownModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const touchYDiff = useRef(0);
  const startTime = useRef(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
    startTime.current = Date.now();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null || !e.touches[0]) return;
    const touchY = e.touches[0].clientY;
    const diff = touchY - touchStartY.current;

    // Only allow pulling down
    if (diff > 0) {
      touchYDiff.current = diff;
      if (containerRef.current) {
        containerRef.current.style.transform = `translateY(${diff}px)`;
        containerRef.current.style.transition = 'none';
      }
    }
  };

  const handleTouchEnd = () => {
    const endTime = Date.now();
    if (
      touchYDiff.current > 100 ||
      (endTime - startTime.current < 600 && touchYDiff.current > 20)
    ) {
      requestClose();
    } else {
      touchYDiff.current = 0;
      if (containerRef.current) {
        containerRef.current.style.transform = '';
        containerRef.current.style.transition = 'transform 0.2s ease-out';
      }
    }
    touchStartY.current = null;
  };

  const dragHandlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };

  const dragHandleJSX = (
    <div className={css.MessageMobileDragHandle} {...dragHandlers}>
      <div className={css.MessageMobileDragIndicator} />
    </div>
  );

  if (!mounted) return null;

  return createPortal(
    <Box
      className={css.MessageMobileOptionsWrapped}
      data-gestures="ignore"
      onClick={requestClose}
      onTouchStart={(e: React.TouchEvent) => e.stopPropagation()}
      onTouchMove={(e: React.TouchEvent) => e.stopPropagation()}
      onTouchEnd={(e: React.TouchEvent) => e.stopPropagation()}
    >
      <Box
        ref={containerRef}
        className={css.MessageMobileOptionsContainer}
        style={{
          transform: touchYDiff.current > 0 ? `translateY(${touchYDiff.current}px)` : undefined,
          transition: touchStartY.current === null ? 'transform 0.2s ease-out' : 'none',
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {children(dragHandleJSX, dragHandlers)}
      </Box>
    </Box>,
    document.body
  );
}
