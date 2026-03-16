import { useAtomValue, useSetAtom } from 'jotai';
import { ReactNode, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MatrixEvent,
  MatrixEventEvent,
  PushProcessor,
  RoomEvent,
  RoomEventHandlerMap,
  SetPresence,
} from '$types/matrix-sdk';
import parse from 'html-react-parser';
import { getReactCustomHtmlParser, LINKIFY_OPTS } from '$plugins/react-custom-html-parser';
import { sanitizeCustomHtml } from '$utils/sanitize';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import LogoSVG from '$public/res/svg/cinny.svg';
import LogoUnreadSVG from '$public/res/svg/cinny-unread.svg';
import LogoHighlightSVG from '$public/res/svg/cinny-highlight.svg';
import NotificationSound from '$public/sound/notification.ogg';
import InviteSound from '$public/sound/invite.ogg';
import { notificationPermission, setFavicon } from '$utils/dom';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { nicknamesAtom } from '$state/nicknames';
import { mDirectAtom } from '$state/mDirectList';
import { allInvitesAtom } from '$state/room-list/inviteList';
import { usePreviousValue } from '$hooks/usePreviousValue';
import { useMatrixClient } from '$hooks/useMatrixClient';
import {
  getMemberDisplayName,
  getNotificationType,
  getStateEvent,
  isDMRoom,
  isNotificationEvent,
} from '$utils/room';
import { NotificationType, StateEvent } from '$types/matrix/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { useInboxNotificationsSelected } from '$hooks/router/useInbox';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { registrationAtom } from '$state/serviceWorkerRegistration';
import { pendingNotificationAtom, inAppBannerAtom, activeSessionIdAtom } from '$state/sessions';
import {
  buildRoomMessageNotification,
  resolveNotificationPreviewText,
} from '$utils/notificationStyle';
import { mobileOrTablet } from '$utils/user-agent';
import { createDebugLogger } from '$utils/debugLogger';
import { useSlidingSyncActiveRoom } from '$hooks/useSlidingSyncActiveRoom';
import { getSlidingSyncManager } from '$client/initMatrix';
import { NotificationBanner } from '$components/notification-banner';
import { useCallSignaling } from '$hooks/useCallSignaling';
import { getInboxInvitesPath } from '../pathUtils';
import { BackgroundNotifications } from './BackgroundNotifications';

const pushRelayLog = createDebugLogger('push-relay');

function clearMediaSessionQuickly(): void {
  if (!('mediaSession' in navigator)) return;
  // iOS registers the lock screen media player as a side-effect of
  // HTMLAudioElement.play(). We delay slightly so iOS has finished updating
  // the media session before we clear it — clearing too early is a no-op.
  // We only clear if no real in-app media (video/audio in a room) has since
  // registered meaningful metadata; if it has, leave it alone.
  setTimeout(() => {
    if (navigator.mediaSession.metadata !== null) return;
    navigator.mediaSession.playbackState = 'none';
  }, 500);
}

function SystemEmojiFeature() {
  const [twitterEmoji] = useSetting(settingsAtom, 'twitterEmoji');

  if (twitterEmoji) {
    document.documentElement.style.setProperty('--font-emoji', 'Twemoji');
  } else {
    document.documentElement.style.setProperty('--font-emoji', 'Twemoji_DISABLED');
  }

  return null;
}

function PageZoomFeature() {
  const [pageZoom] = useSetting(settingsAtom, 'pageZoom');

  if (pageZoom === 100) {
    document.documentElement.style.removeProperty('font-size');
  } else {
    document.documentElement.style.setProperty('font-size', `calc(1em * ${pageZoom / 100})`);
  }

  return null;
}

function FaviconUpdater() {
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
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

    if (notification) {
      setFavicon(highlight ? LogoHighlightSVG : LogoUnreadSVG);
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
      if (usePushNotifications) {
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
  }, [roomToUnread, usePushNotifications, registration]);

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

  const notify = useCallback(
    (count: number) => {
      const noti = new window.Notification('Invitation', {
        icon: LogoSVG,
        badge: LogoSVG,
        body: `You have ${count} new invitation request.`,
        silent: true,
      });

      noti.onclick = () => {
        if (!window.closed) navigate(getInboxInvitesPath());
        noti.close();
      };
    },
    [navigate]
  );

  const playSound = useCallback(() => {
    const audioElement = audioRef.current;
    audioElement?.play();
    clearMediaSessionQuickly();
  }, []);

  useEffect(() => {
    if (invites.length <= perviousInviteLen || mx.getSyncState() !== 'SYNCING') return;

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
    // Audio API requires a visible document; skip when hidden.
    if (document.visibilityState === 'visible' && notificationSound) {
      playSound();
    }
  }, [
    mx,
    invites,
    perviousInviteLen,
    showSystemNotifications,
    usePushNotifications,
    notificationSound,
    notify,
    playSound,
  ]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio ref={audioRef} style={{ display: 'none' }}>
      <source src={InviteSound} type="audio/ogg" />
    </audio>
  );
}

