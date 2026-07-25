import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import * as Sentry from '@sentry/react';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RoomEventHandlerMap } from '$types/matrix-sdk';
import {
  MatrixEvent,
  MatrixEventEvent,
  MsgType,
  RoomEvent,
  SyncState,
  EventType,
} from '$types/matrix-sdk';
import LogoSVG from '$public/res/svg/logo.svg';
import NotificationSound from '$public/sound/notification.ogg';
import InviteSound from '$public/sound/invite.ogg';
import { notificationPermission } from '$utils/dom';
import {
  getTauriNotificationsApi,
  isAndroidTauri,
  isDesktopTauri,
  isIosTauri,
  isNativeNotificationTauri,
  sendNativeTauriNotification,
} from '$features/settings/notifications/TauriNotificationsApiClient';
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
import { useInboxNotificationsSelected } from '$hooks/router/useRouteSelected';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import {
  pendingNotificationAtom,
  inAppBannerAtom,
  activeSessionIdAtom,
  sessionsAtom,
} from '$state/sessions';
import {
  buildRoomMessageNotification,
  resolveNotificationPreviewText,
} from '$utils/notificationStyle';
import { mobileOrTablet } from '$utils/user-agent';
import { createDebugLogger } from '$utils/debugLogger';
import { showToast } from '$state/toast';
import {
  nativeNotificationRepliesAtom,
  nativeNotificationReplyInFlightAtom,
  enqueueNativeNotificationReplyAtom,
  removeNativeNotificationReplyAtom,
  parseNativeNotificationReply,
  NATIVE_REPLY_EXPIRY_MS,
} from '$state/nativeNotificationReplies';
import { resolveIncomingCallFromNotificationData } from '$features/call/callNotificationBridge';
import { isIncomingCallSuppressed } from '$features/call/callIncomingIngress';
import { incomingCallAtom, mutedCallRoomIdAtom } from '$state/callEmbed';
import { getInboxInvitesPath } from '../../pathUtils';

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

export function InviteNotifications() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const invites = useAtomValue(allInvitesAtom);
  const perviousInviteLen = usePreviousValue(invites.length, 0);
  const mx = useMatrixClient();

  const navigate = useNavigate();
  const [showSystemNotifications] = useSetting(settingsAtom, 'useSystemNotifications');
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');
  const [backgroundNotificationSounds] = useSetting(settingsAtom, 'backgroundNotificationSounds');

  const notify = useCallback(
    (count: number) => {
      const body = `You have ${count} new invitation request.`;
      if (isNativeNotificationTauri()) {
        sendNativeTauriNotification({
          title: 'Invitation',
          body,
          silent: true,
          group: 'matrix_messages',
          extra: { type: 'invite' },
        }).catch(() => {});
        return;
      }
      const noti = new window.Notification('Invitation', {
        icon: LogoSVG,
        badge: LogoSVG,
        body,
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
    if (isAndroidTauri() || isIosTauri()) {
      invoke('play_notification_sound', { kind: 'invite' }).catch(() => {});
      return;
    }
    const audioElement = audioRef.current;
    audioElement?.play()?.catch(() => {});
    clearMediaSessionQuickly();
  }, []);

  useEffect(() => {
    if (invites.length <= perviousInviteLen || mx.getSyncState() !== SyncState.Syncing) return;

    // SW push (via Sygnal) handles invite notifications when the app is backgrounded.
    if (document.visibilityState !== 'visible' && usePushNotifications) return;

    // OS notification for invites — desktop, plus iOS while foregrounded (testing).
    if (
      (!mobileOrTablet() || isIosTauri()) &&
      showSystemNotifications &&
      (isNativeNotificationTauri() || notificationPermission('granted'))
    ) {
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

export function MessageNotifications() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const notifiedEventsRef = useRef(new Set());
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
  const [backgroundNotificationSounds] = useSetting(settingsAtom, 'backgroundNotificationSounds');
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
    if (isAndroidTauri() || isIosTauri()) {
      invoke('play_notification_sound', { kind: 'notification' }).catch(() => {});
      return;
    }
    const audioElement = audioRef.current;
    audioElement?.play()?.catch(() => {});
    clearMediaSessionQuickly();
  }, []);

  useEffect(() => {
    const pushProcessor = mx.pushProcessor;
    // Track encrypted events that should skip focus check when decrypted (because we
    // already checked focus when the encrypted event arrived, and want to use that
    // original state rather than re-checking after decryption completes).
    const skipFocusCheckEvents = new Set<string>();
    // Tracks when each event first arrived so we can measure notification delivery latency
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
      // Record event arrival time once per eventId (re-entry via handleDecrypted must not reset it)
      if (eventId && !notifyTimerMap.has(eventId)) {
        notifyTimerMap.set(eventId, performance.now());
      }
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
          handleTimelineEvent(mEvent, room, undefined, true, data);
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
      if (
        (!mobileOrTablet() || isIosTauri()) &&
        showSystemNotifications &&
        (isNativeNotificationTauri() || notificationPermission('granted'))
      ) {
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
          if (isNativeNotificationTauri()) {
            const extra: Record<string, string> = { type: mEvent.getType(), room_id: room.roomId };
            if (eventId) extra.event_id = eventId;
            const userId = mx.getUserId();
            if (userId) extra.user_id = userId;
            sendNativeTauriNotification({
              title: osPayload.title,
              body: osPayload.options.body,
              silent: osPayload.options.silent ?? false,
              extra,
              actionTypeId: 'sable-message',
              group: 'matrix_messages',
            }).catch(() => {});
          } else {
            const noti = new window.Notification(osPayload.title, osPayload.options);
            const { roomId } = room;
            noti.addEventListener('click', () => {
              window.focus();
              setPending({
                roomId,
                eventId,
                targetSessionId: mx.getUserId() ?? undefined,
              });
              noti.close();
            });
          }
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
          room,
          event: mEvent,
          icon: roomAvatar,
          onClick: () => {
            window.focus();
            setPending({
              roomId,
              eventId: capturedEventId,
              targetSessionId: capturedUserId,
            });
          },
        });
      }
    };
    mx.on(RoomEvent.Timeline, handleTimelineEvent);
    return () => {
      mx.removeListener(RoomEvent.Timeline, handleTimelineEvent);
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
    usePushNotifications,
    playSound,
    setInAppBanner,
    setPending,
    selectedRoomId,
    useAuthentication,
  ]);

  return (
    // oxlint-disable-next-line jsx-a11y/media-has-caption
    <audio ref={audioRef} style={{ display: 'none' }}>
      <source src={NotificationSound} type="audio/ogg" />
    </audio>
  );
}

