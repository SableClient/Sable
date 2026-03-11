import { MatrixClient } from '$types/matrix-sdk';
import { ClientConfig } from '$hooks/useClientConfig';
import {
  registerForUnifiedPush,
  unregisterFromUnifiedPush,
  getUnifiedPushDistributors,
  saveUnifiedPushDistributor,
  getUnifiedPushDistributor,
  onUnifiedPushMessage,
  onUnifiedPushEndpoint,
  sendNotification,
  removeActive,
  createChannel,
  Importance,
} from '@sableclient/tauri-plugin-notifications-api';
import type {
  MessagingStyleMessage,
  MessagingStylePerson,
} from '@sableclient/tauri-plugin-notifications-api';
import { EventType } from 'matrix-js-sdk/lib/@types/event';
import { resolveNotificationPreviewText } from '$utils/notificationStyle';
import { getMxIdLocalPart } from '$utils/matrix';
import { getStateEvent, getMemberAvatarMxc } from '$utils/room';
import { StateEvent } from '$types/matrix/room';

export { getUnifiedPushDistributors, getUnifiedPushDistributor, saveUnifiedPushDistributor };

const UP_PUBLIC_GATEWAY = 'https://matrix.gateway.unifiedpush.org/_matrix/push/v1/notify';

/**
 * Probes the UP endpoint for a Matrix-compatible push gateway.
 * Falls back to the configured or public UP gateway.
 * Note: pushNotifyUrl (Sygnal) is NOT suitable — only a proper UP gateway works.
 */
async function discoverGateway(upEndpoint: string, unifiedPushGateway?: string): Promise<string> {
  try {
    const probeUrl = new URL(upEndpoint);
    probeUrl.pathname = '/_matrix/push/v1/notify';
    probeUrl.search = '';
    const res = await fetch(probeUrl.toString());
    if (res.ok) {
      const body = await res.json();
      if (
        body?.gateway === 'matrix' ||
        (body?.unifiedpush && body.unifiedpush.gateway === 'matrix')
      ) {
        return probeUrl.toString();
      }
    }
  } catch {
    // probe failed
  }
  return unifiedPushGateway ?? UP_PUBLIC_GATEWAY;
}

const UP_REGISTER_TIMEOUT_MS = 30_000;

export async function enableUnifiedPush(
  mx: MatrixClient,
  clientConfig: ClientConfig
): Promise<{ endpoint: string; instance: string }> {
  await createChannel({
    id: 'messages',
    name: 'Messages',
    description: 'Matrix message and invite notifications',
    importance: Importance.Default,
    vibration: true,
  });

  const timeout = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      reject(new Error('UnifiedPush registration timed out'));
      clearTimeout(id);
    }, UP_REGISTER_TIMEOUT_MS);
  });
  const { endpoint, instance, pubKeySet } = await Promise.race([registerForUnifiedPush(), timeout]);

  const appId = clientConfig.pushNotificationDetails?.unifiedPushAppID ?? 'moe.sable.up';

  // Don't fall back to pushNotifyUrl (Sygnal) — it cannot forward to UP endpoints.
  const unifiedPushGateway = clientConfig.pushNotificationDetails?.unifiedPushGatewayUrl;

  const gatewayUrl = await discoverGateway(endpoint, unifiedPushGateway);

  const pusherData: Record<string, string> = {
    url: gatewayUrl,
  };

  // VAPID-capable distributors (e.g. NextPush) provide keys for RFC 8291 encryption.
  if (pubKeySet) {
    pusherData.p256dh = pubKeySet.pubKey;
    pusherData.auth = pubKeySet.auth;
  }

  await mx.setPusher({
    kind: 'http',
    app_id: appId,
    pushkey: endpoint,
    app_display_name: 'Sable (UnifiedPush)',
    device_display_name:
      (await mx.getDevice(mx.getDeviceId() ?? '')).display_name ?? 'Android Device',
    lang: navigator.language || 'en',
    data: pusherData,
    append: false,
  } as any);

  return { endpoint, instance };
}

export async function disableUnifiedPush(
  mx: MatrixClient,
  clientConfig: ClientConfig,
  pushkey?: string
): Promise<void> {
  const appId = clientConfig.pushNotificationDetails?.unifiedPushAppID ?? 'moe.sable.up';

  if (pushkey) {
    await mx.setPusher({
      kind: null,
      app_id: appId,
      pushkey,
    } as any);
  }

  await unregisterFromUnifiedPush();
}

type NotificationSettings = {
  mx: MatrixClient;
  showMessageContent: boolean;
  showEncryptedMessageContent: boolean;
  notificationSoundEnabled: boolean;
  useInAppNotifications: boolean;
};

// One MessagingStyle notification per room, accumulated into a single Android group.

const NOTIF_GROUP_KEY = 'matrix_messages';
const MAX_MESSAGES = 10;

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const roomNotifId = (roomId: string) => hashCode(roomId);
const SUMMARY_NOTIF_ID = hashCode('sable-group-summary');

