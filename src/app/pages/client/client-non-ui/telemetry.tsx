import { useAtomValue } from 'jotai';
import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { resolveSection } from '$pages/pathUtils';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { mDirectAtom } from '$state/mDirectList';
import { lastVisitedRoomAtom } from '$state/room/lastRoom';
import { settingsAtom } from '$state/settings';
import { getRenderableMediaUrlStats } from '$hooks/useRenderableMediaUrl';

// Periodically emits memory-health gauges so Sentry dashboards can surface
// unbounded growth (e.g. blob cache never evicted, stale inflight requests).
export function HealthMonitor() {
  useEffect(() => {
    const id = window.setInterval(() => {
      const { cacheSize, inflightCount } = getRenderableMediaUrlStats();
      Sentry.metrics.gauge('sable.media.blob_cache_size', cacheSize);
      if (inflightCount > 0) {
        Sentry.metrics.gauge('sable.media.inflight_requests', inflightCount);
        if (inflightCount >= 10) {
          Sentry.addBreadcrumb({
            category: 'media',
            message: `High inflight request count: ${inflightCount}`,
            level: 'warning',
            data: { inflight_count: inflightCount },
          });
        }
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return null;
}

/**
 * Tracks the currently-viewed room and writes sanitised room metadata to the Sentry scope.
 * This context appears on every subsequent error/transaction captured while the room is open,
 * making room-specific bugs much easier to triage.
 */
export function SentryRoomContextFeature() {
  const mx = useMatrixClient();
  const location = useLocation();
  const mDirect = useAtomValue(mDirectAtom);
  const lastRoom = useAtomValue(lastVisitedRoomAtom);
  const section = resolveSection(location.pathname);
  const roomId = section ? lastRoom?.[section.key] : undefined;

  useEffect(() => {
    if (!roomId) {
      Sentry.setContext('room', null);
      Sentry.setTag('room_type', 'none');
      Sentry.setTag('room_encrypted', 'none');
      return;
    }
    const room = mx.getRoom(roomId);
    if (!room) return;

    const isDm = mDirect.has(roomId);
    const encrypted = mx.isRoomEncrypted(roomId);
    const memberCount = room.getJoinedMemberCount();
    // Bucket member count so we can correlate issues with room scale
    // without leaking precise membership numbers of private rooms.
    let memberCountRange: string;
    if (memberCount <= 2) memberCountRange = '1-2';
    else if (memberCount <= 10) memberCountRange = '3-10';
    else if (memberCount <= 50) memberCountRange = '11-50';
    else if (memberCount <= 200) memberCountRange = '51-200';
    else memberCountRange = '200+';

    Sentry.setContext('room', {
      type: isDm ? 'dm' : 'group',
      encrypted,
      member_count_range: memberCountRange,
    });
    // Also set as tags so they can be used to filter events in Sentry
    Sentry.setTag('room_type', isDm ? 'dm' : 'group');
    Sentry.setTag('room_encrypted', String(encrypted));
  }, [mx, mDirect, roomId]);

  return null;
}

export function SentryTagsFeature() {
  const settings = useAtomValue(settingsAtom);

  useEffect(() => {
    // Core rendering tags — indexed in Sentry for filtering/search
    Sentry.setTag('message_layout', String(settings.messageLayout));
    Sentry.setTag('message_spacing', settings.messageSpacing);
    Sentry.setTag('twitter_emoji', String(settings.twitterEmoji));
    Sentry.setTag('page_zoom', String(settings.pageZoom));
    if (settings.themeId) Sentry.setTag('theme_id', settings.themeId);
    // Additional high-value tags for bug reproduction
    Sentry.setTag('use_right_bubbles', String(settings.useRightBubbles));
    Sentry.setTag('reduced_motion', String(settings.reducedMotion));
    Sentry.setTag('send_presence', String(settings.sendPresence));
    Sentry.setTag('enter_for_newline', String(settings.enterForNewline));
    Sentry.setTag('media_auto_load', String(settings.mediaAutoLoad));
    Sentry.setTag('url_preview', String(settings.urlPreview));
    Sentry.setTag('use_system_theme', String(settings.useSystemTheme));
    Sentry.setTag('uniform_icons', String(settings.uniformIcons));
    Sentry.setTag('jumbo_emoji_size', settings.jumboEmojiSize);
    Sentry.setTag('caption_position', settings.captionPosition);
    Sentry.setTag('right_swipe_action', settings.rightSwipeAction);
    // Full settings snapshot as structured Additional Data on every event
    Sentry.setContext('settings', { ...settings });
  }, [settings]);

  return null;
}
