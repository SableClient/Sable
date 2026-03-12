import { useAtom } from 'jotai';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Box, Icon, IconButton, Icons, Text } from 'folds';
import { createLogger } from '$utils/debug';
import { inAppBannerAtom, InAppBannerNotification } from '$state/sessions';
import * as css from './NotificationBanner.css';

const log = createLogger('NotificationBanner');
const BANNER_DURATION_MS = 5000;

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

// Same as BodyText but renders a pre-built ReactNode (rich HTML with mxc/mention transforms).
function BodyNode({ node, hovered }: { node: ReactNode; hovered: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflow(el.scrollHeight > el.clientHeight);
  }, [node]);

  return (
    <div ref={ref} className={css.BannerBody} data-overflow={overflow} data-hovered={hovered}>
      <Text size="T200" priority="300">
        {node}
      </Text>
    </div>
  );
}

type BannerItemProps = {
  notification: InAppBannerNotification;
  onDismiss: (id: string) => void;
};

function BannerItem({ notification, onDismiss }: BannerItemProps) {
  const [dismissing, setDismissing] = useState(false);
  const [paused, setPaused] = useState(false);
  const dismissedRef = useRef(false);
  const dismissAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedRef = useRef(0);

  // Use a ref to guard against double-dismiss without creating a new callback identity.
  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setDismissing(true);
    dismissAnimTimerRef.current = setTimeout(() => onDismiss(notification.id), 200);
  }, [notification.id, onDismiss]);

  // Auto-dismiss timer — only runs when not paused.
  useEffect(() => {
    if (paused) return undefined;
    const remaining = BANNER_DURATION_MS - elapsedRef.current;
    if (remaining <= 0) {
      dismiss();
      return undefined;
    }
    const startedAt = Date.now();
    const t = setTimeout(dismiss, remaining);
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
    dismiss();
  };

  // When hovering, pause the auto-dismiss timer.
  const handleMouseEnter = () => setPaused(true);
  const handleMouseLeave = () => setPaused(false);

  return (
    <div
      className={css.Banner}
      data-dismissing={dismissing}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick();
        if (e.key === 'Escape') dismiss();
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {notification.icon && (
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
        <Text size="T300" truncate className={css.BannerTitle}>
          {notification.senderName ?? notification.title}
          {(notification.roomName || notification.serverName) && (
            <span className={css.BannerSubtitle}>
              {' (​'}
              {notification.roomName && `#${notification.roomName}`}
              {notification.roomName && notification.serverName && ', '}
              {notification.serverName})
            </span>
          )}
        </Text>
        {notification.bodyNode ? (
          <BodyNode node={notification.bodyNode} hovered={paused} />
        ) : (
          notification.body && <BodyText text={notification.body} hovered={paused} />
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
            dismiss();
          }}
          aria-label="Dismiss notification"
        >
          <Icon size="100" src={Icons.Cross} />
        </IconButton>
      </Box>
      <div
        className={css.ProgressBar}
        data-paused={paused}
        style={{ animationDuration: `${BANNER_DURATION_MS - elapsedRef.current}ms` }}
      />
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
      // Calculate how much of the screen is covered by the keyboard
      // When keyboard opens, visualViewport.height shrinks
      const keyboardHeight = window.innerHeight - visualViewport.height;

      // Position the banner down by the keyboard height so it appears at the top of the visible area
      // This puts it "halfway down the page" when keyboard covers half the screen
      if (keyboardHeight > 0) {
        container.style.top = `${keyboardHeight}px`;
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
      // Keep at most 3 visible at once — drop the oldest if over limit.
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
