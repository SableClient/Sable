import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import * as Sentry from '@sentry/react';
import type { ReactNode } from 'react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchIndexProvider } from '$hooks/useSearchIndex';
import type { RoomEventHandlerMap } from '$types/matrix-sdk';
import {
  MatrixEvent,
  MatrixEventEvent,
  PushProcessor,
  RoomEvent,
  SyncState,
  EventType,
} from '$types/matrix-sdk';
import parse from 'html-react-parser';
import { getReactCustomHtmlParser, LINKIFY_OPTS } from '$plugins/react-custom-html-parser';
import { sanitizeCustomHtml } from '$utils/sanitize';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import LogoSVG from '$public/res/svg/logo.svg';
import LogoUnreadSVG from '$public/res/svg/unread.svg';
import LogoHighlightSVG from '$public/res/svg/highlight.svg';
import NotificationSound from '$public/sound/notification.ogg';
import InviteSound from '$public/sound/invite.ogg';
import { notificationPermission, setFavicon } from '$utils/dom';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { IconSizesProvider } from '$components/icons/phosphor';
import { nicknamesAtom } from '$state/nicknames';
import { mDirectAtom } from '$state/mDirectList';
import { allInvitesAtom } from '$state/room-list/inviteList';
import { usePreviousValue } from '$hooks/usePreviousValue';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useClientConfig } from '$hooks/useClientConfig';
import {
  getMemberDisplayName,
  getNotificationType,
  getStateEvent,
  isDMRoom,
  isNotificationEvent,
} from '$utils/room';
import { NotificationType } from '$types/matrix/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { useInboxNotificationsSelected } from '$hooks/router/useInbox';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import { registrationAtom } from '$state/serviceWorkerRegistration';
import { inAppBannerAtom, activeSessionIdAtom } from '$state/sessions';
import { pushSubscriptionAtom } from '$state/pushSubscription';
import {
  buildRoomMessageNotification,
  resolveNotificationPreviewText,
} from '$utils/notificationStyle';
import { mobileOrTablet } from '$utils/user-agent';
import { createDebugLogger } from '$utils/debugLogger';
import { shouldShowNotificationInFocusMode } from '$utils/focusMode';
import { useSlidingSyncActiveRoom } from '$hooks/useSlidingSyncActiveRoom';
import { NotificationBanner } from '$components/notification-banner';
import { useCallSignaling } from '$hooks/useCallSignaling';
import { getRenderableMediaUrlStats } from '$hooks/useRenderableMediaUrl';
import { isStartupShellReady, subscribeStartupShellReady } from '$utils/perfTelemetry';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';

// Lazy-load banners to reduce initial bundle size - these are rarely shown on first load
const ThemeMigrationBanner = lazy(() => {
  const start = performance.now();
  return import('$components/theme/ThemeMigrationBanner').then((m) => {
    const duration = performance.now() - start;
    Sentry.metrics.distribution('sable.startup.lazy_load_ms', duration, {
      attributes: { component: 'theme_migration_banner' },
    });
    return { default: m.ThemeMigrationBanner };
  });
});

const TelemetryConsentBanner = lazy(() => {
  const start = performance.now();
  return import('$components/telemetry-consent').then((m) => {
    const duration = performance.now() - start;
    Sentry.metrics.distribution('sable.startup.lazy_load_ms', duration, {
      attributes: { component: 'telemetry_consent_banner' },
    });
    return { default: m.TelemetryConsentBanner };
  });
});
import { lastVisitedRoomIdAtom } from '$state/room/lastRoom';
import { useSettingsSyncEffect } from '$hooks/useSettingsSync';
import { usePresenceSyncEffect } from '$hooks/usePresenceSync';
import { usePresenceAutoIdle } from '$hooks/usePresenceAutoIdle';
import { useNotificationDeviceScope } from '$hooks/useNotificationDeviceScope';
import { useInitBookmarks } from '$features/bookmarks/useInitBookmarks';
import { useReminderSync } from '$features/bookmarks/useReminderSync';
import { clearLaunchContext } from '../../../launch-context-persistence';
import { getInboxBookmarksPath, getInboxInvitesPath, getToRoomEventPath } from '$pages/pathUtils';
import {
  buildNotificationBreadcrumb,
  buildNotificationMetricAttributes,
} from '$utils/notificationTelemetry';
import { BackgroundNotifications } from './BackgroundNotifications';
import {
  NotificationTransportRuntime,
  type NotificationTransportRuntimeContext,
} from '$features/settings/notifications/NotificationTransportRuntime';
import {
  isWebPushSupported,
  reconcilePushNotifications,
} from '$features/settings/notifications/PushNotifications';
import {
  normalizeNotificationTransportMode,
  resolvePreferredNotificationTransportProvider,
  type NotificationTransportPlatform,
} from '$features/settings/notifications/NotificationTransport';
const pushRelayLog = createDebugLogger('push-relay');
const transportLog = createDebugLogger('push-transport');
function clearMediaSessionQuickly(): void {
  if (!('mediaSession' in navigator)) return;
  // iOS can register the lock-screen media player as a side effect of
  // playing short notification sounds. Clear that transient session unless
  // real media has since claimed it.
  setTimeout(() => {
    if (navigator.mediaSession.metadata !== null) return;
    navigator.mediaSession.playbackState = 'none';
  }, 500);
}

function postToServiceWorker(data: unknown): void {
  if (!('serviceWorker' in navigator)) return;

  const posted = new Set<ServiceWorker>();
  const postToWorker = (worker: ServiceWorker | null | undefined) => {
    if (!worker || posted.has(worker)) return;
    posted.add(worker);
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    worker.postMessage(data);
  };

  postToWorker(navigator.serviceWorker.controller);
  navigator.serviceWorker.ready
    .then((registration) => {
      postToWorker(registration.active);
      postToWorker(registration.waiting);
      postToWorker(registration.installing);
    })
    .catch(() => undefined);
}

function postToServiceWorkerSource(source: MessageEventSource | null, data: unknown): boolean {
  if (!(source instanceof ServiceWorker)) return false;

  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  source.postMessage(data);
  return true;
}

function navigateToServiceWorkerUrl(navigate: ReturnType<typeof useNavigate>, url: string): void {
  try {
    const target = new URL(url, window.location.origin);
    if (target.origin === window.location.origin) {
      navigate(`${target.pathname}${target.search}${target.hash}`);
      return;
    }
  } catch {
    // Fall through to browser navigation for malformed/relative strings.
  }
  window.location.assign(url);
}

