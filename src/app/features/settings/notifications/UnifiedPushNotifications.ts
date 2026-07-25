import {
  type CryptoBackend,
  type IPusherRequest,
  type MatrixClient,
  MatrixEvent,
} from '$types/matrix-sdk';
import { EventType } from 'matrix-js-sdk/lib/@types/event';
import {
  resolveNotificationPreviewText,
  ENCRYPTED_MESSAGE_PREVIEW,
} from '$utils/notificationStyle';
import { getMxIdLocalPart } from '$utils/matrix';
import { getStateEvent } from '$utils/room/hierarchy';
import { getMemberAvatarMxc } from '$utils/room/display';
import { createDebugLogger } from '$utils/debugLogger';
import {
  registerUnifiedPushTransport,
  type UnifiedPushRegistrationResult,
  unregisterUnifiedPushTransport,
} from './UnifiedPushTransport';
import {
  createUnifiedPushMessageListener,
  parseUnifiedPushMessage,
} from './UnifiedPushMessageListener';
import { addPluginListener } from '@tauri-apps/api/core';
import type { PushTransportConfig } from './NotificationTransport';
import {
  getTauriNotificationsApi,
  isAndroidTauri,
  isIosTauri,
} from './TauriNotificationsApiClient';
import {
  resolvePushNotifyUrl,
  withPushPayloadFormat,
  type PushPusherSettings,
} from './PushPusherConfig';

const UP_PUBLIC_GATEWAY = 'https://matrix.gateway.unifiedpush.org/_matrix/push/v1/notify';
export const DEFAULT_UNIFIED_PUSH_APP_ID = 'moe.sable.up';
const unifiedPushLog = createDebugLogger('unifiedpush');

/**
 * Shape of a UnifiedPush payload delivered to the message listener.
 * Fields are optional because both rich (full event) and minimal
 * (event_id + counts) payloads arrive through the same entry point.
 */
type UnifiedPushPayload = {
  type?: string;
  content?: Record<string, unknown>;
  room_id?: string;
  room_name?: string;
  sender_display_name?: string;
  sender?: string;
  event_id?: string;
  user_id?: string;
  counts?: { unread?: number };
  notification?: unknown;
  [key: string]: unknown;
};

const UP_REGISTER_TIMEOUT_MS = 30_000;

export type UnifiedPushTransportConfigInput = Pick<
  PushTransportConfig,
  'unifiedPushGatewayUrl' | 'unifiedPushAppID'
> & {
  vapidPublicKey?: string;
  webPushAppID?: string;
  pushNotifyUrl?: string;
} & PushPusherSettings;

type UnifiedPushPusherConfig = {
  appId: string;
  gatewayUrl?: string;
};

function trimConfigValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function resolveUnifiedPushPusherConfig(
  config?: UnifiedPushTransportConfigInput
): UnifiedPushPusherConfig {
  return {
    appId: trimConfigValue(config?.unifiedPushAppID) ?? DEFAULT_UNIFIED_PUSH_APP_ID,
    gatewayUrl: trimConfigValue(config?.unifiedPushGatewayUrl),
  };
}

export type EnableUnifiedPushResult =
  | {
      status: 'registered';
      endpoint: string;
      gatewayUrl: string;
      distributor: string;
    }
  | Exclude<UnifiedPushRegistrationResult, { status: 'registered' }>;

