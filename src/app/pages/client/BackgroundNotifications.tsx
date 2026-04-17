import { useEffect, useMemo, useRef } from 'react';
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
import { createDebugLogger } from '$utils/debugLogger';
import LogoSVG from '$public/res/svg/cinny-logo.svg';
import { nicknamesAtom } from '$state/nicknames';
import { activeRoomIdAtom } from '$state/room/activeRoomId';
import {
  buildRoomMessageNotification,
  resolveNotificationPreviewText,
} from '$utils/notificationStyle';
import * as Sentry from '@sentry/react';
import { startClient, stopClient } from '$client/initMatrix';
import { useClientConfig } from '$hooks/useClientConfig';
import { mobileOrTablet } from '$utils/user-agent';

const log = createLogger('BackgroundNotifications');
const debugLog = createDebugLogger('BackgroundNotifications');
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
 * Rejects after 30 seconds so callers can handle a stalled client instead
 * of blocking indefinitely.
 */
const waitForSync = (mx: MatrixClient): Promise<void> =>
  new Promise((resolve, reject) => {
    const state = mx.getSyncState();
    if (isClientReadyForNotifications(state)) {
      resolve();
      return;
    }
    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    const onSync = (newState: SyncState) => {
      if (isClientReadyForNotifications(newState)) {
        if (syncTimer !== undefined) clearTimeout(syncTimer);
        mx.removeListener(ClientEvent.Sync, onSync);
        resolve();
      }
    };
    mx.on(ClientEvent.Sync, onSync);
    syncTimer = setTimeout(() => {
      mx.removeListener(ClientEvent.Sync, onSync);
      reject(new Error('background client sync timed out'));
    }, 30_000);
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
  const activeRoomId = useAtomValue(activeRoomIdAtom);
  const nicknamesRef = useRef(nicknames);
  nicknamesRef.current = nicknames;
  const activeRoomIdRef = useRef(activeRoomId);
  activeRoomIdRef.current = activeRoomId;
  // Refs so handleTimeline callbacks always read current settings without stale closures
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
  // Stable setter refs so async handleTimeline closures never go stale.
  const setBackgroundUnreadsRef = useRef(setBackgroundUnreads);
  setBackgroundUnreadsRef.current = setBackgroundUnreads;
  const setInAppBannerRef = useRef(setInAppBanner);
  setInAppBannerRef.current = setInAppBanner;
  // Per-client listener teardown callbacks, so we can explicitly remove event
  // listeners before stopping a background client.
  const clientCleanupRef = useRef<Map<string, () => void>>(new Map());

  const inactiveSessions = useMemo(
    () => sessions.filter((s) => s.userId !== (activeSessionId ?? sessions[0]?.userId)),
    [sessions, activeSessionId]
  );
  // Ref so retry setTimeout callbacks can access the current session list
  // without stale closures.
  const inactiveSessionsRef = useRef(inactiveSessions);
  inactiveSessionsRef.current = inactiveSessions;

  interface NotifyOptions {
    /** Title shown in the notification banner. */
    title: string;
    /** Body text. */
    body?: string;
    /** URL to an icon (browser) – ignored on native where the app icon is used. */
    icon?: string;
    /** Badge icon URL shown by supported platforms. */
    badge?: string;
    /** If `true` the notification plays no sound. */
    silent?: boolean;
    /** Arbitrary payload attached to the notification.
     * Must include { type, room_id, event_id, user_id } so the SW notificationclick
     * handler can route the tap through HandleNotificationClick for account switching. */
    data?: unknown;
    /** Optional callback invoked when the user clicks the notification (window.Notification
     * fallback path only; the SW path routes via its own notificationclick handler). */
    onClick?: () => void;
  }

  useEffect(() => {
    if (!shouldRunBackgroundNotifications) {
      return undefined;
    }

    const { current } = clientsRef;
    const activeIds = new Set(inactiveSessions.map((s) => s.userId));
    const pendingRetryTimers = new Set<ReturnType<typeof setTimeout>>();

    async function sendNotification(opts: NotifyOptions): Promise<void> {
      // Prefer ServiceWorkerRegistration.showNotification so that taps are handled
      // by the SW notificationclick event. This routes through HandleNotificationClick
      // (postMessage path) which does the account switch + deep link reliably on all
      // platforms including iOS where window.Notification onclick is not fired.
      if ('serviceWorker' in navigator) {
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
        clientCleanupRef.current.get(userId)?.();
        clientCleanupRef.current.delete(userId);
        stopClient(mx);
        current.delete(userId);
        Sentry.metrics.gauge('sable.background.client_count', current.size);
        // Clear the background unread badge when this session is no longer a background account.
        setBackgroundUnreads((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      }
    });

    // startSession handles init, listener teardown tracking, and retry-on-failure.
    // Using a named function (vs. inline .then) lets the .catch() schedule a
    // fresh retry referencing the latest session from inactiveSessionsRef.
    const startSession = (session: Session, attempt = 0): void => {
      let sessionMx: MatrixClient | undefined;
      startBackgroundClient(session, clientConfig.slidingSync)
        .then(async (mx) => {
          sessionMx = mx;
          current.set(session.userId, mx);
          Sentry.metrics.gauge('sable.background.client_count', current.size);

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

            if (!isNotificationEvent(mEvent, room, mx.getUserId() ?? undefined)) {
              return;
            }

            const notificationType = getNotificationType(mx, room.roomId);
            if (notificationType === NotificationType.Mute) {
              debugLog.debug('notification', 'Room is muted - skipping notification', {
                roomId: room.roomId,
                eventId,
              });
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
            const shouldNotify = pushActions?.notify || shouldForceDMNotification;

            if (!shouldNotify) {
              debugLog.debug('notification', 'Event filtered - no push action match', {
                eventId,
                roomId: room.roomId,
                eventType,
                isDM,
              });
              return;
            }

            const loudByRule = Boolean(pushActions.tweaks?.sound);
            const isHighlight = Boolean(pushActions.tweaks?.highlight);

            debugLog.info('notification', 'Processing notification event', {
              eventId,
              roomId: room.roomId,
              eventType,
              isDM,
              isHighlight,
              loud: loudByRule,
            });

            const senderName =
              getMemberDisplayName(room, sender, nicknamesRef.current) ??
              getMxIdLocalPart(sender) ??
              sender;

            const avatarMxc =
              room.getAvatarFallbackMember()?.getMxcAvatarUrl() ?? room.getMxcAvatarUrl();
            const roomAvatar = avatarMxc
              ? (mxcUrlToHttp(mx, avatarMxc, false, 96, 96, 'crop') ?? undefined)
              : LogoSVG;

            // Track background unread count for every notifiable event (loud or silent).
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
              debugLog.debug('notification', 'Silent notification - badge updated only', {
                eventId,
                roomId: room.roomId,
              });
              return;
            }

            const isEncryptedRoom = !!getStateEvent(room, StateEvent.RoomEncryption);

            // After decryption, getType() still returns the wire type (m.room.encrypted).
            // Use the effective event type to get the decrypted type when available.
            const effectiveEventType = mEvent.getEffectiveEvent()?.type ?? mEvent.getType();

            notifiedEventsRef.current.add(dedupeId);
            // Cap the set so it doesn't grow unbounded
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
                eventType: effectiveEventType,
                isEncryptedRoom,
                showMessageContent: showMessageContentRef.current,
                showEncryptedMessageContent: showEncryptedMessageContentRef.current,
              }),
              // Play sound only if the push rule requests it and the user has sounds enabled.
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
              // Always switch to the background account – jotai ignores no-op updates
              setActiveSessionId(session.userId);
              setPending({ roomId: room.roomId, eventId, targetSessionId: session.userId });
            };

            // Skip notifications entirely when the active session is viewing
            // this exact room and the window has focus — the user is already
            // looking at the messages.
            if (room.roomId === activeRoomIdRef.current && document.hasFocus()) {
              debugLog.debug('notification', 'Skipping notification — room is active', {
                roomId: room.roomId,
                eventId,
              });
              return;
            }

            // Show in-app banner when app is visible, mobile, and in-app notifications enabled
            const canShowInAppBanner =
              document.visibilityState === 'visible' &&
              mobileOrTablet() &&
              showNotificationsRef.current;

            if (canShowInAppBanner) {
              // App is in the foreground on a different account — show the themed in-app banner.
              debugLog.info('notification', 'Showing in-app banner', {
                eventId,
                roomId: room.roomId,
                title: notificationPayload.title,
              });
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
              debugLog.info('notification', 'Sending OS notification', {
                eventId,
                roomId: room.roomId,
                title: notificationPayload.title,
                hasSound: !notificationPayload.options.silent,
              });
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

          // Register teardown so these listeners are removed when this client is stopped.
          clientCleanupRef.current.set(session.userId, () => {
            mx.off(ClientEvent.AccountData as any, handleAccountData);
            mx.off(RoomEvent.Timeline, handleTimeline as unknown as (...args: unknown[]) => void);
          });
        })
        .catch((err) => {
          log.error('failed to start background client for', session.userId, err);
          debugLog.error('notification', 'Failed to start background client', {
            userId: session.userId,
            error: err,
          });
          Sentry.captureException(err, { tags: { component: 'BackgroundNotifications' } });

          // Remove the stuck/failed client from current so future runs (or the
          // retry below) can attempt a fresh start.
          if (sessionMx && current.get(session.userId) === sessionMx) {
            clientCleanupRef.current.get(session.userId)?.();
            clientCleanupRef.current.delete(session.userId);
            current.delete(session.userId);
            stopClient(sessionMx);
          }

          // Retry with exponential backoff, up to 5 attempts (5s, 10s, 20s, 40s, 60s cap).
          if (attempt < 5) {
            const retryDelay = Math.min(5_000 * 2 ** attempt, 60_000);
            const timerId = setTimeout(() => {
              pendingRetryTimers.delete(timerId);
              const latestSession = inactiveSessionsRef.current.find(
                (s) => s.userId === session.userId
              );
              if (latestSession && !current.has(session.userId)) {
                startSession(latestSession, attempt + 1);
              }
            }, retryDelay);
            pendingRetryTimers.add(timerId);
          }
        });
    };

    inactiveSessions.forEach((session) => {
      if (!current.has(session.userId)) startSession(session);
    });

    return () => {
      pendingRetryTimers.forEach((id) => clearTimeout(id));
      pendingRetryTimers.clear();
      // Reading ref.current in cleanup is intentional - we want cleanup functions
      // that were registered during async startBackgroundClient operations
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const cleanupMap = clientCleanupRef.current;
      current.forEach((mx, userId) => {
        cleanupMap.get(userId)?.();
        cleanupMap.delete(userId);
        stopClient(mx);
      });
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
