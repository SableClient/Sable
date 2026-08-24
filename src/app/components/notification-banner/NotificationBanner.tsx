import { useAtom } from 'jotai';
import type { TouchEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Text } from 'folds';
import { sizedIcon, X } from '$components/icons/phosphor';
import { createLogger } from '$utils/debug';
import type { InAppBannerNotification } from '$state/sessions';
import { inAppBannerAtom } from '$state/sessions';
import { MessagePreview, useRoomMessagePreviewRenderer } from '$components/message-preview';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import * as css from './NotificationBanner.css';

const log = createLogger('NotificationBanner');
const BANNER_DURATION_MS = 5000;
const DISMISS_SWIPE_DISTANCE = 150;

// Renders body text capped at a max height with a gradient fade when it overflows.
function BodyText({ text, hovered }: { text: string; hovered: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflow(el.scrollHeight > el.clientHeight);
  }, [text]);

  return (
    <div ref={ref} className={css.BannerBody} data-overflow={overflow} data-hovered={hovered}>
      <Text size="T200" priority="300">
        {text}
      </Text>
    </div>
  );
}

type BannerItemProps = {
  notification: InAppBannerNotification;
  onDismiss: (id: string) => void;
};

function BannerMessage({ notification }: { notification: InAppBannerNotification }) {
  const room = notification.room!;
  const event = notification.event!;
  const renderContent = useRoomMessagePreviewRenderer(room);
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  return (
    <MessagePreview
      room={room}
      event={event}
      renderContent={renderContent}
      actions={
        notification.roomName && (
          <Text size="T200" priority="300" truncate>
            #{notification.roomName}
          </Text>
        )
      }
      hour24Clock={hour24Clock}
      dateFormatString={dateFormatString}
    />
  );
}

type DismissDirection = 'up' | 'left' | 'right';

function BannerItem({ notification, onDismiss }: BannerItemProps) {
  const [dismissing, setDismissing] = useState<DismissDirection | undefined>();
  const [paused, setPaused] = useState(false);
  const dismissAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedRef = useRef(0);

  const [gesture, setGesture] = useState<{ startX: number; startY: number } | undefined>();
  const [swipeDistance, setSwipeDistance] = useState(0);

  // Use a ref to guard against double-dismiss without creating a new callback identity.
  const dismiss = useCallback(
    (direction: DismissDirection) => {
      if (dismissing) return;
      setDismissing(direction);
      dismissAnimTimerRef.current = setTimeout(() => onDismiss(notification.id), 200);
    },
    [notification.id, onDismiss, dismissing]
  );

  // Auto-dismiss timer  Eonly runs when not paused.
  useEffect(() => {
    if (paused) return undefined;
    const remaining = BANNER_DURATION_MS - elapsedRef.current;
    if (remaining <= 0) {
      dismiss('up');
      return undefined;
    }
    const startedAt = Date.now();
    const t = setTimeout(() => dismiss('up'), remaining);
    return () => {
      clearTimeout(t);
      // Accumulate time spent un-paused so we can resume from the right point.
      elapsedRef.current += Date.now() - startedAt;
    };
  }, [paused, dismiss]);

  useEffect(
    () => () => {
      if (dismissAnimTimerRef.current) clearTimeout(dismissAnimTimerRef.current);
    },
    []
  );

  const handleClick = () => {
    notification.onClick();
    dismiss('up');
  };

  // When hovering, pause the auto-dismiss timer.
  const handleMouseEnter = useCallback(() => setPaused(true), []);
  const handleMouseLeave = useCallback(() => setPaused(false), []);

  const release = useCallback(
    (commit: boolean) => {
      setPaused(false);

      if (commit && Math.abs(swipeDistance) > DISMISS_SWIPE_DISTANCE) {
        // Continue off the side of the screen
        dismiss(swipeDistance > 0 ? 'right' : 'left');
      } else {
        // Spring back to center
        setSwipeDistance(0);
        setGesture(undefined);
      }
    },
    [dismiss, swipeDistance]
  );

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || event.touches.length !== 1) {
        release(false);
        return;
      }

      setPaused(true);

      setGesture({
        startX: touch.clientX,
        startY: touch.clientY,
      });
    },
    [release]
  );
  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      if (dismissing) return;
      const touch = event.touches[0];
      if (!gesture || !touch) return;

      setSwipeDistance(touch.clientX - gesture.startX);
    },
    [dismissing, gesture]
  );
  const handleTouchEnd = useCallback(() => {
    if (dismissing) return;
    release(true);
  }, [dismissing, release]);
  const handleTouchCancel = useCallback(() => {
    if (dismissing) return;
    release(false);
  }, [dismissing, release]);

  return (
    <div
      className={css.BannerWrapper}
      data-dismissing={dismissing}
      data-swiping={gesture !== undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchCancel={handleTouchCancel}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: `translateX(${swipeDistance}px)`,
        willChange: 'transform',
      }}
    >
      <div
        className={css.Banner}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick();
          if (e.key === 'Escape') dismiss('up');
        }}
      >
        {!notification.event && notification.icon && (
          <img
            src={notification.icon}
            alt=""
            className={css.BannerIcon}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        <div className={css.BannerContent}>
          {notification.room && notification.event ? (
            <BannerMessage notification={notification} />
          ) : (
            <>
              <Text size="T300" truncate className={css.BannerTitle}>
                {notification.senderName ?? notification.title}
                {(notification.roomName || notification.serverName) && (
                  <span className={css.BannerSubtitle}>
                    {' ('}
                    {notification.roomName && `#${notification.roomName}`}
                    {notification.roomName && notification.serverName && ', '}
                    {notification.serverName})
                  </span>
                )}
              </Text>
              {notification.body && <BodyText text={notification.body} hovered={paused} />}
            </>
          )}
        </div>
        <Box shrink="No">
          <IconButton
            size="300"
            variant="Surface"
            fill="None"
            radii="300"
            onClick={(e) => {
              e.stopPropagation();
              dismiss('up');
            }}
            aria-label="Dismiss notification"
          >
            {sizedIcon(X, '100')}
          </IconButton>
        </Box>
        <div
          className={css.ProgressBar}
          data-paused={paused}
          style={{ animationDuration: `${BANNER_DURATION_MS}ms` }}
        />
      </div>
    </div>
  );
}