async function registerUnifiedPushWithTimeout(
  vapid?: string
): Promise<UnifiedPushRegistrationResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('UnifiedPush registration timed out'));
    }, UP_REGISTER_TIMEOUT_MS);
  });

  try {
    return await Promise.race([registerUnifiedPushTransport(vapid), timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function tryEnableUnifiedPush(
  mx: MatrixClient,
  config?: UnifiedPushTransportConfigInput
): Promise<EnableUnifiedPushResult> {
  const notificationsApi = await getTauriNotificationsApi();

  await notificationsApi.createChannel({
    id: 'messages',
    name: 'Messages',
    description: 'Matrix message and invite notifications',
    importance: notificationsApi.Importance.Default,
    vibration: true,
  });

  const registration = await registerUnifiedPushWithTimeout(config?.vapidPublicKey);

  if (registration.status !== 'registered') {
    return registration;
  }

  const { endpoint } = registration;
  const deviceDisplayName =
    (await mx.getDevice(mx.getDeviceId() ?? ''))?.display_name ?? 'Android Device';

  if (registration.p256dh && registration.auth && config?.webPushAppID && config?.pushNotifyUrl) {
    const pushNotifyUrl = resolvePushNotifyUrl(config.pushNotifyUrl, config?.pushNotifyUrlOverride);
    await mx.setPusher({
      kind: 'http',
      app_id: config.webPushAppID,
      pushkey: registration.p256dh,
      app_display_name: 'Sable (UnifiedPush)',
      device_display_name: deviceDisplayName,
      lang: navigator.language || 'en',
      data: withPushPayloadFormat(
        {
          url: pushNotifyUrl,
          endpoint,
          p256dh: registration.p256dh,
          auth: registration.auth,
          default_payload: { user_id: mx.getSafeUserId() },
        },
        config?.useRichPushPayloads
      ),
      append: false,
    } as unknown as IPusherRequest);

    return {
      status: 'registered',
      endpoint,
      gatewayUrl: pushNotifyUrl,
      distributor: registration.distributor,
    };
  }

  const resolvedConfig = resolveUnifiedPushPusherConfig(config);
  const gatewayUrl = resolvedConfig.gatewayUrl ?? UP_PUBLIC_GATEWAY;

  await mx.setPusher({
    kind: 'http',
    app_id: resolvedConfig.appId,
    pushkey: endpoint,
    app_display_name: 'Sable (UnifiedPush)',
    device_display_name: deviceDisplayName,
    lang: navigator.language || 'en',
    data: withPushPayloadFormat(
      { url: gatewayUrl, default_payload: { user_id: mx.getSafeUserId() } },
      config?.useRichPushPayloads
    ),
    append: false,
  } as unknown as IPusherRequest);

  return {
    status: 'registered',
    endpoint,
    gatewayUrl,
    distributor: registration.distributor,
  };
}

export async function enableUnifiedPush(
  mx: MatrixClient,
  config?: UnifiedPushTransportConfigInput
): Promise<{ endpoint: string; gatewayUrl: string }> {
  const result = await tryEnableUnifiedPush(mx, config);
  if (result.status !== 'registered') {
    throw new Error(result.error ?? 'UnifiedPush registration failed');
  }

  return {
    endpoint: result.endpoint,
    gatewayUrl: result.gatewayUrl,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

async function getCurrentDeviceUnifiedPushPushkeys(
  mx: MatrixClient,
  appId: string
): Promise<string[]> {
  const deviceId = mx.getDeviceId() ?? '';
  if (!deviceId) {
    return [];
  }

  const currentDevice = await mx.getDevice(deviceId);
  const deviceDisplayName = currentDevice?.display_name;
  if (!deviceDisplayName) {
    return [];
  }

  const response = await mx.getPushers();
  const pushers = response.pushers ?? [];
  return pushers
    .filter(
      (pusher) =>
        pusher.app_id === appId &&
        pusher.device_display_name === deviceDisplayName &&
        pusher.kind === 'http' &&
        isNonEmptyString(pusher.pushkey)
    )
    .map((pusher) => pusher.pushkey);
}

async function getUnifiedPushCleanupPushkeys(
  mx: MatrixClient,
  appId: string,
  pushkey?: string
): Promise<string[]> {
  const pushkeys = new Set<string>();

  if (isNonEmptyString(pushkey)) {
    pushkeys.add(pushkey);
  }

  const currentDevicePushkeys = await getCurrentDeviceUnifiedPushPushkeys(mx, appId);
  currentDevicePushkeys.forEach((candidate) => pushkeys.add(candidate));

  return Array.from(pushkeys);
}

export type DisableUnifiedPushOptions = {
  config?: UnifiedPushTransportConfigInput;
  pushkey?: string;
};

export async function disableUnifiedPush(
  mx: MatrixClient,
  options: DisableUnifiedPushOptions = {}
): Promise<void> {
  const { appId } = resolveUnifiedPushPusherConfig(options.config);
  const pushkeys = await getUnifiedPushCleanupPushkeys(mx, appId, options.pushkey);

  await Promise.allSettled(
    pushkeys.map((pushkey) =>
      mx.setPusher({
        kind: null,
        app_id: appId,
        pushkey,
      } as unknown as IPusherRequest)
    )
  );

  const webPushAppId = trimConfigValue(options.config?.webPushAppID);
  if (webPushAppId && webPushAppId !== appId) {
    const webPushKeys = await getCurrentDeviceUnifiedPushPushkeys(mx, webPushAppId);
    await Promise.allSettled(
      webPushKeys.map((pushkey) =>
        mx.setPusher({
          kind: null,
          app_id: webPushAppId,
          pushkey,
        } as unknown as IPusherRequest)
      )
    );
  }

  await unregisterUnifiedPushTransport();
}

type NotificationSettings = {
  mx: MatrixClient;
  showMessageContent: boolean;
  showEncryptedMessageContent: boolean;
  notificationSoundEnabled: boolean;
  useInAppNotifications: boolean;
};

const NOTIF_GROUP_KEY = 'matrix_messages';
const MAX_MESSAGES = 10;
const MAX_SEEN_EVENT_IDS = 200;

type NotifPerson = {
  name: string;
  key?: string;
  iconUrl?: string;
};

type NotifMessage = {
  text: string;
  timestamp: number;
  sender?: NotifPerson;
};

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

async function resolvePreviewEvent(
  mx: MatrixClient,
  roomId: string,
  eventId: string
): Promise<MatrixEvent | undefined> {
  try {
    const evt = await mx.fetchRoomEvent(roomId, eventId);
    const mEvent = new MatrixEvent(evt);
    if (mEvent.isEncrypted() && mx.getCrypto()) {
      await mEvent.attemptDecryption(mx.getCrypto() as CryptoBackend);
    }
    return mEvent;
  } catch (error) {
    unifiedPushLog.warn(
      'notification',
      'Failed to fetch/decrypt event for push preview',
      error instanceof Error ? error : new Error(String(error))
    );
    return undefined;
  }
}

/**
 * Decrypts the ciphertext from a rich push payload locally — no homeserver
 * fetch needed. The Megolm session keys are in the crypto store. This is
 * what makes encrypted notifications as fast as Element.
 */
async function decryptPreviewFromPayload(
  mx: MatrixClient,
  roomId: string,
  eventId: string,
  pushData: UnifiedPushPayload
): Promise<MatrixEvent | undefined> {
  const crypto = mx.getCrypto();
  if (!crypto || !pushData.content) return undefined;
  try {
    const mEvent = new MatrixEvent({
      type: 'm.room.encrypted',
      content: pushData.content,
      room_id: roomId,
      event_id: eventId,
      sender: pushData.sender,
      origin_server_ts: Date.now(),
    });
    await mEvent.attemptDecryption(crypto as CryptoBackend);
    return mEvent;
  } catch {
    return undefined;
  }
}

const roomNotifId = (userId: string, roomId: string) => hashCode(`${userId}\u0000${roomId}`);
const summaryNotifId = (userId: string) => hashCode(`sable-group-summary\u0000${userId}`);

type RoomNotifCache = {
  key: string;
  roomName: string;
  messages: NotifMessage[];
  seenEventIds: Set<string>;
  isGroupConversation: boolean;
};

const roomNotifCaches = new Map<string, RoomNotifCache>();

function resolveAvatarUrl(mx: MatrixClient, roomId: string, userId: string): string | undefined {
  const room = mx.getRoom(roomId);
  if (!room) return undefined;
  const mxcUrl = getMemberAvatarMxc(room, userId);
  if (!mxcUrl) return undefined;
  return mx.mxcUrlToHttp(mxcUrl, 96, 96, 'crop', false, true, true) ?? undefined;
}

function getOrCreateRoomCache(userId: string, roomId: string, roomName: string): RoomNotifCache {
  const key = `${userId}\u0000${roomId}`;
  let cache = roomNotifCaches.get(key);
  if (!cache) {
    cache = { key, roomName, messages: [], seenEventIds: new Set(), isGroupConversation: false };
    roomNotifCaches.set(key, cache);
  }
  cache.roomName = roomName;
  return cache;
}

/** Clears accumulated messages for a room and dismisses its notification. */
export async function clearRoomNotification(userId: string, roomId: string) {
  roomNotifCaches.delete(`${userId}\u0000${roomId}`);
  try {
    const notificationsApi = await getTauriNotificationsApi();
    await notificationsApi.removeActive([{ id: roomNotifId(userId, roomId) }]);
  } catch {
    // already dismissed
  }
  const accountRoomCount = Array.from(roomNotifCaches.keys()).filter((key) =>
    key.startsWith(`${userId}\u0000`)
  ).length;
  if (accountRoomCount <= 1) {
    try {
      const notificationsApi = await getTauriNotificationsApi();
      await notificationsApi.removeActive([{ id: summaryNotifId(userId) }]);
    } catch {
      // ignore
    }
  }
}

async function postRoomNotification(
  userId: string,
  roomId: string,
  cache: RoomNotifCache,
  isSilent: boolean,
  extra: Record<string, unknown>
) {
  const notificationsApi = await getTauriNotificationsApi();
  const { messages, roomName } = cache;
  const latestMsg = messages[messages.length - 1];
  const latestBody = latestMsg ? `${latestMsg.sender?.name ?? 'You'}: ${latestMsg.text}` : '';

  const inboxLines = messages.slice(-5).map((m) => `${m.sender?.name ?? 'You'}: ${m.text}`);

  await notificationsApi.sendNotification({
    id: roomNotifId(userId, roomId),
    title: roomName,
    body: latestBody,
    channelId: 'messages',
    group: NOTIF_GROUP_KEY,
    icon: 'notification_icon',
    silent: isSilent,
    autoCancel: true,
    extra,
    ...(isAndroidTauri() || isIosTauri() ? { actionTypeId: 'sable-message' } : {}),
    inboxLines: inboxLines.length > 1 ? inboxLines : undefined,
    largeBody: inboxLines.length > 1 ? undefined : latestBody,
  });

  const accountCaches = Array.from(roomNotifCaches.entries()).filter(([key]) =>
    key.startsWith(`${userId}\u0000`)
  );
  const roomCount = accountCaches.length;
  if (roomCount > 1) {
    const totalMessages = accountCaches
      .map(([, accountCache]) => accountCache)
      .reduce((sum, c) => sum + c.messages.length, 0);
    const summaryText = `${totalMessages} messages in ${roomCount} chats`;
    const summaryLines: string[] = [];
    accountCaches
      .map(([, accountCache]) => accountCache)
      .forEach((c) => {
        const latest = c.messages[c.messages.length - 1];
        if (latest) {
          summaryLines.push(`${c.roomName}: ${latest.sender?.name ?? 'You'}: ${latest.text}`);
        }
      });
    await notificationsApi.sendNotification({
      id: summaryNotifId(userId),
      title: summaryText,
      body: '',
      summary: summaryText,
      inboxLines: summaryLines.slice(-5),
      channelId: 'messages',
      group: NOTIF_GROUP_KEY,
      groupSummary: true,
      icon: 'notification_icon',
      silent: true,
      autoCancel: true,
    });
  }
}

/** Handles a rich push payload containing full event details (type, room_name, content, etc.). */
async function handleRichPushPayload(
  pushData: UnifiedPushPayload,
  settings: NotificationSettings,
  userId: string
) {
  const eventType = pushData.type as EventType;

  switch (eventType) {
    case EventType.RoomMessage:
    case EventType.Sticker:
    case EventType.RoomMessageEncrypted: {
      const isEncrypted = eventType === EventType.RoomMessageEncrypted;

      let previewText = resolveNotificationPreviewText({
        content: pushData?.content,
        eventType: pushData?.type,
        isEncryptedRoom: isEncrypted,
        showMessageContent: settings.showMessageContent,
        showEncryptedMessageContent: settings.showEncryptedMessageContent,
      });

      const roomId: string | undefined = pushData?.room_id;
      const roomName: string =
        pushData?.room_name ?? pushData?.sender_display_name ?? 'Unknown Room';
      const senderName: string | undefined = pushData?.sender_display_name;
      const senderId: string | undefined = pushData?.sender;
      const isSilent = !settings.notificationSoundEnabled;

      if (!roomId) {
        const notificationsApi = await getTauriNotificationsApi();
        await notificationsApi.sendNotification({
          title: roomName,
          body: senderName ? `${senderName}: ${previewText}` : previewText,
          channelId: 'messages',
          icon: 'notification_icon',
          silent: isSilent,
          autoCancel: true,
        });
        break;
      }

      const eventId: string | undefined = pushData?.event_id;

      if (
        previewText === ENCRYPTED_MESSAGE_PREVIEW &&
        eventId &&
        settings.showMessageContent &&
        settings.showEncryptedMessageContent
      ) {
        // Try local timeline first (decryption already done by SDK).
        const room = settings.mx.getRoom(roomId);
        const mEvent = room
          ?.getLiveTimeline()
          .getEvents()
          .find((e) => e.getId() === eventId);
        if (mEvent) {
          previewText = resolveNotificationPreviewText({
            content: mEvent.getContent(),
            eventType: mEvent.getType(),
            isEncryptedRoom: true,
            showMessageContent: settings.showMessageContent,
            showEncryptedMessageContent: settings.showEncryptedMessageContent,
          });
        } else {
          // Decrypt the ciphertext from the push payload locally — no
          // homeserver fetch needed. The Megolm keys are in the crypto store.
          const decrypted = await decryptPreviewFromPayload(settings.mx, roomId, eventId, pushData);
          if (decrypted) {
            previewText = resolveNotificationPreviewText({
              content: decrypted.getContent(),
              eventType: decrypted.getType(),
              isEncryptedRoom: true,
              showMessageContent: settings.showMessageContent,
              showEncryptedMessageContent: settings.showEncryptedMessageContent,
            });
          }
        }
      }

      const sender: NotifPerson | undefined = senderName
        ? {
            name: senderName,
            key: senderId,
            iconUrl: senderId ? resolveAvatarUrl(settings.mx, roomId, senderId) : undefined,
          }
        : undefined;

      const message: NotifMessage = {
        text: previewText,
        timestamp: Date.now(),
        sender,
      };

      const cache = getOrCreateRoomCache(userId, roomId, roomName);

      if (eventId && cache.seenEventIds.has(eventId)) break;
      if (eventId) cache.seenEventIds.add(eventId);

      cache.messages.push(message);
      if (cache.messages.length > MAX_MESSAGES) {
        cache.messages = cache.messages.slice(-MAX_MESSAGES);
      }

      const room = settings.mx.getRoom(roomId);
      if (room) {
        cache.isGroupConversation = (room.getJoinedMemberCount() ?? 0) > 2;
      }

      await postRoomNotification(userId, roomId, cache, isSilent, {
        room_id: roomId,
        event_id: pushData?.event_id,
        user_id: pushData?.user_id,
      });
      break;
    }
    case EventType.RoomMember: {
      if (pushData?.content?.membership !== 'invite') break;
      const senderName: string | undefined = pushData?.sender_display_name;
      const roomName: string | undefined = pushData?.room_name;
      let body = '';
      if (senderName && roomName) body = `${senderName} invites you to ${roomName}`;
      else if (senderName) body = `from ${senderName}`;
      else if (roomName) body = `to ${roomName}`;

      const notificationsApi = await getTauriNotificationsApi();
      await notificationsApi.sendNotification({
        title: 'New Invitation',
        body,
        largeBody: body,
        channelId: 'messages',
        group: NOTIF_GROUP_KEY,
        icon: 'notification_icon',
        autoCancel: true,
        extra: {
          type: 'invite',
          room_id: pushData?.room_id,
          event_id: pushData?.event_id,
          user_id: pushData?.user_id,
        },
      });
      break;
    }
    default:
      break;
  }
}

/**
 * Handles a minimal push payload (event_id + room_id + counts) from
 * the public UnifiedPush gateway, looking up context from local SDK state.
 */
async function handleMinimalPushPayload(
  pushData: UnifiedPushPayload,
  settings: NotificationSettings,
  userId: string
) {
  const roomId: string | undefined = pushData?.room_id;
  const eventId: string | undefined = pushData?.event_id;
  const unread: number | undefined =
    typeof pushData?.counts?.unread === 'number' ? pushData.counts.unread : undefined;

  if (!roomId) return;

  // Unread count of zero means the room was read — dismiss the notification.
  if (unread === 0) {
    await clearRoomNotification(userId, roomId);
    return;
  }

  const room = settings.mx.getRoom(roomId);
  const roomName = room?.name ?? pushData?.sender_display_name ?? 'Unknown Room';
  const isEncryptedRoom = room ? !!getStateEvent(room, EventType.RoomEncryption) : false;

  let senderName: string | undefined;
  let senderId: string | undefined;
  let previewText: string | undefined;
  if (room && eventId) {
    const timeline = room.getLiveTimeline().getEvents();
    const mEvent = timeline.find((e) => e.getId() === eventId);
    if (mEvent) {
      const sender = mEvent.getSender();
      if (sender) {
        const member = room.getMember(sender);
        senderName = member?.name ?? getMxIdLocalPart(sender) ?? sender;
        senderId = sender;
      }

      previewText = resolveNotificationPreviewText({
        content: mEvent.getContent(),
        eventType: mEvent.getType(),
        isEncryptedRoom,
        showMessageContent: settings.showMessageContent,
        showEncryptedMessageContent: settings.showEncryptedMessageContent,
      });
    }
  }

  const hasInMemoryPreview = Boolean(previewText);
  if (!previewText) {
    previewText = isEncryptedRoom ? 'Encrypted message' : 'New message';
  }

  const sender: NotifPerson | undefined = senderName
    ? {
        name: senderName,
        key: senderId,
        iconUrl: senderId && roomId ? resolveAvatarUrl(settings.mx, roomId, senderId) : undefined,
      }
    : undefined;

  const message: NotifMessage = {
    text: previewText,
    timestamp: Date.now(),
    sender,
  };

  const cache = getOrCreateRoomCache(userId, roomId, roomName);

  if (eventId && cache.seenEventIds.has(eventId)) return;
  if (eventId) {
    cache.seenEventIds.add(eventId);
    if (cache.seenEventIds.size > MAX_SEEN_EVENT_IDS) {
      const oldest = cache.seenEventIds.values().next().value;
      if (oldest !== undefined) cache.seenEventIds.delete(oldest);
    }
  }

  cache.messages.push(message);
  if (cache.messages.length > MAX_MESSAGES) {
    cache.messages = cache.messages.slice(-MAX_MESSAGES);
  }

  if (room) {
    cache.isGroupConversation = (room.getJoinedMemberCount() ?? 0) > 2;
  }

  await postRoomNotification(userId, roomId, cache, !settings.notificationSoundEnabled, {
    room_id: roomId,
    event_id: eventId,
    user_id: pushData?.user_id,
  });

  if (
    !hasInMemoryPreview &&
    eventId &&
    settings.showMessageContent &&
    (!isEncryptedRoom || settings.showEncryptedMessageContent)
  ) {
    resolvePreviewEvent(settings.mx, roomId, eventId)
      .then(async (fetched) => {
        // Skip if the notification was dismissed/replaced or the message evicted while fetching.
        if (!fetched || roomNotifCaches.get(cache.key) !== cache) return;
        if (!cache.messages.includes(message)) return;

        // Trust the fetched event's own encryption, not the (possibly-absent) room.
        const eventEncrypted = isEncryptedRoom || fetched.isEncrypted();
        const enrichedPreview = resolveNotificationPreviewText({
          content: fetched.getContent(),
          eventType: fetched.getType(),
          isEncryptedRoom: eventEncrypted,
          showMessageContent: settings.showMessageContent,
          showEncryptedMessageContent: settings.showEncryptedMessageContent,
        });
        if (!enrichedPreview) return;

        const fetchedSender = fetched.getSender();
        if (fetchedSender) {
          senderName =
            room?.getMember(fetchedSender)?.name ??
            getMxIdLocalPart(fetchedSender) ??
            fetchedSender;
          senderId = fetchedSender;
        }
        message.text = enrichedPreview;
        message.sender = senderName
          ? {
              name: senderName,
              key: senderId,
              iconUrl:
                senderId && roomId ? resolveAvatarUrl(settings.mx, roomId, senderId) : undefined,
            }
          : sender;

        await postRoomNotification(userId, roomId, cache, true, {
          room_id: roomId,
          event_id: eventId,
          user_id: pushData?.user_id,
        });
      })
      .catch((error) => {
        unifiedPushLog.warn(
          'notification',
          'Background preview fetch failed',
          error instanceof Error ? error : new Error(String(error))
        );
      });
  }
}

async function handleUnifiedPushPayload(
  raw: Record<string, unknown>,
  getSettings: () => NotificationSettings
) {
  const settings = getSettings();

  // Skip system notification when in-app banners are active and visible.
  if (document.visibilityState === 'visible' && settings.useInAppNotifications) {
    return;
  }

  const pushData = (raw.extra ?? raw) as UnifiedPushPayload;
  const eventType = pushData?.type as EventType | undefined;
  const userId = pushData?.user_id ?? settings.mx.getUserId() ?? '';

  if (eventType) {
    await handleRichPushPayload(pushData, settings, userId);
  } else {
    await handleMinimalPushPayload(pushData, settings, userId);
  }
}

export function listenForUnifiedPushMessages(getSettings: () => NotificationSettings) {
  const dispatch = createUnifiedPushMessageListener(
    (notification) => handleUnifiedPushPayload(notification, getSettings),
    (error) => {
      unifiedPushLog.error(
        'notification',
        'UnifiedPush payload handling failed',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  );

  return addPluginListener('notifications', 'push-message', (data: unknown) => {
    const notification = parseUnifiedPushMessage(data);
    if (notification) dispatch(notification);
  });
}
