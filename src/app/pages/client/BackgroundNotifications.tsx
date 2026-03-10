import { useEffect, useRef } from 'react';
import {
  ClientEvent,
  createClient,
  MatrixClient,
  MatrixEvent,
  MatrixEventEvent,
  Room,
  RoomEvent,
  SyncState,
  PushProcessor,
} from '$types/matrix-sdk';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { isTauri } from '@tauri-apps/api/core';
import {
  sessionsAtom,
  activeSessionIdAtom,
  Session,
  pendingNotificationAtom,
  backgroundUnreadCountsAtom,
  inAppBannerAtom,
} from '$state/sessions';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import {
  getMemberDisplayName,
  getNotificationType,
  getStateEvent,
  isNotificationEvent,
  getMDirects,
  isDMRoom,
} from '$utils/room';
import { NotificationType, StateEvent } from '$types/matrix/room';
import { createLogger } from '$utils/debug';
import LogoSVG from '$public/res/svg/cinny.svg';
import { nicknamesAtom } from '$state/nicknames';
import {
  buildRoomMessageNotification,
  resolveNotificationPreviewText,
} from '$utils/notificationStyle';
import { startClient, stopClient } from '$client/initMatrix';
import { useClientConfig } from '$hooks/useClientConfig';
import { mobileOrTablet } from '$utils/user-agent';

const log = createLogger('BackgroundNotifications');
const isClientReadyForNotifications = (state: SyncState | string | null): boolean =>
  state === SyncState.Prepared || state === SyncState.Syncing || state === SyncState.Catchup;

const startBackgroundClient = async (
  session: Session,
  slidingSyncConfig: ReturnType<typeof useClientConfig>['slidingSync']
): Promise<MatrixClient> => {
  const mx = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    userId: session.userId,
    deviceId: session.deviceId,
    timelineSupport: false,
  });
  await startClient(mx, {
    baseUrl: session.baseUrl,
    slidingSync: slidingSyncConfig,
    sessionSlidingSyncOptIn: session.slidingSyncOptIn,
  });
  return mx;
};

/**
 * Wait for the background client to finish its initial sync so that
 * push rules and account data are available before processing events.
 */
const waitForSync = (mx: MatrixClient): Promise<void> =>
  new Promise((resolve) => {
    const state = mx.getSyncState();
    if (isClientReadyForNotifications(state)) {
      resolve();
      return;
    }
    const onSync = (newState: SyncState) => {
      if (isClientReadyForNotifications(newState)) {
        mx.removeListener(ClientEvent.Sync, onSync);
        resolve();
      }
    };
    mx.on(ClientEvent.Sync, onSync);
  });