/**
 * Renders the in-app notification banner stack.
 * Mount this once near the root of the client layout.
 */
export function NotificationBanner() {
  // We store an array locally so multiple rapid notifications stack briefly.
  const [banner, setBanner] = useAtom(inAppBannerAtom);
  const [queue, setQueue] = useState<InAppBannerNotification[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  log.log('[Banner] Component render, queue length:', queue.length, 'banner:', banner);

  // Adjust banner position for iOS keyboard
  useEffect(() => {
    // Only apply on iOS/browsers that support visualViewport
    if (!('visualViewport' in window)) return undefined;

    const updatePosition = () => {
      const container = containerRef.current;
      if (!container) return;

      const visualViewport = window.visualViewport!;
      // The banner is fixed to the layout viewport, so iOS scrolls it off the top when the
      // keyboard pushes the visual viewport down. offsetTop is that shift.
      const shift = Math.round(visualViewport.offsetTop);

      if (shift > 0) {
        // Keep the safe-area inset, otherwise the banner slides under the status bar.
        container.style.top = `calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + ${shift}px)`;
      } else {
        // Reset to CSS default (env(safe-area-inset-top))
        container.style.top = '';
      }
    };

    const visualViewport = window.visualViewport!;
    visualViewport.addEventListener('resize', updatePosition);
    visualViewport.addEventListener('scroll', updatePosition);
    updatePosition(); // Initial position

    return () => {
      visualViewport.removeEventListener('resize', updatePosition);
      visualViewport.removeEventListener('scroll', updatePosition);
    };
  }, []);

  // Push new notifications into the local queue.
  useEffect(() => {
    if (!banner) return;
    log.log('[Banner] New banner from atom:', banner.id, banner.title);
    setQueue((prev) => {
      // De-duplicate by id
      if (prev.some((n) => n.id === banner.id)) {
        log.log('[Banner] Duplicate banner, skipping:', banner.id);
        return prev;
      }
      // Keep at most 3 visible at once  Edrop the oldest if over limit.
      const next = [...prev, banner];
      log.log('[Banner] Adding to queue, new length:', next.length);
      return next.length > 3 ? next.slice(next.length - 3) : next;
    });
    // Clear the atom so the same notification doesn't re-enqueue on re-render.
    setBanner(null);
  }, [banner, setBanner]);

  const handleDismiss = (id: string) => {
    log.log('[Banner] Dismissing banner:', id);
    setQueue((prev) => prev.filter((n) => n.id !== id));
  };

  if (queue.length === 0) {
    log.log('[Banner] No banners in queue, returning null');
    return null;
  }

  log.log('[Banner] Rendering', queue.length, 'banners');
  return (
    <div ref={containerRef} className={css.BannerContainer} aria-live="polite" aria-atomic="false">
      {queue.map((n) => (
        <BannerItem key={n.id} notification={n} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}