export function HandleNotificationClick() {
  const setPending = useSetAtom(pendingNotificationAtom);
  const setActiveSessionId = useSetAtom(activeSessionIdAtom);
  const setIncomingCall = useSetAtom(incomingCallAtom);
  const mutedRoomId = useAtomValue(mutedCallRoomIdAtom);
  const [incomingVoiceRoomCallSoundEnabled] = useSetting(
    settingsAtom,
    'incomingVoiceRoomCallSoundEnabled'
  );
  const mDirects = useAtomValue(mDirectAtom);
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

      const incomingCall = resolveIncomingCallFromNotificationData(
        data as Record<string, unknown>,
        mDirects.has(roomId)
      );
      if (
        incomingCall &&
        !isIncomingCallSuppressed(incomingCall, mutedRoomId, incomingVoiceRoomCallSoundEnabled)
      ) {
        setIncomingCall(incomingCall);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [
    mDirects,
    mutedRoomId,
    navigate,
    setActiveSessionId,
    setIncomingCall,
    setPending,
    incomingVoiceRoomCallSoundEnabled,
  ]);

  return null;
}

export function SyncNotificationSettingsWithServiceWorker() {
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

/**
 * Listens for decryptPushEvent messages from the service worker, decrypts the
 * event using the local Olm/Megolm session, then replies with pushDecryptResult
 * so the SW can show a notification with the real message content.
 * Falls back gracefully (success: false) on any error or if keys are missing.
 */
export function HandleDecryptPushEvent() {
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

// Routes taps on native plugin notifications (desktop + iOS) using the `extra`
// payload attached in sendNativeTauriNotification.
export function NativeNotificationClickRouting() {
  const setPending = useSetAtom(pendingNotificationAtom);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativeNotificationTauri()) return undefined;

    let unregister: (() => Promise<void> | void) | undefined;
    let disposed = false;
    getTauriNotificationsApi()
      .then((api) =>
        api.onNotificationClicked(({ data }) => {
          if (isDesktopTauri()) {
            import('@tauri-apps/api/window')
              .then(({ getCurrentWindow }) => getCurrentWindow().setFocus())
              .catch(() => {});
          }
          if (!data) return;
          if (data.type === 'invite') {
            navigate(getInboxInvitesPath());
            return;
          }
          if (data.room_id) {
            setPending({
              roomId: data.room_id,
              eventId: data.event_id,
              targetSessionId: data.user_id,
            });
          }
        })
      )
      .then((listener) => {
        if (disposed) listener.unregister();
        else unregister = listener.unregister;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      unregister?.();
    };
  }, [setPending, navigate]);

  return null;
}