/** Accumulated messages per room, cleared when unread drops to 0. */
type RoomNotifCache = {
  roomName: string;
  messages: MessagingStyleMessage[];
  seenEventIds: Set<string>;
  isGroupConversation: boolean;
  latestEventId?: string;
};

const roomNotifCaches = new Map<string, RoomNotifCache>();

/**
 * Resolves a user avatar to an HTTP URL for notification display.
 *
 * Returns an authenticated media URL (/_matrix/client/v1/media/).
 * The plugin's Kotlin layer downloads the image using the `authToken`
 * supplied in `MessagingStyleConfig`, so authenticated endpoints work.
 */
function resolveAvatarUrl(mx: MatrixClient, roomId: string, userId: string): string | undefined {
  const room = mx.getRoom(roomId);
  if (!room) return undefined;
  const mxcUrl = getMemberAvatarMxc(room, userId);
  if (!mxcUrl) return undefined;
  return mx.mxcUrlToHttp(mxcUrl, 96, 96, 'crop', false, true, true) ?? undefined;
}

function getOrCreateRoomCache(roomId: string, roomName: string): RoomNotifCache {
  let cache = roomNotifCaches.get(roomId);
  if (!cache) {
    cache = { roomName, messages: [], seenEventIds: new Set(), isGroupConversation: false };
    roomNotifCaches.set(roomId, cache);
  }
  cache.roomName = roomName;
  return cache;
}

/** Clears accumulated messages for a room and dismisses its notification. */
export async function clearRoomNotification(roomId: string) {
  roomNotifCaches.delete(roomId);
  try {
    await removeActive([{ id: roomNotifId(roomId) }]);
  } catch {
    // already dismissed
  }
  if (roomNotifCaches.size <= 1) {
    try {
      await removeActive([{ id: SUMMARY_NOTIF_ID }]);
    } catch {
      // ignore
    }
  }
}

