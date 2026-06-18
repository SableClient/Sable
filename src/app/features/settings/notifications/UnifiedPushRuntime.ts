import type { MatrixClient } from '$types/matrix-sdk';
import type { MessagingStyleMessage, MessagingStylePerson } from './TauriNotificationsPluginApi';
import { EventType } from 'matrix-js-sdk/lib/@types/event';
import { resolveNotificationPreviewText } from '$utils/notificationStyle';
import { getMxIdLocalPart } from '$utils/matrix';
import { getMemberAvatarMxc, getStateEvent } from '$utils/room';
import { createDebugLogger } from '$utils/debugLogger';
import { createUnifiedPushMessageListener } from './UnifiedPushMessageListener';
import { getTauriNotificationsApi } from './TauriNotificationsApiClient';

type NotificationSettings = {
  mx: MatrixClient;
  showMessageContent: boolean;
  showEncryptedMessageContent: boolean;
  notificationSoundEnabled: boolean;
  useInAppNotifications: boolean;
};

const unifiedPushLog = createDebugLogger('unifiedpush');

const NOTIF_GROUP_KEY = 'matrix_messages';
const MAX_MESSAGES = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

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

type RoomNotifCache = {
  roomName: string;
  messages: MessagingStyleMessage[];
  seenEventIds: Set<string>;
  isGroupConversation: boolean;
  latestEventId?: string;
};

const roomNotifCaches = new Map<string, RoomNotifCache>();

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

export async function clearRoomNotification(roomId: string) {
  roomNotifCaches.delete(roomId);
  try {
    const notificationsApi = await getTauriNotificationsApi();
    await notificationsApi.removeActive([{ id: roomNotifId(roomId) }]);
  } catch {
    // already dismissed
  }
  if (roomNotifCaches.size <= 1) {
    try {
      const notificationsApi = await getTauriNotificationsApi();
      await notificationsApi.removeActive([{ id: SUMMARY_NOTIF_ID }]);
    } catch {
      // ignore
    }
  }
}

async function postRoomNotification(
  roomId: string,
  cache: RoomNotifCache,
  selfUser: MessagingStylePerson,
  isSilent: boolean,
  extra: Record<string, unknown>,
  authToken?: string | null
) {
  const notificationsApi = await getTauriNotificationsApi();
  const { messages, roomName, isGroupConversation } = cache;
  const latestMsg = messages[messages.length - 1];
  const latestBody = latestMsg ? `${latestMsg.sender?.name ?? 'You'}: ${latestMsg.text}` : '';

  await notificationsApi.sendNotification({
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
    await notificationsApi.sendNotification({
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

async function handleRichPushPayload(
  pushData: Record<string, unknown>,
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
        eventType: optionalString(pushData?.type),
        isEncryptedRoom: isEncrypted,
        showMessageContent: settings.showMessageContent,
        showEncryptedMessageContent: settings.showEncryptedMessageContent,
      });

      const roomId = optionalString(pushData?.room_id);
      const roomName = optionalString(pushData?.room_name) ?? 'Unknown Room';
      const senderName = optionalString(pushData?.sender_display_name);
      const senderId = optionalString(pushData?.sender);
      const isSilent = !settings.notificationSoundEnabled;

      const selfUserId = settings.mx.getUserId() ?? undefined;
      const selfUser: MessagingStylePerson = {
        name: 'You',
        key: selfUserId,
        iconUrl:
          selfUserId && roomId ? resolveAvatarUrl(settings.mx, roomId, selfUserId) : undefined,
      };

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

      const eventId = optionalString(pushData?.event_id);
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
      const content = isRecord(pushData?.content) ? pushData.content : undefined;
      if (content?.membership !== 'invite') break;
      const senderName = optionalString(pushData?.sender_display_name);
      const roomName = optionalString(pushData?.room_name);
      let body = '';
      if (senderName && roomName) body = `${senderName} invites you to ${roomName}`;
      else if (senderName) body = `from ${senderName}`;
      else if (roomName) body = `to ${roomName}`;

      const notificationsApi = await getTauriNotificationsApi();
      await notificationsApi.sendNotification({
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

async function handleMinimalPushPayload(
  pushData: Record<string, unknown>,
  settings: NotificationSettings
) {
  const roomId = optionalString(pushData?.room_id);
  const eventId = optionalString(pushData?.event_id);
  const counts = isRecord(pushData?.counts) ? pushData.counts : undefined;
  const unread: number | undefined = typeof counts?.unread === 'number' ? counts.unread : undefined;

  if (!roomId) return;

  if (unread === 0) {
    await clearRoomNotification(roomId);
    return;
  }

  const room = settings.mx.getRoom(roomId);
  const roomName = room?.name ?? 'Unknown Room';
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

  if (document.visibilityState === 'visible' && settings.useInAppNotifications) {
    return;
  }

  const pushData = isRecord(raw.notification) ? raw.notification : raw;
  const eventType = pushData?.type as EventType | undefined;

  if (eventType) {
    await handleRichPushPayload(pushData, settings);
  } else {
    await handleMinimalPushPayload(pushData, settings);
  }
}

export function listenForUnifiedPushMessages(getSettings: () => NotificationSettings) {
  return getTauriNotificationsApi().then((notificationsApi) =>
    notificationsApi.onUnifiedPushMessage(
      createUnifiedPushMessageListener(
        (data) => handleUnifiedPushPayload(data, getSettings),
        (error) => {
          unifiedPushLog.error(
            'notification',
            'UnifiedPush payload handling failed',
            error instanceof Error ? error : new Error(String(error))
          );
        }
      )
    )
  );
}
