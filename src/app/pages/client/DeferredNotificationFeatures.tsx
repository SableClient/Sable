import { useAtomValue, useSetAtom } from 'jotai';
import * as Sentry from '@sentry/react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';
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
import NotificationSound from '$public/sound/notification.ogg';
import InviteSound from '$public/sound/invite.ogg';
import LogoSVG from '$public/res/svg/logo.svg';
import { notificationPermission } from '$utils/dom';
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
import { NotificationType } from '$types/matrix/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { useInboxNotificationsSelected } from '$hooks/router/useInbox';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useSettingsLinkBaseUrl } from '$features/settings/useSettingsLinkBaseUrl';
import { pendingNotificationAtom, inAppBannerAtom } from '$state/sessions';
import {
  buildRoomMessageNotification,
  resolveNotificationPreviewText,
} from '$utils/notificationStyle';
import { mobileOrTablet } from '$utils/user-agent';
import { createDebugLogger } from '$utils/debugLogger';
import { NotificationBanner } from '$components/notification-banner';
import { ThemeMigrationBanner } from '$components/theme/ThemeMigrationBanner';
import { TelemetryConsentBanner } from '$components/telemetry-consent';
import { getBlobCacheStats } from '$hooks/useBlobCache';
import { BackgroundNotifications } from './BackgroundNotifications';
import { getInboxInvitesPath } from '../pathUtils';
import { useNavigate } from 'react-router-dom';

const pushRelayLog = createDebugLogger('push-relay');

function clearMediaSessionQuickly(): void {
  if (!('mediaSession' in navigator)) return;
  setTimeout(() => {
    if (navigator.mediaSession.metadata !== null) return;
    navigator.mediaSession.playbackState = 'none';
  }, 500);
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

      noti.addEventListener('click', () => {
        if (!window.closed) navigate(getInboxInvitesPath());
        noti.close();
      });
    },
    [navigate]
  );

  const playSound = useCallback(() => {
    const audioElement = audioRef.current;
    audioElement?.play();
    clearMediaSessionQuickly();
  }, []);

  useEffect(() => {
    if (invites.length <= perviousInviteLen || mx.getSyncState() !== SyncState.Syncing) return;
    if (document.visibilityState !== 'visible' && usePushNotifications) return;

    if (!mobileOrTablet() && showSystemNotifications && notificationPermission('granted')) {
      try {
        notify(invites.length - perviousInviteLen);
      } catch {}
    }
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
    <audio ref={audioRef} style={{ display: 'none' }}>
      <source src={InviteSound} type="audio/ogg" />
      <track kind="captions" />
    </audio>
  );
}

function MessageNotifications() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const notifiedEventsRef = useRef(new Set());
  const clientStartTimeRef = useRef(Date.now());
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const appBaseUrl = useSettingsLinkBaseUrl();
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
    const skipFocusCheckEvents = new Set<string>();
    const notifyTimerMap = new Map<string, number>();

    const handleTimelineEvent: RoomEventHandlerMap[RoomEvent.Timeline] = (
      mEvent,
      room,
      _toStartOfTimeline,
      _removed,
      data
    ) => {
      if (mx.getSyncState() !== SyncState.Syncing) return;
      const eventId = mEvent.getId();
      if (eventId && !notifyTimerMap.has(eventId)) notifyTimerMap.set(eventId, performance.now());
      const shouldSkipFocusCheck = eventId && skipFocusCheckEvents.has(eventId);
      if (!shouldSkipFocusCheck) {
        if (document.hasFocus() && (selectedRoomId === room?.roomId || notificationSelected))
          return;
      }
      const isHistoricalEvent =
        !data.liveEvent &&
        (mEvent.getTs() < clientStartTimeRef.current - 60 * 1000 ||
          (!!room && room.hasUserReadEvent(mx.getSafeUserId(), mEvent.getId()!)));
      if (mEvent.getType() === 'm.room.encrypted' && mEvent.isEncrypted()) {
        if (eventId) skipFocusCheckEvents.add(eventId);
        const handleDecrypted = () => {
          handleTimelineEvent(mEvent, room, undefined, true, data);
          if (eventId) skipFocusCheckEvents.delete(eventId);
        };
        mEvent.once(MatrixEventEvent.Decrypted, handleDecrypted);
        return;
      }
      if (!room || isHistoricalEvent || room.isSpaceRoom() || !isNotificationEvent(mEvent)) return;
      const notificationType = getNotificationType(mx, room.roomId);
      if (notificationType === NotificationType.Mute) return;
      const sender = mEvent.getSender();
      if (!sender || !eventId || mEvent.getSender() === mx.getUserId()) return;
      if (notifiedEventsRef.current.has(eventId)) return;
      const isDM = isDMRoom(room, mDirectsRef.current);
      const arrivalMs = notifyTimerMap.get(eventId);
      if (arrivalMs !== undefined) {
        Sentry.metrics.distribution(
          'sable.notification.delivery_ms',
          performance.now() - arrivalMs,
          {
            attributes: { encrypted: String(mEvent.isEncrypted()), dm: String(isDM) },
          }
        );
        notifyTimerMap.delete(eventId);
      }
      const pushActions = pushProcessor.actionsForEvent(mEvent);
      const shouldForceDMNotification =
        isDM && notificationType !== NotificationType.MentionsAndKeywords;
      const shouldNotify = pushActions?.notify || shouldForceDMNotification;
      if (!shouldNotify) return;
      const loudByRule = Boolean(pushActions.tweaks?.sound);
      const isHighlightByRule = Boolean(pushActions.tweaks?.highlight);
      const isLoud = loudByRule || isDM;
      notifiedEventsRef.current.add(eventId);

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
            setPending({ roomId, eventId, targetSessionId: mx.getUserId() ?? undefined });
            noti.close();
          });
        } catch {}
      }
      if (document.visibilityState !== 'visible') return;
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
        const previewText = resolveNotificationPreviewText({
          content: mEvent.getContent(),
          eventType: mEvent.getType(),
          isEncryptedRoom: false,
          showMessageContent,
          showEncryptedMessageContent,
        });
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
            setPending({ roomId, eventId, targetSessionId: mx.getUserId() ?? undefined });
          },
        });
      }
      if (notificationSound && isLoud) playSound();
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
    appBaseUrl,
    useAuthentication,
  ]);

  return (
    <audio ref={audioRef} style={{ display: 'none' }}>
      <source src={NotificationSound} type="audio/ogg" />
      <track kind="captions" />
    </audio>
  );
}

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
        const mxEvent = new MatrixEvent(rawEvent as ConstructorParameters<typeof MatrixEvent>[0]);
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

function HealthMonitor() {
  useEffect(() => {
    const id = window.setInterval(() => {
      const { cacheSize, inflightCount } = getBlobCacheStats();
      Sentry.metrics.gauge('sable.media.blob_cache_size', cacheSize);
      if (inflightCount > 0) Sentry.metrics.gauge('sable.media.inflight_requests', inflightCount);
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return null;
}

export function DeferredNotificationFeatures() {
  return (
    <>
      <InviteNotifications />
      <MessageNotifications />
      <BackgroundNotifications />
      <HandleDecryptPushEvent />
      <NotificationBanner />
      <TelemetryConsentBanner />
      <ThemeMigrationBanner />
      <HealthMonitor />
    </>
  );
}