const SABLE_MESSAGE_ACTION_TYPE = 'sable-message';
const SABLE_REPLY_ACTION = 'sable-reply';

export function NativeNotificationActionRouting() {
  const mx = useMatrixClient();
  const queue = useAtomValue(nativeNotificationRepliesAtom);
  const sessions = useAtomValue(sessionsAtom);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const enqueue = useSetAtom(enqueueNativeNotificationReplyAtom);
  const remove = useSetAtom(removeNativeNotificationReplyAtom);
  const [inFlight, setInFlight] = useAtom(nativeNotificationReplyInFlightAtom);
  const [replyWakeup, setReplyWakeup] = useState(0);
  const setActiveSessionId = useSetAtom(activeSessionIdAtom);

  useEffect(() => {
    if (!isAndroidTauri() && !isIosTauri() && !isDesktopTauri()) return undefined;
    let disposed = false;
    let unregister: (() => Promise<void> | void) | undefined;

    const route = (event: unknown) => {
      const reply = parseNativeNotificationReply(event);
      if (!reply) return;
      if (
        !sessionsRef.current.some((session) => session.userId === reply.userId) ||
        !enqueue(reply)
      ) {
        showToast('Reply was not sent. Open the room to retry.');
      }
    };

    getTauriNotificationsApi()
      .then(async (api) => {
        await api.registerActionTypes([
          {
            id: SABLE_MESSAGE_ACTION_TYPE,
            actions: [{ id: SABLE_REPLY_ACTION, title: 'Reply', input: true }],
          },
        ]);
        return api.onAction(route);
      })
      .then((listener) => {
        if (disposed) listener.unregister();
        else unregister = listener.unregister;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      unregister?.();
    };
  }, [enqueue]);

  useEffect(() => {
    const item = queue[0];
    if (!item) return undefined;
    const expiresIn = NATIVE_REPLY_EXPIRY_MS - (Date.now() - item.createdAt);
    if (expiresIn <= 0) {
      remove(item.key);
      showToast('Reply was not sent. Open the room to retry.');
      return undefined;
    }
    const expiryTimer = setTimeout(() => {
      remove(item.key);
      showToast('Reply was not sent. Open the room to retry.');
    }, expiresIn);
    const clearExpiryTimer = () => clearTimeout(expiryTimer);
    if (mx.getUserId() !== item.userId) {
      setActiveSessionId(item.userId);
      return clearExpiryTimer;
    }
    const room = mx.getRoom(item.roomId);
    const ready = [SyncState.Prepared, SyncState.Syncing, SyncState.Catchup].includes(
      mx.getSyncState() as SyncState
    );
    if (!ready || !room) {
      const readinessTimer = setTimeout(() => setReplyWakeup((value) => value + 1), 750);
      return () => {
        clearExpiryTimer();
        clearTimeout(readinessTimer);
      };
    }
    if (room.getMyMembership() !== 'join') {
      remove(item.key);
      showToast('Reply was not sent. Open the room to retry.');
      return clearExpiryTimer;
    }
    if (inFlight.has(item.key)) return clearExpiryTimer;
    setInFlight((previous: Set<string>) => new Set(previous).add(item.key));
    void mx
      .sendMessage(item.roomId, null, { msgtype: MsgType.Text, body: item.text })
      .catch(() => {
        showToast('Reply was not sent. Open the room to retry.');
      })
      .finally(() => {
        setInFlight((previous: Set<string>) => {
          const next = new Set(previous);
          next.delete(item.key);
          return next;
        });
        remove(item.key);
      });
    return clearExpiryTimer;
  }, [mx, queue, remove, setActiveSessionId, inFlight, setInFlight, replyWakeup]);

  return null;
}