export function BackgroundNotifications() {
  const clientConfig = useClientConfig();
  const sessions = useAtomValue(sessionsAtom);
  const [activeSessionId, setActiveSessionId] = useAtom(activeSessionIdAtom);
  const [showNotifications] = useSetting(settingsAtom, 'useInAppNotifications');
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');
  const [showMessageContent] = useSetting(settingsAtom, 'showMessageContentInNotifications');
  const [showEncryptedMessageContent] = useSetting(
    settingsAtom,
    'showMessageContentInEncryptedNotifications'
  );
  const shouldRunBackgroundNotifications = showNotifications || usePushNotifications;
  const nicknames = useAtomValue(nicknamesAtom);
  const nicknamesRef = useRef(nicknames);
  nicknamesRef.current = nicknames;
  const showNotificationsRef = useRef(showNotifications);
  showNotificationsRef.current = showNotifications;
  const notificationSoundRef = useRef(notificationSound);
  notificationSoundRef.current = notificationSound;
  const showMessageContentRef = useRef(showMessageContent);
  showMessageContentRef.current = showMessageContent;
  const showEncryptedMessageContentRef = useRef(showEncryptedMessageContent);
  showEncryptedMessageContentRef.current = showEncryptedMessageContent;
  const clientsRef = useRef<Map<string, MatrixClient>>(new Map());
  const notifiedEventsRef = useRef<Set<string>>(new Set());
  const setPending = useSetAtom(pendingNotificationAtom);
  const setBackgroundUnreads = useSetAtom(backgroundUnreadCountsAtom);
  const setInAppBanner = useSetAtom(inAppBannerAtom);
  const setBackgroundUnreadsRef = useRef(setBackgroundUnreads);
  setBackgroundUnreadsRef.current = setBackgroundUnreads;
  const setInAppBannerRef = useRef(setInAppBanner);
  setInAppBannerRef.current = setInAppBanner;

  const inactiveSessions = sessions.filter(
    (s) => s.userId !== (activeSessionId ?? sessions[0]?.userId)
  );

  interface NotifyOptions {
    title: string;
    body?: string;
    icon?: string;
    badge?: string;
    silent?: boolean;
    /** Must include { type, room_id, event_id, user_id } for SW notificationclick routing. */
    data?: unknown;
    onClick?: () => void;
  }

  useEffect(() => {
    if (!shouldRunBackgroundNotifications) {
      return undefined;
    }

    const { current } = clientsRef;
    const activeIds = new Set(inactiveSessions.map((s) => s.userId));

    async function sendNotification(opts: NotifyOptions): Promise<void> {
      // Prefer SW showNotification so taps route through the notificationclick handler.
      if ('serviceWorker' in navigator && !isTauri()) {
        try {
          const reg = await navigator.serviceWorker.ready;
          await reg.showNotification(opts.title, {
            body: opts.body,
            icon: opts.icon,
            badge: opts.badge,
            silent: opts.silent ?? false,
            data: opts.data,
          } as NotificationOptions);
          return;
        } catch {
          // Fall through to window.Notification if SW registration fails.
        }
      }
      if ('Notification' in window && window.Notification.permission === 'granted') {
        const noti = new window.Notification(opts.title, {
          icon: opts.icon,
          badge: opts.badge,
          body: opts.body,
          silent: opts.silent ?? false,
          data: opts.data,
        });
        if (opts.onClick) {
          noti.onclick = () => {
            opts.onClick?.();
            noti.close();
          };
        }
      }
    }

    current.forEach((mx, userId) => {
      if (!activeIds.has(userId)) {
        stopClient(mx);
        current.delete(userId);
        setBackgroundUnreads((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      }
    });

    inactiveSessions.forEach((session) => {
      const alreadyRunning = current.has(session.userId);
      if (alreadyRunning) return;
      startBackgroundClient(session, clientConfig.slidingSync)
        .then(async (mx) => {
          current.set(session.userId, mx);

          await waitForSync(mx);

          // Wait for m.direct account data to load. This is critical for DM detection.
          // Without it, rooms in /direct/ won't be recognized as DMs, causing notifications to fail.
          let mDirectsSet: Set<string> | undefined;
          const mDirectEvent = mx.getAccountData('m.direct' as any);
          if (mDirectEvent) {
            mDirectsSet = getMDirects(mDirectEvent);
          } else {
            // Account data not loaded yet; wait for it
            await new Promise<void>((resolve) => {
              const handler = (event: MatrixEvent) => {
                if (event.getType() === 'm.direct') {
                  mDirectsSet = getMDirects(event);
                  mx.off(ClientEvent.AccountData as any, handler);
                  resolve();
                }
              };
              mx.on(ClientEvent.AccountData as any, handler);
              // Timeout after 5s to avoid blocking forever if m.direct never arrives
              setTimeout(() => {
                mx.off(ClientEvent.AccountData as any, handler);
                resolve();
              }, 5000);
            });
          }

          const pushProcessor = new PushProcessor(mx);

          // Keep mDirectsSet updated when m.direct account data changes
          const handleAccountData = (event: MatrixEvent) => {
            if (event.getType() === 'm.direct') {
              mDirectsSet = getMDirects(event);
            }
          };
          mx.on(ClientEvent.AccountData as any, handleAccountData);

          // Track encrypted events that are being decrypted to avoid re-checking the
          // encryption guard when the Decrypted callback fires.
          const decryptingEvents = new Set<string>();

          const handleTimeline = (
            mEvent: MatrixEvent,
            room: Room | undefined,
            toStartOfTimeline: boolean | undefined,
            removed: boolean,
            data: { liveEvent: boolean }
          ) => {
            if (!isClientReadyForNotifications(mx.getSyncState())) return;
            if (!room || room.isSpaceRoom()) return;

            // Allow recent events even if liveEvent is false (e.g., after decryption)
            // Historical filter: event is old (>60s before start) AND already read
            const eventId = mEvent.getId();
            if (!eventId) return;

            const eventType = mEvent.getType();
            const isEncryptedType = eventType === 'm.room.encrypted';

            // For encrypted events that haven't been decrypted yet, wait for decryption
            // before processing the notification. The SDK's Timeline re-emission after
            // decryption comes with data.liveEvent=false which would wrongly block it.
            // Check this BEFORE the liveEvent check so we can attach the listener early.
            if (
              eventId &&
              !decryptingEvents.has(eventId) &&
              mEvent.isEncrypted() &&
              isEncryptedType
            ) {
              decryptingEvents.add(eventId);
              const handleDecrypted = () => {
                // After decryption, run the notification logic with the decrypted event.
                // Force liveEvent=true since the SDK's re-emission sets it to false.
                handleTimeline(mEvent, room, toStartOfTimeline, removed, { liveEvent: true });
                // Clean up the tracking flag
                decryptingEvents.delete(eventId);
              };
              mEvent.once(MatrixEventEvent.Decrypted, handleDecrypted);
              return;
            }

            // Trust the SDK's liveEvent flag for non-encrypted events.
            // Encrypted events are handled above via the Decrypted listener.
            if (!data?.liveEvent) {
              return;
            }

            if (!isNotificationEvent(mEvent)) {
              return;
            }

            const notificationType = getNotificationType(mx, room.roomId);
            if (notificationType === NotificationType.Mute) {
              return;
            }

            const dedupeId = `${session.userId}:${eventId}`;
            if (notifiedEventsRef.current.has(dedupeId)) {
              return;
            }

            const sender = mEvent.getSender();
            if (!sender || sender === mx.getUserId()) {
              return;
            }

            // Check if this is a DM using multiple signals for robustness
            // Use the mDirectsSet that was loaded during initialization
            const isDM = isDMRoom(room, mDirectsSet);

            const pushActions = pushProcessor.actionsForEvent(mEvent);
            // For DMs with "All Messages" or "Default" notification settings:
            // Always notify even if push rules fail to match due to sliding sync limitations.
            // For "Mention & Keywords": respect the push rule (only notify if it matches).
            const shouldForceDMNotification =
              isDM && notificationType !== NotificationType.MentionsAndKeywords;
            // For reactions: Only notify if someone reacted to your own message
            let shouldForceReactionNotification = false;
            if (eventType === 'm.reaction') {
              const relatesTo = mEvent.getContent()['m.relates_to'];
              const reactedToEventId = relatesTo?.event_id;
              if (reactedToEventId) {
                const reactedToEvent = room.findEventById(reactedToEventId);
                if (reactedToEvent && reactedToEvent.getSender() === mx.getUserId()) {
                  shouldForceReactionNotification = true;
                }
              }
            }
            const shouldNotify =
              pushActions?.notify || shouldForceDMNotification || shouldForceReactionNotification;

            if (!shouldNotify) {
              return;
            }

            const senderName =
              getMemberDisplayName(room, sender, nicknamesRef.current) ??
              getMxIdLocalPart(sender) ??
              sender;

            const avatarMxc =
              room.getAvatarFallbackMember()?.getMxcAvatarUrl() ?? room.getMxcAvatarUrl();
            const roomAvatar = avatarMxc
              ? (mxcUrlToHttp(mx, avatarMxc, false, 96, 96, 'crop') ?? undefined)
              : LogoSVG;

            const loudByRule = Boolean(pushActions.tweaks?.sound);

            const isHighlight = Boolean(pushActions.tweaks?.highlight);
            setBackgroundUnreadsRef.current((prev) => {
              const cur = prev[session.userId] ?? { total: 0, highlight: 0 };
              return {
                ...prev,
                [session.userId]: {
                  total: cur.total + 1,
                  highlight: isHighlight ? cur.highlight + 1 : cur.highlight,
                },
              };
            });

            // Silent-rule events: unread badge updated above; no OS notification or sound.
            if (!loudByRule && !isHighlight) {
              return;
            }

            const isEncryptedRoom = !!getStateEvent(room, StateEvent.RoomEncryption);

            notifiedEventsRef.current.add(dedupeId);
            if (notifiedEventsRef.current.size > 200) {
              const first = notifiedEventsRef.current.values().next().value;
              if (first) notifiedEventsRef.current.delete(first);
            }

            const notificationPayload = buildRoomMessageNotification({
              roomName: room.name ?? room.getCanonicalAlias() ?? room.roomId,
              roomAvatar,
              username: senderName,
              recipientId: session.userId,
              previewText: resolveNotificationPreviewText({
                content: mEvent.getContent(),
                eventType: mEvent.getType(),
                isEncryptedRoom,
                showMessageContent: showMessageContentRef.current,
                showEncryptedMessageContent: showEncryptedMessageContentRef.current,
              }),
              silent: !notificationSoundRef.current || !loudByRule,
              eventId,
              data: {
                type: mEvent.getType(),
                room_id: room.roomId,
                event_id: eventId,
                user_id: session.userId,
              },
            });

            const notifOnClick = () => {
              window.focus();
              setActiveSessionId(session.userId);
              setPending({ roomId: room.roomId, eventId, targetSessionId: session.userId });
            };

            // Show in-app banner when app is visible, mobile, and in-app notifications enabled
            const canShowInAppBanner =
              document.visibilityState === 'visible' &&
              mobileOrTablet() &&
              showNotificationsRef.current;

            if (canShowInAppBanner) {
              // App is in the foreground on a different account — show the themed in-app banner.
              setInAppBannerRef.current({
                id: dedupeId,
                title: notificationPayload.title,
                roomName: room.name ?? room.getCanonicalAlias() ?? undefined,
                senderName,
                body: notificationPayload.options.body,
                icon: notificationPayload.options.icon,
                onClick: notifOnClick,
              });
            } else if (loudByRule) {
              // App is backgrounded or in-app notifications disabled — fire an OS notification.
              // Only send for loud (sound-tweak) rules; highlight-only events are silently counted.
              sendNotification({
                title: notificationPayload.title,
                icon: notificationPayload.options.icon,
                badge: notificationPayload.options.badge,
                body: notificationPayload.options.body,
                silent: notificationPayload.options.silent ?? undefined,
                data: notificationPayload.options.data,
                onClick: notifOnClick,
              });
            }
          };

          mx.on(RoomEvent.Timeline, handleTimeline as unknown as (...args: unknown[]) => void);
        })
        .catch((err) => {
          log.error('failed to start background client for', session.userId, err);
        });
    });

    return () => {
      current.forEach((mx) => stopClient(mx));
      current.clear();
    };
  }, [
    clientConfig.slidingSync,
    inactiveSessions,
    shouldRunBackgroundNotifications,
    setActiveSessionId,
    setPending,
    setBackgroundUnreads,
    setInAppBanner,
  ]);

  return null;
}