function navigateToRoomNotificationTarget(
  navigate: ReturnType<typeof useNavigate>,
  userId: string | undefined,
  roomId: string,
  eventId?: string,
  options?: { swClickId?: string; jumpMode?: 'notification_live' | 'history_context' }
): void {
  if (!userId) return;
  navigate(getToRoomEventPath(userId, roomId, eventId, options));
}

function WebPushStartupReconciler() {
  const mx = useMatrixClient();
  const clientConfig = useClientConfig();
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const pushSubscription = useAtom(pushSubscriptionAtom);
  const { isActiveNotificationClient, notificationDeviceScope } = useNotificationDeviceScope(mx);
  const reconciledKeyRef = useRef<string | null>(null);
  const shouldEnablePusher =
    document.visibilityState === 'visible'
      ? mobileOrTablet() ||
        (notificationDeviceScope === 'active_client_only' && isActiveNotificationClient)
      : notificationDeviceScope !== 'active_client_only' || isActiveNotificationClient;

  useEffect(() => {
    if (!usePushNotifications || isTauri()) return;
    if (!isWebPushSupported()) return;

    const userId = mx.getUserId() ?? null;
    if (!userId) return;
    const reconcileKey = [
      userId,
      document.visibilityState,
      shouldEnablePusher ? 'enabled' : 'disabled',
    ].join(':');
    if (reconciledKeyRef.current === reconcileKey) return;

    reconciledKeyRef.current = reconcileKey;
    void reconcilePushNotifications(
      mx,
      clientConfig,
      shouldEnablePusher,
      usePushNotifications,
      pushSubscription
    ).catch((error) => {
      reconciledKeyRef.current = null;
      transportLog.warn('notification', 'Web push startup reconciliation failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, [mx, clientConfig, pushSubscription, usePushNotifications, shouldEnablePusher]);

  return null;
}

function SystemEmojiFeature() {
  const [twitterEmoji] = useSetting(settingsAtom, 'twitterEmoji');

  useEffect(() => {
    const root = document.documentElement;
    const updateMobileDataset = () => {
      root.dataset.sableMobile = mobileOrTablet() ? 'true' : 'false';
    };

    updateMobileDataset();
    root.dataset.sableEmojiStyle = twitterEmoji ? 'twemoji' : 'system';
    root.dataset.sableEmojiEffectiveStyle = twitterEmoji ? 'twemoji' : 'system';
    root.style.setProperty('--font-emoji', twitterEmoji ? 'Twemoji' : 'Twemoji_DISABLED');
    window.addEventListener('resize', updateMobileDataset);

    let cancelled = false;

    const updateEffectiveEmojiStyle = async () => {
      try {
        const sampleEmoji = '🫩';
        await document.fonts.load('16px "Twemoji"', sampleEmoji);
        await document.fonts.ready;
        if (cancelled) return;

        const hasTwemoji = document.fonts.check('16px "Twemoji"', sampleEmoji);
        root.dataset.sableEmojiEffectiveStyle = hasTwemoji ? 'twemoji' : 'system';
      } catch {
        if (cancelled) return;
        root.dataset.sableEmojiEffectiveStyle = 'system';
      }
    };

    if (twitterEmoji && 'fonts' in document) {
      void updateEffectiveEmojiStyle();
    }

    return () => {
      cancelled = true;
      window.removeEventListener('resize', updateMobileDataset);
    };
  }, [twitterEmoji]);

  return null;
}

function PageZoomFeature() {
  const [pageZoom] = useSetting(settingsAtom, 'pageZoom');

  useEffect(() => {
    if (pageZoom === 100) {
      document.documentElement.style.removeProperty('font-size');
      return;
    }

    document.documentElement.style.setProperty('font-size', `calc(1em * ${pageZoom / 100})`);
  }, [pageZoom]);

  return null;
}

function FaviconUpdater() {
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const [faviconForMentionsOnly] = useSetting(settingsAtom, 'faviconForMentionsOnly');
  const registration = useAtomValue(registrationAtom);

  useEffect(() => {
    let notification = false;
    let highlight = false;
    let total = 0;
    let highlightTotal = 0;
    roomToUnread.forEach((unread) => {
      if (unread.from === null) {
        total += unread.total;
        highlightTotal += unread.highlight;
      }
      if (unread.total > 0) {
        notification = true;
      }
      if (unread.highlight > 0) {
        highlight = true;
      }
    });

    if (highlight) {
      setFavicon(LogoHighlightSVG);
    } else if (!faviconForMentionsOnly && notification) {
      setFavicon(LogoUnreadSVG);
    } else {
      setFavicon(LogoSVG);
    }
    try {
      // Only badge with highlight (mention) counts — total unread is too noisy
      // for an OS-level app badge.
      if (highlightTotal > 0) {
        navigator.setAppBadge(highlightTotal);
      } else {
        navigator.clearAppBadge();
      }
      if (usePushNotifications && registration) {
        if (total === 0) {
          // All rooms read — clear every notification.
          registration.getNotifications().then((notifs) => notifs.forEach((n) => n.close()));
        } else {
          // Dismiss notifications for individual rooms that are now fully read.
          registration.getNotifications().then((notifs) => {
            notifs.forEach((n) => {
              const notifRoomId = n.data?.room_id;
              if (!notifRoomId) return;
              const roomUnread = roomToUnread.get(notifRoomId);
              if (!roomUnread || (roomUnread.total === 0 && roomUnread.highlight === 0)) {
                n.close();
              }
            });
          });
        }
      }
    } catch {
      // Likely Firefox/Gecko-based and doesn't support badging API
    }
  }, [roomToUnread, usePushNotifications, registration, faviconForMentionsOnly]);

  return null;
}

function InviteNotifications() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const invites = useAtomValue(allInvitesAtom);
  const perviousInviteLen = usePreviousValue(invites.length, 0);
  const mx = useMatrixClient();

  const navigate = useNavigate();
  const [showSystemNotifications] = useSetting(settingsAtom, 'useSystemNotifications');
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');
  const [backgroundNotificationSounds] = useSetting(settingsAtom, 'backgroundNotificationSounds');
  const { isActiveNotificationClient } = useNotificationDeviceScope(mx);

  const notify = useCallback(
    (count: number) => {
      const noti = new window.Notification('Invitation', {
        icon: LogoSVG,
        badge: LogoSVG,
        body: `You have ${count} new invitation request.`,
        silent: true,
      });

      noti.addEventListener('click', () => {
        if (!window.closed) navigate(getInboxInvitesPath());
        noti.close();
      });
    },
    [navigate]
  );

  const playSound = useCallback(() => {
    const audioElement = audioRef.current;
    audioElement?.play()?.catch(() => {});
    clearMediaSessionQuickly();
  }, []);

  useEffect(() => {
    if (invites.length <= perviousInviteLen || mx.getSyncState() !== SyncState.Syncing) return;
    if (!isActiveNotificationClient) return;

    // SW push (via Sygnal) handles invite notifications when the app is backgrounded.
    if (document.visibilityState !== 'visible' && usePushNotifications) return;

    // OS notification for invites — desktop only.
    if (!mobileOrTablet() && showSystemNotifications && notificationPermission('granted')) {
      try {
        notify(invites.length - perviousInviteLen);
      } catch {
        // window.Notification may be unavailable in sandboxed environments.
      }
    }
    const tabVisible = document.visibilityState === 'visible';
    if (notificationSound && (tabVisible || backgroundNotificationSounds)) {
      playSound();
    }
  }, [
    mx,
    invites,
    perviousInviteLen,
    showSystemNotifications,
    usePushNotifications,
    notificationSound,
    backgroundNotificationSounds,
    isActiveNotificationClient,
    notify,
    playSound,
  ]);

  return (
    // oxlint-disable-next-line jsx-a11y/media-has-caption
    <audio ref={audioRef} style={{ display: 'none' }}>
      <source src={InviteSound} type="audio/ogg" />
    </audio>
  );
}

function MessageNotifications() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const notifiedEventsRef = useRef(new Set());
  // Record mount time so we can distinguish live events from historical backfill
  // on sliding sync proxies that don't set num_live (which causes liveEvent=false
  // for all events, including actually-new messages).
  const clientStartTimeRef = useRef(Date.now());
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const appBaseUrl = useSettingsLinkBaseUrl();
  const [showNotifications] = useSetting(settingsAtom, 'useInAppNotifications');
  const [showSystemNotifications] = useSetting(settingsAtom, 'useSystemNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');
  const [backgroundNotificationSounds] = useSetting(settingsAtom, 'backgroundNotificationSounds');
  const [showMessageContent] = useSetting(settingsAtom, 'showMessageContentInNotifications');
  const [showEncryptedMessageContent] = useSetting(
    settingsAtom,
    'showMessageContentInEncryptedNotifications'
  );
  const [focusMode] = useSetting(settingsAtom, 'focusMode');
  const { isActiveNotificationClient } = useNotificationDeviceScope(mx);

  const nicknames = useAtomValue(nicknamesAtom);
  const nicknamesRef = useRef(nicknames);
  nicknamesRef.current = nicknames;
  const mDirects = useAtomValue(mDirectAtom);
  const mDirectsRef = useRef(mDirects);
  mDirectsRef.current = mDirects;

  const setInAppBanner = useSetAtom(inAppBannerAtom);
  const notificationSelected = useInboxNotificationsSelected();
  const navigate = useNavigate();

  const playSound = useCallback(() => {
    const audioElement = audioRef.current;
    audioElement?.play()?.catch(() => {});
    clearMediaSessionQuickly();
  }, []);

  useEffect(() => {
    const pushProcessor = new PushProcessor(mx);
    // Track encrypted events that should skip focus check when decrypted (because we
    // already checked focus when the encrypted event arrived, and want to use that
    // original state rather than re-checking after decryption completes).
    const skipFocusCheckEvents = new Set<string>();
    // Tracks when each event first arrived so we can measure notification delivery latency
    const notifyTimerMap = new Map<string, number>();
    // Track pending decryption listeners to clean up on unmount
    const pendingDecryptListeners = new Map<string, () => void>();

    const handleTimelineEvent: RoomEventHandlerMap[RoomEvent.Timeline] = (
      mEvent,
      room,
      _toStartOfTimeline,
      _removed,
      data
    ) => {
      if (mx.getSyncState() !== SyncState.Syncing) return;
      if (!isActiveNotificationClient) return;

      const eventId = mEvent.getId();
      // Record event arrival time once per eventId (re-entry via handleDecrypted must not reset it)
      if (eventId && !notifyTimerMap.has(eventId)) {
        notifyTimerMap.set(eventId, performance.now());
      }
      const shouldSkipFocusCheck = eventId && skipFocusCheckEvents.has(eventId);
      if (!shouldSkipFocusCheck) {
        if (document.hasFocus() && notificationSelected) return;
      }

      // Older sliding sync proxies (e.g. matrix-sliding-sync) omit num_live,
      // which causes every event to arrive with fromCache=true and therefore
      // liveEvent=false — silently blocking all notifications. Fall back to an
      // age check: treat the event as potentially live only when it was sent
      // within 60 s of this component mounting (tight enough to avoid phantom
      // notifications for pre-existing unread messages, generous enough for
      // messages that arrived during a brief offline window).
      // Additionally, skip the event if the user already has a read receipt
      // covering it (message was read on another device before this session).
      const isHistoricalEvent =
        !data.liveEvent &&
        (mEvent.getTs() < clientStartTimeRef.current - 60 * 1000 ||
          (!!room && room.hasUserReadEvent(mx.getSafeUserId(), mEvent.getId()!)));

      // For encrypted events that haven't been decrypted yet, wait for decryption
      // before processing the notification. The SDK's Timeline re-emission after
      // decryption comes with data.liveEvent=false which would wrongly block it.
      if (mEvent.getType() === 'm.room.encrypted' && mEvent.isEncrypted()) {
        if (eventId) {
          // Mark this event to skip focus check when decrypted, so we use the focus
          // state from when the encrypted event originally arrived, not when it decrypts.
          skipFocusCheckEvents.add(eventId);
        }

        const handleDecrypted = () => {
          // After decryption, run the notification logic with the decrypted event
          handleTimelineEvent(mEvent, room, undefined, true, data);
          // Clean up the skip-focus marker and listener tracker
          if (eventId) {
            skipFocusCheckEvents.delete(eventId);
            pendingDecryptListeners.delete(eventId);
          }
        };
        mEvent.once(MatrixEventEvent.Decrypted, handleDecrypted);
        // Track listener for cleanup on unmount
        if (eventId) {
          pendingDecryptListeners.set(eventId, () =>
            mEvent.off(MatrixEventEvent.Decrypted, handleDecrypted)
          );
        }
        return;
      }

      if (!room || isHistoricalEvent || room.isSpaceRoom() || !isNotificationEvent(mEvent)) {
        return;
      }

      const notificationType = getNotificationType(mx, room.roomId);
      if (notificationType === NotificationType.Mute) {
        return;
      }

      const sender = mEvent.getSender();
      if (!sender || !eventId || mEvent.getSender() === mx.getUserId()) return;

      // Deduplicate: don't show a second banner if this event fires twice
      // (e.g., decrypted events re-emitted by the SDK).
      if (notifiedEventsRef.current.has(eventId)) return;

      // Check if this is a DM using multiple signals for robustness
      const isDM = isDMRoom(room, mDirectsRef.current);

      // Measure total notification delivery latency (includes decryption wait for E2EE events)
      const arrivalMs = notifyTimerMap.get(eventId);
      if (arrivalMs !== undefined) {
        Sentry.metrics.distribution(
          'sable.notification.delivery_ms',
          performance.now() - arrivalMs,
          {
            attributes: {
              encrypted: String(mEvent.isEncrypted()),
              dm: String(isDM),
            },
          }
        );
        notifyTimerMap.delete(eventId);
      }
      const pushActions = pushProcessor.actionsForEvent(mEvent);

      // For DMs with "All Messages" or "Default" notification settings:
      // Always notify even if push rules fail to match due to sliding sync limitations.
      // For "Mention & Keywords": respect the push rule (only notify if it matches).
      const shouldForceDMNotification =
        isDM && notificationType !== NotificationType.MentionsAndKeywords;
      const shouldNotify = pushActions?.notify || shouldForceDMNotification;

      // If we shouldn't notify based on rules/settings, skip everything
      if (!shouldNotify) return;

      const loudByRule = Boolean(pushActions.tweaks?.sound);
      const isHighlightByRule = Boolean(pushActions.tweaks?.highlight);

      // With sliding sync we only load m.room.member/$ME in required_state, so
      // PushProcessor cannot evaluate the room_member_count == 2 condition on
      // .m.rule.room_one_to_one.  That rule therefore fails to match, and DM
      // messages fall through to .m.rule.message which carries no sound tweak —
      // leaving loudByRule=false.  Treat known DMs as inherently loud so that
      // the OS notification and badge are consistent with the DM context.
      const isLoud = loudByRule || isDM;

      // Apply focus mode filter: check if this notification should be shown
      // based on the current focus mode setting.
      if (!shouldShowNotificationInFocusMode(focusMode, isDM, isHighlightByRule)) {
        return;
      }

      // Record as notified to prevent duplicate banners (e.g. re-emitted decrypted events).
      notifiedEventsRef.current.add(eventId);
      if (notifiedEventsRef.current.size > 200) {
        const first = notifiedEventsRef.current.values().next().value;
        if (first) notifiedEventsRef.current.delete(first);
      }

      // On desktop: fire an OS notification whenever system notifications are
      // enabled and permission is granted — regardless of whether the window is
      // focused. When the window is also visible the in-app banner fires too,
      // mirroring the behaviour of apps like Discord.
      // The whole block is wrapped in try/catch: window.Notification() can throw
      // in sandboxed environments, browsers with DnD active, or Electron — and
      // an uncaught exception here would abort the handler before setInAppBanner
      // is reached, causing in-app notifications to silently vanish too.
      if (!mobileOrTablet() && showSystemNotifications && notificationPermission('granted')) {
        try {
          const isEncryptedRoom = !!getStateEvent(room, EventType.RoomEncryption);
          const avatarMxc =
            room.getAvatarFallbackMember()?.getMxcAvatarUrl() ?? room.getMxcAvatarUrl();
          const osPayload = buildRoomMessageNotification({
            roomName: room.name ?? 'Unknown',
            roomAvatar: avatarMxc
              ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined)
              : undefined,
            username:
              getMemberDisplayName(room, sender, nicknamesRef.current) ??
              getMxIdLocalPart(sender) ??
              sender,
            previewText: resolveNotificationPreviewText({
              content: mEvent.getContent(),
              eventType: mEvent.getType(),
              effectiveType: mEvent.getEffectiveEvent()?.type as string | undefined,
              isEncryptedRoom,
              showMessageContent,
              showEncryptedMessageContent,
            }),
            silent: !notificationSound || !isLoud,
            eventId,
          });
          const noti = new window.Notification(osPayload.title, osPayload.options);
          const { roomId } = room;
          noti.addEventListener('click', () => {
            window.focus();
            navigateToRoomNotificationTarget(
              navigate,
              mx.getUserId() ?? undefined,
              roomId,
              eventId,
              { jumpMode: 'notification_live' }
            );
            noti.close();
          });
        } catch {
          // window.Notification unavailable or blocked (sandboxed context, DnD, etc.)
        }
      }

      const tabVisible = document.visibilityState === 'visible';
      if (notificationSound && isLoud && (tabVisible || backgroundNotificationSounds)) {
        playSound();
      }

      // In-app banner requires a visible tab.
      if (!tabVisible) return;

      // Page is visible — show the themed in-app notification banner.
      // Show banner for: highlighted messages (mentions/keywords), DM messages, or loud notifications.
      // Loud notifications include any room set to "All Messages" with sound enabled.
      if (showNotifications && (isHighlightByRule || isDM || isLoud)) {
        const avatarMxc =
          room.getAvatarFallbackMember()?.getMxcAvatarUrl() ?? room.getMxcAvatarUrl();
        const roomAvatar = avatarMxc
          ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined)
          : undefined;
        const resolvedSenderName =
          getMemberDisplayName(room, sender, nicknamesRef.current) ??
          getMxIdLocalPart(sender) ??
          sender;
        const content = mEvent.getContent();
        // Events reaching here are already decrypted (m.room.encrypted is skipped
        // above). Pass isEncryptedRoom:false so the preview always shows the actual
        // message body when showMessageContent is enabled.
        const previewText = resolveNotificationPreviewText({
          content: mEvent.getContent(),
          eventType: mEvent.getType(),
          effectiveType: mEvent.getEffectiveEvent()?.type as string | undefined,
          isEncryptedRoom: false,
          showMessageContent,
          showEncryptedMessageContent,
        });

        // Build a rich ReactNode body using the same HTML parser as the room
        // timeline — mxc images, mention pills, linkify, spoilers, code blocks.
        let bodyNode: ReactNode;
        if (
          showMessageContent &&
          content.format === 'org.matrix.custom.html' &&
          content.formatted_body
        ) {
          const htmlParserOpts = getReactCustomHtmlParser(mx, room.roomId, {
            settingsLinkBaseUrl: appBaseUrl,
            linkifyOpts: LINKIFY_OPTS,
            useAuthentication,
            nicknames: nicknamesRef.current,
          });
          bodyNode = parse(sanitizeCustomHtml(content.formatted_body), htmlParserOpts) as ReactNode;
        }

        const payload = buildRoomMessageNotification({
          roomName: room.name ?? 'Unknown',
          roomAvatar,
          username: resolvedSenderName,
          previewText,
          silent: !notificationSound || !isLoud,
          eventId,
        });
        const { roomId } = room;
        const capturedEventId = eventId;
        const capturedUserId = mx.getUserId() ?? undefined;
        const canonicalAlias = room.getCanonicalAlias();
        const serverName = canonicalAlias?.split(':')[1] ?? room.roomId.split(':')[1] ?? undefined;
        setInAppBanner({
          id: eventId,
          title: payload.title,
          roomName: room.name ?? undefined,
          serverName,
          senderName: resolvedSenderName,
          body: previewText,
          bodyNode,
          icon: roomAvatar,
          onClick: () => {
            window.focus();
            navigateToRoomNotificationTarget(navigate, capturedUserId, roomId, capturedEventId, {
              jumpMode: 'notification_live',
            });
          },
        });
      }
    };
    mx.on(RoomEvent.Timeline, handleTimelineEvent);
    return () => {
      mx.removeListener(RoomEvent.Timeline, handleTimelineEvent);
      // Clean up any pending decryption listeners
      pendingDecryptListeners.forEach((cleanup) => cleanup());
      pendingDecryptListeners.clear();
    };
  }, [
    mx,
    notificationSound,
    backgroundNotificationSounds,
    notificationSelected,
    showNotifications,
    showSystemNotifications,
    showMessageContent,
    showEncryptedMessageContent,
    focusMode,
    playSound,
    setInAppBanner,
    navigate,
    appBaseUrl,
    useAuthentication,
    isActiveNotificationClient,
  ]);

  return (
    // oxlint-disable-next-line jsx-a11y/media-has-caption
    <audio ref={audioRef} style={{ display: 'none' }}>
      <source src={NotificationSound} type="audio/ogg" />
    </audio>
  );
}

function PrivacyBlurFeature() {
  const [blurMedia] = useSetting(settingsAtom, 'privacyBlur');
  const [blurAvatars] = useSetting(settingsAtom, 'privacyBlurAvatars');
  const [blurEmotes] = useSetting(settingsAtom, 'privacyBlurEmotes');

  useEffect(() => {
    document.body.classList.toggle('sable-blur-media', blurMedia);
    document.body.classList.toggle('sable-blur-avatars', blurAvatars);
    document.body.classList.toggle('sable-blur-emotes', blurEmotes);
  }, [blurMedia, blurAvatars, blurEmotes]);

  return null;
}

// Periodically emits memory-health gauges so Sentry dashboards can surface
// unbounded growth (e.g. renderable media cache never evicted, stale inflight requests).
function HealthMonitor() {
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

type ServiceWorkerLogLevel = 'debug' | 'info' | 'warning' | 'error';
type ServiceWorkerLogAttributes = Record<string, string | number | boolean>;

const flattenServiceWorkerLogAttributes = (
  data?: Record<string, string | number | boolean | undefined>
): ServiceWorkerLogAttributes => {
  const attributes: ServiceWorkerLogAttributes = {};
  Object.entries(data ?? {}).forEach(([key, value]) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      attributes[key] = value;
    }
  });
  return attributes;
};