function MessageNotifications() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const notifiedEventsRef = useRef<Set<string>>(new Set());
  // Record mount time so we can distinguish live events from historical backfill
  // on sliding sync proxies that don't set num_live (which causes liveEvent=false
  // for all events, including actually-new messages).
  const clientStartTimeRef = useRef(Date.now());
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [showNotifications] = useSetting(settingsAtom, 'useInAppNotifications');
  const [showSystemNotifications] = useSetting(settingsAtom, 'useSystemNotifications');
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');
  const [showMessageContent] = useSetting(settingsAtom, 'showMessageContentInNotifications');
  const [showEncryptedMessageContent] = useSetting(
    settingsAtom,
    'showMessageContentInEncryptedNotifications'
  );
  const nicknames = useAtomValue(nicknamesAtom);
  const nicknamesRef = useRef(nicknames);
  nicknamesRef.current = nicknames;
  const mDirects = useAtomValue(mDirectAtom);
  const mDirectsRef = useRef(mDirects);
  mDirectsRef.current = mDirects;

  const setPending = useSetAtom(pendingNotificationAtom);
  const setInAppBanner = useSetAtom(inAppBannerAtom);
  const selectedRoomId = useSelectedRoom();
  const notificationSelected = useInboxNotificationsSelected();

  const playSound = useCallback(() => {
    const audioElement = audioRef.current;
    audioElement?.play();
    clearMediaSessionQuickly();
  }, []);

  useEffect(() => {
    const pushProcessor = new PushProcessor(mx);
    // Track encrypted events that should skip focus check when decrypted (because we
    // already checked focus when the encrypted event arrived, and want to use that
    // original state rather than re-checking after decryption completes).
    const skipFocusCheckEvents = new Set<string>();

    const handleTimelineEvent: RoomEventHandlerMap[RoomEvent.Timeline] = (
      mEvent,
      room,
      toStartOfTimeline,
      removed,
      data
    ) => {
      if (mx.getSyncState() !== 'SYNCING') return;

      const eventId = mEvent.getId();
      const shouldSkipFocusCheck = eventId && skipFocusCheckEvents.has(eventId);
      if (!shouldSkipFocusCheck) {
        if (document.hasFocus() && (selectedRoomId === room?.roomId || notificationSelected))
          return;
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
          handleTimelineEvent(mEvent, room, undefined, removed, data);
          // Clean up the skip-focus marker
          if (eventId) {
            skipFocusCheckEvents.delete(eventId);
          }
        };
        mEvent.once(MatrixEventEvent.Decrypted, handleDecrypted);
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
          const isEncryptedRoom = !!getStateEvent(room, StateEvent.RoomEncryption);
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
              isEncryptedRoom,
              showMessageContent,
              showEncryptedMessageContent,
            }),
            silent: !notificationSound || !isLoud,
            eventId,
          });
          const noti = new window.Notification(osPayload.title, osPayload.options);
          const { roomId } = room;
          noti.onclick = () => {
            window.focus();
            setPending({ roomId, eventId, targetSessionId: mx.getUserId() ?? undefined });
            noti.close();
          };
        } catch {
          // window.Notification unavailable or blocked (sandboxed context, DnD, etc.)
        }
      }

      // Everything below requires the page to be visible (in-app UI + audio).
      if (document.visibilityState !== 'visible') return;

      // Page is visible — show the themed in-app notification banner.
      // For non-DM rooms, only show banner for highlighted messages (mentions/keywords).
      // For DMs, show banner for all messages.
      if (showNotifications && (isHighlightByRule || isDM)) {
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
            setPending({ roomId, eventId: capturedEventId, targetSessionId: capturedUserId });
          },
        });
      }

      // In-app audio: play when notification sounds are enabled AND this notification is loud.
      if (notificationSound && isLoud) {
        playSound();
      }
    };
    mx.on(RoomEvent.Timeline, handleTimelineEvent);
    return () => {
      mx.removeListener(RoomEvent.Timeline, handleTimelineEvent);
    };
  }, [
    mx,
    notificationSound,
    notificationSelected,
    showNotifications,
    showSystemNotifications,
    showMessageContent,
    showEncryptedMessageContent,
    usePushNotifications,
    playSound,
    setInAppBanner,
    setPending,
    selectedRoomId,
    useAuthentication,
  ]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
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

type ClientNonUIFeaturesProps = {
  children: ReactNode;
};