/** Posts (or updates) the per-room MessagingStyle notification and the group summary. */
async function postRoomNotification(
  roomId: string,
  cache: RoomNotifCache,
  selfUser: MessagingStylePerson,
  isSilent: boolean,
  extra: Record<string, unknown>,
  authToken?: string | null
) {
  const { messages, roomName, isGroupConversation } = cache;
  const latestMsg = messages[messages.length - 1];
  const latestBody = latestMsg ? `${latestMsg.sender?.name ?? 'You'}: ${latestMsg.text}` : '';

  await sendNotification({
    id: roomNotifId(roomId),
    title: roomName,
    body: latestBody,
    channelId: 'messages',
    group: NOTIF_GROUP_KEY,
    icon: 'notification_icon',
    silent: isSilent,
    autoCancel: true,
    extra,
    messagingStyle: {
      user: selfUser,
      conversationTitle: isGroupConversation ? roomName : undefined,
      isGroupConversation,
      messages,
      authToken: authToken ?? undefined,
    },
  });

  // App-wide group summary — Android uses this when 4+ child notifications
  // exist. With only one room there's nothing to summarise, and posting a
  // summary can cause the OS to show the summary *instead of* the child
  // MessagingStyle notification on some devices.
  const roomCount = roomNotifCaches.size;
  if (roomCount > 1) {
    const totalMessages = Array.from(roomNotifCaches.values()).reduce(
      (sum, c) => sum + c.messages.length,
      0
    );
    const summaryText = `${totalMessages} messages in ${roomCount} chats`;
    const inboxLines: string[] = [];
    Array.from(roomNotifCaches.values()).forEach((c) => {
      const latest = c.messages[c.messages.length - 1];
      if (latest) {
        inboxLines.push(`${c.roomName}: ${latest.sender?.name ?? 'You'}: ${latest.text}`);
      }
    });
    await sendNotification({
      id: SUMMARY_NOTIF_ID,
      title: summaryText,
      body: '',
      summary: summaryText,
      inboxLines: inboxLines.slice(-5),
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
  pushData: Record<string, any>,
  settings: NotificationSettings
) {
  const eventType = pushData.type as EventType;

  switch (eventType) {
    case EventType.RoomMessage:
    case EventType.Sticker:
    case EventType.RoomMessageEncrypted: {
      const isEncrypted = eventType === EventType.RoomMessageEncrypted;

      const previewText = resolveNotificationPreviewText({
        content: pushData?.content,
        eventType: pushData?.type,
        isEncryptedRoom: isEncrypted,
        showMessageContent: settings.showMessageContent,
        showEncryptedMessageContent: settings.showEncryptedMessageContent,
      });

      const roomId: string | undefined = pushData?.room_id;
      const roomName: string = pushData?.room_name ?? 'Unknown Room';
      const senderName: string | undefined = pushData?.sender_display_name;
      const senderId: string | undefined = pushData?.sender;
      const isSilent = !settings.notificationSoundEnabled;

      const selfUserId = settings.mx.getUserId() ?? undefined;
      const selfUser: MessagingStylePerson = {
        name: 'You',
        key: selfUserId,
        iconUrl:
          selfUserId && roomId ? resolveAvatarUrl(settings.mx, roomId, selfUserId) : undefined,
      };

      if (!roomId) {
        await sendNotification({
          title: roomName,
          body: senderName ? `${senderName}: ${previewText}` : previewText,
          channelId: 'messages',
          icon: 'notification_icon',
          silent: isSilent,
          autoCancel: true,
        });
        break;
      }

      const sender: MessagingStylePerson | undefined = senderName
        ? {
            name: senderName,
            key: senderId,
            iconUrl: senderId ? resolveAvatarUrl(settings.mx, roomId, senderId) : undefined,
          }
        : undefined;

      const message: MessagingStyleMessage = {
        text: previewText,
        timestamp: Date.now(),
        sender,
      };

      const cache = getOrCreateRoomCache(roomId, roomName);

      const eventId: string | undefined = pushData?.event_id;
      if (eventId && cache.seenEventIds.has(eventId)) break;
      if (eventId) cache.seenEventIds.add(eventId);

      cache.messages.push(message);
      if (cache.messages.length > MAX_MESSAGES) {
        cache.messages = cache.messages.slice(-MAX_MESSAGES);
      }
      cache.latestEventId = eventId;

      const room = settings.mx.getRoom(roomId);
      if (room) {
        cache.isGroupConversation = (room.getJoinedMemberCount() ?? 0) > 2;
      }

      await postRoomNotification(
        roomId,
        cache,
        selfUser,
        isSilent,
        {
          room_id: roomId,
          event_id: pushData?.event_id,
          user_id: pushData?.user_id,
        },
        settings.mx.getAccessToken()
      );
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

      await sendNotification({
        title: 'New Invitation',
        body,
        channelId: 'messages',
        group: NOTIF_GROUP_KEY,
        icon: 'notification_icon',
        autoCancel: true,
        extra: {
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
  pushData: Record<string, any>,
  settings: NotificationSettings
) {
  const roomId: string | undefined = pushData?.room_id;
  const eventId: string | undefined = pushData?.event_id;
  const unread: number | undefined =
    typeof pushData?.counts?.unread === 'number' ? pushData.counts.unread : undefined;

  if (!roomId) return;

  // Unread count of zero means the room was read — dismiss the notification.
  if (unread === 0) {
    await clearRoomNotification(roomId);
    return;
  }

  const room = settings.mx.getRoom(roomId);
  const roomName = room?.name ?? 'Unknown Room';
  const isEncryptedRoom = room ? !!getStateEvent(room, StateEvent.RoomEncryption) : false;

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

  if (!previewText) {
    previewText = isEncryptedRoom ? 'Encrypted message' : 'New message';
  }

  const selfUserId = settings.mx.getUserId() ?? undefined;
  const selfUser: MessagingStylePerson = {
    name: 'You',
    key: selfUserId,
    iconUrl: selfUserId && roomId ? resolveAvatarUrl(settings.mx, roomId, selfUserId) : undefined,
  };

  const sender: MessagingStylePerson | undefined = senderName
    ? {
        name: senderName,
        key: senderId,
        iconUrl: senderId && roomId ? resolveAvatarUrl(settings.mx, roomId, senderId) : undefined,
      }
    : undefined;

  const message: MessagingStyleMessage = {
    text: previewText,
    timestamp: Date.now(),
    sender,
  };

  const cache = getOrCreateRoomCache(roomId, roomName);

  if (eventId && cache.seenEventIds.has(eventId)) return;
  if (eventId) cache.seenEventIds.add(eventId);

  cache.messages.push(message);
  if (cache.messages.length > MAX_MESSAGES) {
    cache.messages = cache.messages.slice(-MAX_MESSAGES);
  }
  cache.latestEventId = eventId;

  if (room) {
    cache.isGroupConversation = (room.getJoinedMemberCount() ?? 0) > 2;
  }

  await postRoomNotification(
    roomId,
    cache,
    selfUser,
    !settings.notificationSoundEnabled,
    {
      room_id: roomId,
      event_id: eventId,
    },
    settings.mx.getAccessToken()
  );
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

  // The UP gateway wraps the Matrix push in a `notification` field.
  const pushData = (raw.notification ?? raw) as Record<string, any>;
  const eventType = pushData?.type as EventType | undefined;

  if (eventType) {
    await handleRichPushPayload(pushData, settings);
  } else {
    await handleMinimalPushPayload(pushData, settings);
  }
}

export function listenForUnifiedPushMessages(getSettings: () => NotificationSettings) {
  return onUnifiedPushMessage((data: Record<string, unknown>) => {
    handleUnifiedPushPayload(data, getSettings);
  });
}

export function listenForUnifiedPushEndpointChanges(
  onEndpointChanged: (endpoint: string, instance: string) => void
) {
  return onUnifiedPushEndpoint(({ endpoint, instance }) => {
    onEndpointChanged(endpoint, instance);
  });
}