const logServiceWorkerMessage = (
  category: string,
  message: string,
  level: ServiceWorkerLogLevel = 'info',
  data?: Record<string, string | number | boolean | undefined>
): void => {
  const attributes = {
    category,
    ...flattenServiceWorkerLogAttributes(data),
  };
  const logMessage = `[${category}] ${message}`;

  if (level === 'error') Sentry.logger.error(logMessage, attributes);
  else if (level === 'warning') Sentry.logger.warn(logMessage, attributes);
  else if (level === 'debug') Sentry.logger.debug(logMessage, attributes);
  else Sentry.logger.info(logMessage, attributes);
};

const getPushTelemetryLogLevel = (event: string): ServiceWorkerLogLevel => {
  if (event === 'handler_error') return 'error';
  if (event === 'decrypt_timeout' || event === 'fetch_fallback') return 'warning';
  return 'info';
};

/**
 * Handles Sentry metrics posted from the Service Worker.
 * The SW cannot directly import Sentry, so it posts messages to the main thread.
 */
function ServiceWorkerMetricsHandler() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    const requestTelemetryDrain = () => {
      if (document.visibilityState !== 'visible') return;
      postToServiceWorker({
        type: 'drainPushTelemetry',
        requestId: `push-telemetry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'sentryMetric') {
        const { metricName, value, attributes } = event.data as {
          metricName: string;
          value: number;
          attributes?: Record<string, string | number | boolean>;
        };

        Sentry.metrics.distribution(metricName, value, {
          attributes: attributes ?? {},
        });
        return;
      }

      if (event.data?.type === 'sentryBreadcrumb') {
        const { category, message, level, data } = event.data as {
          category: string;
          message: string;
          level?: 'debug' | 'info' | 'warning' | 'error';
          data?: Record<string, string | number | boolean | undefined>;
        };
        Sentry.addBreadcrumb({ category, message, level, data });
        logServiceWorkerMessage(category, message, level ?? 'info', data);
        return;
      }

      if (event.data?.type === 'pushTelemetryRecords') {
        const records: unknown[] = Array.isArray(event.data.records) ? event.data.records : [];
        records.forEach((record) => {
          const pushRecord = record as {
            id?: string;
            event?: string;
            timestamp?: number;
            data?: Record<string, string | number | boolean>;
          };
          if (!pushRecord.event) return;
          const level = getPushTelemetryLogLevel(pushRecord.event);
          const logData = {
            push_event: pushRecord.event,
            push_record_id: pushRecord.id,
            push_record_timestamp: pushRecord.timestamp,
            ...pushRecord.data,
          };
          Sentry.addBreadcrumb({
            category: 'service_worker.push',
            message: `SW push ${pushRecord.event}`,
            level,
            data: logData,
          });
          logServiceWorkerMessage(
            'service_worker.push',
            `SW push ${pushRecord.event}`,
            level,
            logData
          );
          Sentry.metrics.count('sable.sw.push_telemetry', 1, {
            attributes: { event: pushRecord.event },
          });
        });
      }
    };

    const handleVisibilityChange = () => requestTelemetryDrain();
    const handlePageShow = () => requestTelemetryDrain();

    requestTelemetryDrain();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    navigator.serviceWorker.ready.then(requestTelemetryDrain).catch(() => undefined);

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, []);

  return null;
}

type ClientNonUIFeaturesProps = {
  children: ReactNode;
};

export function HandleNotificationClick() {
  const setActiveSessionId = useSetAtom(activeSessionIdAtom);
  const navigate = useNavigate();

  useEffect(() => {
    if (!('serviceWorker' in navigator) || isTauri()) return undefined;

    const handleMessage = (ev: MessageEvent) => {
      const { data } = ev;
      if (!data || data.type !== 'notificationClick') return;

      const {
        userId,
        roomId,
        eventId,
        clickId,
        targetUrl,
        navigate: navigateUrl,
        isInvite,
        isReminder,
      } = data as {
        userId?: string;
        roomId?: string;
        eventId?: string;
        clickId?: string;
        targetUrl?: string;
        navigate?: string;
        isInvite?: boolean;
        isReminder?: boolean;
      };

      const acknowledgeHandledClick = () => {
        if (typeof clickId === 'string') {
          if (
            !postToServiceWorkerSource(ev.source, {
              type: 'notificationClickHandled',
              clickId,
            })
          ) {
            postToServiceWorker({
              type: 'notificationClickHandled',
              clickId,
            });
          }
        }

        void clearLaunchContext().catch(() => undefined);
      };

      Sentry.addBreadcrumb(
        buildNotificationBreadcrumb('click', 'click_message_received', {
          click_id: clickId,
          user_id: userId,
          room_id: roomId,
          event_id: eventId,
          has_target_url: !!(targetUrl ?? navigateUrl),
          is_invite: isInvite,
          is_reminder: isReminder,
        })
      );

      if (userId) setActiveSessionId(userId);

      if (isInvite) {
        Sentry.addBreadcrumb(
          buildNotificationBreadcrumb('click', 'click_routed_invites', {
            click_id: clickId,
            user_id: userId,
          })
        );
        navigate(getInboxInvitesPath());
        acknowledgeHandledClick();
        return;
      }

      if (isReminder) {
        Sentry.addBreadcrumb(
          buildNotificationBreadcrumb('click', 'click_routed_reminders', {
            click_id: clickId,
            user_id: userId,
          })
        );
        navigate(getInboxBookmarksPath());
        acknowledgeHandledClick();
        return;
      }

      if (!roomId) {
        if (navigateUrl ?? targetUrl) {
          Sentry.addBreadcrumb(
            buildNotificationBreadcrumb('click', 'click_routed_fallback_url', {
              click_id: clickId,
              target_url: targetUrl ?? navigateUrl,
            })
          );
          navigateToServiceWorkerUrl(navigate, navigateUrl ?? targetUrl ?? '');
          acknowledgeHandledClick();
        }
        return;
      }

      if (userId) {
        Sentry.addBreadcrumb(
          buildNotificationBreadcrumb('click', 'click_routed_room_restore', {
            click_id: clickId,
            user_id: userId,
            room_id: roomId,
            event_id: eventId,
          })
        );
        acknowledgeHandledClick();
        navigateToRoomNotificationTarget(navigate, userId, roomId, eventId, {
          swClickId: typeof clickId === 'string' ? clickId : undefined,
          jumpMode: 'notification_live',
        });
        return;
      }

      if (targetUrl ?? navigateUrl) {
        Sentry.addBreadcrumb(
          buildNotificationBreadcrumb('click', 'click_routed_target_url', {
            click_id: clickId,
            target_url: targetUrl ?? navigateUrl,
          })
        );
        navigateToServiceWorkerUrl(navigate, targetUrl ?? navigateUrl ?? '');
        acknowledgeHandledClick();
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [setActiveSessionId, navigate]);

  return null;
}

function SyncNotificationSettingsWithServiceWorker() {
  const [showMessageContent] = useSetting(settingsAtom, 'showMessageContentInNotifications');
  const [showEncryptedMessageContent] = useSetting(
    settingsAtom,
    'showMessageContentInEncryptedNotifications'
  );
  const [clearNotificationsOnRead] = useSetting(settingsAtom, 'clearNotificationsOnRead');
  const [focusMode] = useSetting(settingsAtom, 'focusMode');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    let heartbeatIntervalId: number | undefined;

    const postVisibility = () => {
      const visible = document.visibilityState === 'visible';
      const payload = { type: 'setAppVisible', visible };

      navigator.serviceWorker.controller?.postMessage(payload);
      navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage(payload));
    };

    const stopHeartbeat = () => {
      if (heartbeatIntervalId !== undefined) {
        window.clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = undefined;
      }
    };

    const restartHeartbeat = () => {
      stopHeartbeat();
      postVisibility();
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        heartbeatIntervalId = window.setInterval(postVisibility, 10_000);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') restartHeartbeat();
      else {
        postVisibility();
        stopHeartbeat();
      }
    };

    const handleFocus = () => restartHeartbeat();
    const handleBlur = () => postVisibility();
    const handlePageShow = () => restartHeartbeat();

    restartHeartbeat();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      stopHeartbeat();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || isTauri()) return;
    // notificationSoundEnabled is intentionally excluded: push notification sound
    // is governed by the push rule's tweakSound alone (OS/Sygnal handles it).
    // The in-app sound setting only controls the in-page <audio> playback above.
    const payload = {
      type: 'setNotificationSettings' as const,
      showMessageContent,
      showEncryptedMessageContent,
      clearNotificationsOnRead,
      focusMode,
    };

    postToServiceWorker(payload);
  }, [showMessageContent, showEncryptedMessageContent, clearNotificationsOnRead, focusMode]);

  return null;
}

function SlidingSyncActiveRoomSubscriber() {
  useSlidingSyncActiveRoom();
  return null;
}

/**
 * Tracks the currently-viewed room and writes sanitised room metadata to the Sentry scope.
 * This context appears on every subsequent error/transaction captured while the room is open,
 * making room-specific bugs much easier to triage.
 */
function SentryRoomContextFeature() {
  const mx = useMatrixClient();
  const mDirect = useAtomValue(mDirectAtom);
  const roomId = useAtomValue(lastVisitedRoomIdAtom);

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

function SentryTagsFeature() {
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

/**
 * Listens for decryptPushEvent messages from the service worker, decrypts the
 * event using the local Olm/Megolm session, then replies with pushDecryptResult
 * so the SW can show a notification with the real message content.
 * Falls back gracefully (success: false) on any error or if keys are missing.
 */
function HandleDecryptPushEvent() {
  const mx = useMatrixClient();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    const RETRYABLE_DECRYPT_ERROR_PATTERNS = [
      "The sender's device has not sent us the keys",
      'Unknown inbound session',
      'Decryption error',
      'MEGOLM_UNKNOWN_INBOUND_SESSION_ID',
      'OLM_UNKNOWN_MESSAGE_INDEX',
    ] as const;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
      });
    const isRetryablePushDecryptError = (error: unknown): error is Error =>
      error instanceof Error &&
      RETRYABLE_DECRYPT_ERROR_PATTERNS.some((pattern) => error.message.includes(pattern));

    const handleMessage = async (ev: MessageEvent) => {
      const { data } = ev;
      if (!data) return;

      if (data.type !== 'decryptPushEvent') return;

      const { rawEvent } = data as { rawEvent: Record<string, unknown> };
      const eventId = rawEvent.event_id as string;
      const roomId = rawEvent.room_id as string;
      const decryptStart = performance.now();
      const mxEvent = new MatrixEvent(rawEvent as ConstructorParameters<typeof MatrixEvent>[0]);
      let attempts = 0;
      let failureReason = 'decrypt_failed';
      Sentry.addBreadcrumb(
        buildNotificationBreadcrumb('push', 'push_relay_requested', {
          event_id: eventId,
          room_id: roomId,
          sync_state: mx.getSyncState() ?? 'unknown',
          visibility_state: document.visibilityState,
        })
      );
      const decryptWithRetry = async (): Promise<void> => {
        attempts += 1;
        try {
          await mx.decryptEventIfNeeded(mxEvent);
        } catch (error) {
          if (!isRetryablePushDecryptError(error)) {
            throw error;
          }

          failureReason = 'missing_room_keys';
          const elapsedMs = performance.now() - decryptStart;
          const nextDelayMs = Math.min(400 + attempts * 500, 2_000);
          if (elapsedMs + nextDelayMs >= 7_000) {
            throw error;
          }

          pushRelayLog.warn('notification', 'Push relay decrypt retry scheduled', {
            attempts,
            nextDelayMs,
            syncState: mx.getSyncState() ?? 'unknown',
          });
          Sentry.addBreadcrumb(
            buildNotificationBreadcrumb('push', 'push_relay_retry_scheduled', {
              event_id: eventId,
              room_id: roomId,
              attempts,
              next_delay_ms: nextDelayMs,
              sync_state: mx.getSyncState() ?? 'unknown',
            })
          );
          await sleep(nextDelayMs);
          await decryptWithRetry();
        }
      };

      try {
        await decryptWithRetry();

        const room = mx.getRoom(roomId);
        const sender = mxEvent.getSender();
        let senderName = 'Someone';
        if (sender) {
          senderName = getMxIdLocalPart(sender) ?? sender;
          if (room) senderName = getMemberDisplayName(room, sender) ?? senderName;
        }

        const decryptMs = Math.round(performance.now() - decryptStart);
        pushRelayLog.info('notification', 'Push relay decryption succeeded', {
          eventType: mxEvent.getType(),
          decryptMs,
          attempts,
        });
        Sentry.addBreadcrumb(
          buildNotificationBreadcrumb('push', 'push_relay_succeeded', {
            event_id: eventId,
            room_id: roomId,
            event_type: mxEvent.getType(),
            decrypt_ms: decryptMs,
            attempts,
            sync_state: mx.getSyncState() ?? 'unknown',
          })
        );

        const response = {
          type: 'pushDecryptResult',
          eventId,
          success: true,
          eventType: mxEvent.getType(),
          content: mxEvent.getContent(),
          sender_display_name: senderName,
          room_name: room?.name ?? '',
          visibilityState: document.visibilityState,
          focused: document.hasFocus(),
          attempts,
          syncState: mx.getSyncState() ?? undefined,
        };
        Sentry.metrics.count('sable.push.decrypt_relay_page', 1, {
          attributes: buildNotificationMetricAttributes({
            success: true,
            failure_reason: 'none',
            attempts,
            sync_state: mx.getSyncState() ?? 'unknown',
          }),
        });
        if (!postToServiceWorkerSource(ev.source, response)) postToServiceWorker(response);
      } catch (err) {
        console.warn('[ClientFeatures] HandleDecryptPushEvent: failed to decrypt push event', err);
        pushRelayLog.error(
          'notification',
          'Push relay decryption failed',
          err instanceof Error ? err : new Error(String(err))
        );

        // Check if this is a missing keys error
        const isDecryptionError =
          err instanceof Error &&
          (err.message.includes("The sender's device has not sent us the keys") ||
            err.message.includes('Unknown inbound session'));
        if (isDecryptionError) {
          failureReason = 'missing_room_keys';
        }

        if (isDecryptionError) {
          Sentry.addBreadcrumb(
            buildNotificationBreadcrumb(
              'push',
              'push_relay_missing_room_keys',
              {
                event_id: eventId,
                room_id: roomId,
                error: err.message,
                attempts,
              },
              'warning'
            )
          );
          Sentry.metrics.count('sable.push.decrypt_missing_keys', 1, {
            attributes: buildNotificationMetricAttributes({
              app_visible: document.visibilityState === 'visible',
              attempts,
            }),
          });
          // SDK will automatically request keys on next decryptEventIfNeeded call
          // when the event is viewed in the timeline
        }
        Sentry.addBreadcrumb(
          buildNotificationBreadcrumb(
            'push',
            'push_relay_failed',
            {
              event_id: eventId,
              room_id: roomId,
              failure_reason: failureReason,
              attempts,
              sync_state: mx.getSyncState() ?? 'unknown',
              error: err instanceof Error ? err.message : String(err),
            },
            'warning'
          )
        );
        Sentry.metrics.count('sable.push.decrypt_relay_page', 1, {
          attributes: buildNotificationMetricAttributes({
            success: false,
            failure_reason: failureReason,
            attempts,
            sync_state: mx.getSyncState() ?? 'unknown',
          }),
        });

        const response = {
          type: 'pushDecryptResult',
          eventId,
          success: false,
          visibilityState: document.visibilityState,
          focused: document.hasFocus(),
          failureReason,
          attempts,
          syncState: mx.getSyncState() ?? undefined,
        };
        if (!postToServiceWorkerSource(ev.source, response)) postToServiceWorker(response);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [mx]);

  return null;
}

function PresenceFeature() {
  const mx = useMatrixClient();
  const [sendPresence] = useSetting(settingsAtom, 'sendPresence');
  const [presenceMode] = useSetting(settingsAtom, 'presenceMode');
  const [autoIdlePresence] = useSetting(settingsAtom, 'autoIdlePresence');
  const [presenceIdleTimeoutMins] = useSetting(settingsAtom, 'presenceIdleTimeoutMins');

  // Auto-idle detection: monitors user activity and sets presenceAutoIdledAtom
  // when inactivity timeout is reached. The sync feature will pick up the
  // atom change and broadcast it to other devices + the server.
  const timeoutMs = autoIdlePresence ? presenceIdleTimeoutMins * 60 * 1000 : 0;
  usePresenceAutoIdle(mx, presenceMode ?? 'online', sendPresence, timeoutMs);

  return null;
}

function PresenceSyncFeature() {
  usePresenceSyncEffect();
  return null;
}

function getNotificationTransportRuntimePlatform(): NotificationTransportPlatform {
  if (!isTauri()) return 'web';

  const platform = osType();
  if (platform === 'android') return 'android';
  if (platform === 'ios') return 'ios';
  return 'desktop';
}

function NotificationTransportRuntimeFeature() {
  const mx = useMatrixClient();
  const [backgroundPushEnabled] = useSetting(settingsAtom, 'backgroundPushEnabled');
  const [backgroundPushProvider] = useSetting(settingsAtom, 'backgroundPushProvider');
  const [pushTransportMode] = useSetting(settingsAtom, 'pushTransportMode');
  const [isNotificationSounds] = useSetting(settingsAtom, 'isNotificationSounds');
  const [showMessageContent] = useSetting(settingsAtom, 'showMessageContentInNotifications');
  const [showEncryptedMessageContent] = useSetting(
    settingsAtom,
    'showMessageContentInEncryptedNotifications'
  );
  const [useInAppNotifications] = useSetting(settingsAtom, 'useInAppNotifications');

  const runtimeRef = useRef<NotificationTransportRuntime | null>(null);
  const contextRef = useRef<NotificationTransportRuntimeContext>({
    mx,
    showMessageContent,
    showEncryptedMessageContent,
    notificationSoundEnabled: isNotificationSounds,
    useInAppNotifications,
  });
  contextRef.current = {
    mx,
    showMessageContent,
    showEncryptedMessageContent,
    notificationSoundEnabled: isNotificationSounds,
    useInAppNotifications,
  };

  if (!runtimeRef.current) {
    runtimeRef.current = new NotificationTransportRuntime();
  }

  useEffect(() => {
    if (!isTauri()) return undefined;

    const runtimePlatform = getNotificationTransportRuntimePlatform();
    const normalizedMode = normalizeNotificationTransportMode(pushTransportMode, runtimePlatform);
    const provider = backgroundPushEnabled
      ? (backgroundPushProvider ??
        resolvePreferredNotificationTransportProvider(normalizedMode, runtimePlatform))
      : null;
    const runtime = runtimeRef.current;
    if (!runtime) return undefined;

    const syncPromise = runtime.sync(provider, () => contextRef.current);
    syncPromise.catch((error) => {
      transportLog.error(
        'notification',
        'Notification transport runtime failed',
        error instanceof Error ? error : new Error(String(error))
      );
    });
    return () => {
      const cleanupPromise = runtime.dispose();
      cleanupPromise.catch((error) => {
        transportLog.error(
          'notification',
          'Notification transport runtime cleanup failed',
          error instanceof Error ? error : new Error(String(error))
        );
      });
    };
  }, [backgroundPushEnabled, backgroundPushProvider, pushTransportMode]);

  return null;
}

function SettingsSyncFeature() {
  useSettingsSyncEffect();
  return null;
}

function BookmarksFeature() {
  useInitBookmarks();
  return null;
}

function ReminderSync() {
  useReminderSync();
  return null;
}

/**
 * Listens for `remindersInApp` messages from the service worker and shows an
 * in-app notification banner. The SW sends this instead of an OS notification
 * when the app is foregrounded (visible tab), avoiding duplicate alerts.
 */
function ReminderBanners() {
  const navigate = useNavigate();
  const setInAppBanner = useSetAtom(inAppBannerAtom);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'remindersInApp') return;
      const reminders: Array<{
        bookmarkId: string;
        note?: string;
        roomId: string;
        eventId: string;
      }> = event.data.reminders ?? [];
      const first = reminders[0];
      if (!first) return;

      setInAppBanner({
        id: `reminder-${first.bookmarkId}`,
        title: 'Bookmark Reminder',
        body: first.note ?? 'You have a bookmark reminder.',
        onClick: () => {
          window.focus();
          navigate(getInboxBookmarksPath());
        },
      });
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [navigate, setInAppBanner]);

  return null;
}

function RemindersFeature() {
  const [enableMessageBookmarks] = useSetting(settingsAtom, 'enableMessageBookmarks');
  const [enableBookmarkReminders] = useSetting(settingsAtom, 'enableBookmarkReminders');
  if (!enableMessageBookmarks || !enableBookmarkReminders) return null;
  return (
    <>
      <ReminderSync />
      <ReminderBanners />
    </>
  );
}

function useDeferredStartupWork(delayMs = 250): boolean {
  const [enabled, setEnabled] = useState(() => isStartupShellReady());

  useEffect(() => {
    if (enabled) return undefined;
    return subscribeStartupShellReady(() => setEnabled(true));
  }, [enabled]);

  const [idleEnabled, setIdleEnabled] = useState(() => isStartupShellReady());
  useEffect(() => {
    if (!enabled) return undefined;
    if (idleEnabled) return undefined;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let idleId: number | undefined;
    const requestIdle = window.requestIdleCallback?.bind(window);
    const cancelIdle = window.cancelIdleCallback?.bind(window);
    const enable = () => {
      if (!cancelled) setIdleEnabled(true);
    };

    if (requestIdle) {
      idleId = requestIdle(enable, { timeout: delayMs });
    } else {
      timeoutId = setTimeout(enable, delayMs);
    }

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (idleId !== undefined && cancelIdle) cancelIdle(idleId);
    };
  }, [delayMs, enabled, idleEnabled]);

  return idleEnabled;
}

export function ClientNonUIFeatures({ children }: ClientNonUIFeaturesProps) {
  useCallSignaling();
  const deferredStartupWorkEnabled = useDeferredStartupWork();
  return (
    <SearchIndexProvider>
      <SystemEmojiFeature />
      <PageZoomFeature />
      <PrivacyBlurFeature />
      <WebPushStartupReconciler />
      <FaviconUpdater />
      <InviteNotifications />
      <MessageNotifications />
      <NotificationTransportRuntimeFeature />
      <SyncNotificationSettingsWithServiceWorker />
      <HandleDecryptPushEvent />
      <ServiceWorkerMetricsHandler />
      <NotificationBanner />
      <Suspense fallback={null}>
        <TelemetryConsentBanner />
      </Suspense>
      <Suspense fallback={null}>
        <ThemeMigrationBanner />
      </Suspense>
      <SlidingSyncActiveRoomSubscriber />
      <SentryRoomContextFeature />
      <SentryTagsFeature />
      {deferredStartupWorkEnabled && (
        <>
          <SettingsSyncFeature />
          <BookmarksFeature />
          <RemindersFeature />
          <BackgroundNotifications />
          <PresenceFeature />
          <PresenceSyncFeature />
          <HealthMonitor />
        </>
      )}
      <IconSizesProvider>{children}</IconSizesProvider>
    </SearchIndexProvider>
  );
}