export function HandleNotificationClick() {
  const setPending = useSetAtom(pendingNotificationAtom);
  const setActiveSessionId = useSetAtom(activeSessionIdAtom);
  const navigate = useNavigate();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    const handleMessage = (ev: MessageEvent) => {
      const { data } = ev;
      if (!data || data.type !== 'notificationClick') return;

      const { userId, roomId, eventId, isInvite } = data as {
        userId?: string;
        roomId?: string;
        eventId?: string;
        isInvite?: boolean;
      };

      if (userId) setActiveSessionId(userId);

      if (isInvite) {
        navigate(getInboxInvitesPath());
        return;
      }

      if (!roomId) return;
      setPending({ roomId, eventId, targetSessionId: userId });
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [setPending, setActiveSessionId, navigate]);

  return null;
}

function SyncNotificationSettingsWithServiceWorker() {
  const [showMessageContent] = useSetting(settingsAtom, 'showMessageContentInNotifications');
  const [showEncryptedMessageContent] = useSetting(
    settingsAtom,
    'showMessageContentInEncryptedNotifications'
  );
  const [clearNotificationsOnRead] = useSetting(settingsAtom, 'clearNotificationsOnRead');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    const postVisibility = () => {
      const visible = document.visibilityState === 'visible';
      const msg = { type: 'setAppVisible', visible };
      navigator.serviceWorker.controller?.postMessage(msg);
      navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage(msg));
    };

    // Report initial visibility immediately, then track changes.
    postVisibility();
    document.addEventListener('visibilitychange', postVisibility);
    return () => document.removeEventListener('visibilitychange', postVisibility);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // notificationSoundEnabled is intentionally excluded: push notification sound
    // is governed by the push rule's tweakSound alone (OS/Sygnal handles it).
    // The in-app sound setting only controls the in-page <audio> playback above.
    const payload = {
      type: 'setNotificationSettings' as const,
      showMessageContent,
      showEncryptedMessageContent,
      clearNotificationsOnRead,
    };

    navigator.serviceWorker.controller?.postMessage(payload);
    navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage(payload);
    });
  }, [showMessageContent, showEncryptedMessageContent, clearNotificationsOnRead]);

  return null;
}

function SlidingSyncActiveRoomSubscriber() {
  useSlidingSyncActiveRoom();
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

    const handleMessage = async (ev: MessageEvent) => {
      const { data } = ev;
      if (!data || data.type !== 'decryptPushEvent') return;

      const { rawEvent } = data as { rawEvent: Record<string, unknown> };
      const eventId = rawEvent.event_id as string;
      const roomId = rawEvent.room_id as string;
      const decryptStart = performance.now();

      try {
        const mxEvent = new MatrixEvent(rawEvent as any);
        await mx.decryptEventIfNeeded(mxEvent);

        const room = mx.getRoom(roomId);
        const sender = mxEvent.getSender();
        let senderName = 'Someone';
        if (sender) {
          senderName = getMxIdLocalPart(sender) ?? sender;
          if (room) senderName = getMemberDisplayName(room, sender) ?? senderName;
        }

        const decryptMs = Math.round(performance.now() - decryptStart);
        const visible = document.visibilityState === 'visible';
        pushRelayLog.info('notification', 'Push relay decryption succeeded', {
          eventType: mxEvent.getType(),
          decryptMs,
          appVisible: visible,
        });

        navigator.serviceWorker.controller?.postMessage({
          type: 'pushDecryptResult',
          eventId,
          success: true,
          eventType: mxEvent.getType(),
          content: mxEvent.getContent(),
          sender_display_name: senderName,
          room_name: room?.name ?? '',
          visibilityState: document.visibilityState,
        });
      } catch (err) {
        console.warn('[app] HandleDecryptPushEvent: failed to decrypt push event', err);
        pushRelayLog.error(
          'notification',
          'Push relay decryption failed',
          err instanceof Error ? err : new Error(String(err))
        );
        navigator.serviceWorker.controller?.postMessage({
          type: 'pushDecryptResult',
          eventId,
          success: false,
          visibilityState: document.visibilityState,
        });
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

  useEffect(() => {
    // Classic sync: set_presence query param on every /sync poll.
    // Passing undefined restores the default (online); Offline suppresses broadcasting.
    mx.setSyncPresence(sendPresence ? undefined : SetPresence.Offline);
    // Sliding sync: enable/disable the presence extension on the next poll.
    getSlidingSyncManager(mx)?.setPresenceEnabled(sendPresence);
  }, [mx, sendPresence]);

  return null;
}

export function ClientNonUIFeatures({ children }: ClientNonUIFeaturesProps) {
  useCallSignaling();
  return (
    <>
      <SystemEmojiFeature />
      <PageZoomFeature />
      <PrivacyBlurFeature />
      <FaviconUpdater />
      <InviteNotifications />
      <MessageNotifications />
      <BackgroundNotifications />
      <SyncNotificationSettingsWithServiceWorker />
      <HandleDecryptPushEvent />
      <NotificationBanner />
      <SlidingSyncActiveRoomSubscriber />
      <PresenceFeature />
      {children}
    </>
  );
}
