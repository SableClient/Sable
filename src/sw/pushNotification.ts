/* oxlint-disable no-console */
// Keep the service worker import graph narrow, the app barrel pulls in runtime Matrix SDK modules that break SW script evaluation
import { EventType } from 'matrix-js-sdk/lib/@types/event';
import { normalizeCallIntent } from '../app/features/call/callIntent';
import {
  buildRoomMessageNotification,
  DEFAULT_NOTIFICATION_ICON,
  DEFAULT_NOTIFICATION_BADGE,
  resolveNotificationPreviewText,
} from '../app/utils/notificationStyle';
import { resolveCallNotificationCopy } from './pushCallNotificationCopy';

type NotificationSettings = {
  showMessageContent: boolean;
  showEncryptedMessageContent: boolean;
};

interface MatrixPushData {
  type?: string;
  content?: {
    notification_type?: string;
    membership?: string;
    sender_ts?: number;
    lifetime?: number;
    'm.call.intent'?: string;
    'm.relates_to'?: { event_id?: string };
  };
  sender_display_name?: string;
  sender_id?: string;
  room_name?: string;
  room_id?: string;
  room_avatar_url?: string;
  event_id?: string;
  user_id?: string;
  timestamp?: number;
  data?: Record<string, unknown>;
}

const resolveSilent = (): boolean => false;
const MAX_CALL_NOTIFICATION_LIFETIME_MS = 120_000;

const isCallNotificationType = (value: unknown): value is 'ring' | 'notification' =>
  value === 'ring' || value === 'notification';

const getCallTiming = (
  content: MatrixPushData['content'],
  originTs: number
): { senderTs: number; expiresAt: number } => {
  const senderTsCandidate = content?.sender_ts;
  const lifetimeCandidate = content?.lifetime;

  if (typeof senderTsCandidate !== 'number' || !Number.isFinite(senderTsCandidate)) {
    const senderTs = originTs;
    return {
      senderTs,
      expiresAt: senderTs + MAX_CALL_NOTIFICATION_LIFETIME_MS,
    };
  }

  const senderTs = senderTsCandidate - originTs > 20_000 ? originTs : senderTsCandidate;
  const lifetime =
    typeof lifetimeCandidate === 'number' && Number.isFinite(lifetimeCandidate)
      ? Math.min(Math.max(lifetimeCandidate, 0), MAX_CALL_NOTIFICATION_LIFETIME_MS)
      : MAX_CALL_NOTIFICATION_LIFETIME_MS;

  return {
    senderTs,
    expiresAt: senderTs + lifetime,
  };
};

export const createPushNotifications = (
  self: ServiceWorkerGlobalScope,
  getNotificationSettings: () => NotificationSettings
) => {
  const showNotificationWithData = async (
    title: string,
    body: string | undefined,
    data: Record<string, unknown>,
    silent?: boolean,
    icon?: string,
    badge?: string,
    tagOverride?: string
  ) => {
    const roomId: string | undefined = data?.room_id as string | undefined;
    // Group by room so new messages in the same room replace the previous
    // notification rather than stacking individually. renotify: true ensures
    // the user is still alerted when the existing tag is replaced.
    const tag: string =
      tagOverride ?? (roomId ? `room-${roomId}` : ((data?.event_id as string) ?? 'Cinny'));
    const renotify = !!roomId;
    // `renotify` is a valid Web API property absent from TypeScript's NotificationOptions type.
    // Build the options object separately to avoid the excess-property check, then cast.
    const notifOptions = {
      body,
      icon: icon ?? DEFAULT_NOTIFICATION_ICON,
      badge: badge ?? DEFAULT_NOTIFICATION_BADGE,
      tag,
      renotify,
      silent,
      data,
    };
    console.debug('[SW showNotification] title:', title, '| data:', JSON.stringify(data, null, 2));
    await self.registration.showNotification(title, notifOptions as NotificationOptions);
  };

  const handleCallNotification = async (pushData: MatrixPushData) => {
    if (pushData.type === EventType.RoomMessageEncrypted) return;

    const notificationTypeRaw = pushData?.content?.notification_type;
    if (!isCallNotificationType(notificationTypeRaw)) return;

    const intentRaw =
      typeof pushData?.content?.['m.call.intent'] === 'string'
        ? pushData.content['m.call.intent']
        : undefined;
    const intentKind = normalizeCallIntent(undefined, intentRaw);
    const senderDisplayName = pushData?.sender_display_name;
    const roomName = pushData?.room_name;
    const showPreviewDetails = getNotificationSettings().showMessageContent;
    const copy = resolveCallNotificationCopy({
      notificationType: notificationTypeRaw,
      intentKind,
      senderDisplayName,
      roomName,
      showPreviewDetails,
    });
    const originTs = typeof pushData.timestamp === 'number' ? pushData.timestamp : Date.now();
    const { senderTs, expiresAt } = getCallTiming(pushData.content, originTs);

    const data = {
      type: pushData?.type,
      room_id: pushData?.room_id,
      event_id: pushData?.event_id,
      user_id: pushData?.user_id,
      sender_id: pushData?.sender_id,
      timestamp: Date.now(),
      isCall: true,
      callNotificationType: notificationTypeRaw,
      callIntentKind: intentKind,
      callIntentRaw: intentRaw,
      callNotificationEventId: pushData?.event_id,
      callRefEventId: pushData?.content?.['m.relates_to']?.event_id,
      callSenderTs: senderTs,
      callExpiresAt: expiresAt,
      ...pushData.data,
    };

    const callTag = pushData?.room_id ? `call-${pushData.room_id}` : undefined;
    await showNotificationWithData(
      copy.title,
      copy.body,
      data,
      resolveSilent(),
      pushData?.room_avatar_url,
      undefined,
      callTag
    );
  };

  const handleRoomMessageNotification = async (pushData: MatrixPushData) => {
    const data: Record<string, unknown> = {
      type: pushData?.type,
      room_id: pushData?.room_id,
      event_id: pushData?.event_id,
      user_id: pushData?.user_id,
      timestamp: Date.now(),
      ...pushData.data,
    };
    const notificationPayload = buildRoomMessageNotification({
      roomName: pushData?.room_name,
      username: pushData?.sender_display_name,
      roomAvatar: pushData?.room_avatar_url,
      previewText: resolveNotificationPreviewText({
        content: pushData?.content,
        eventType: pushData?.type,
        isEncryptedRoom: false,
        showMessageContent: getNotificationSettings().showMessageContent,
        showEncryptedMessageContent: getNotificationSettings().showEncryptedMessageContent,
      }),
      silent: resolveSilent(),
      eventId: pushData?.event_id,
      recipientId: typeof pushData?.user_id === 'string' ? pushData.user_id : undefined,
      data,
    });
    await showNotificationWithData(
      notificationPayload.title,
      notificationPayload.options.body,
      data,
      notificationPayload.options.silent ?? undefined,
      notificationPayload.options.icon,
      notificationPayload.options.badge
    );
  };

  const handleEncryptedMessageNotification = async (pushData: MatrixPushData) => {
    const data: Record<string, unknown> = {
      type: pushData?.type,
      room_id: pushData?.room_id,
      event_id: pushData?.event_id,
      user_id: pushData?.user_id,
      timestamp: Date.now(),
      ...pushData.data,
    };
    const notificationPayload = buildRoomMessageNotification({
      roomName: pushData?.room_name,
      username: pushData?.sender_display_name,
      roomAvatar: pushData?.room_avatar_url,
      previewText: resolveNotificationPreviewText({
        content: pushData?.content,
        eventType: pushData?.type,
        isEncryptedRoom: true,
        showMessageContent: getNotificationSettings().showMessageContent,
        showEncryptedMessageContent: getNotificationSettings().showEncryptedMessageContent,
      }),
      silent: resolveSilent(),
      eventId: pushData?.event_id,
      recipientId: typeof pushData?.user_id === 'string' ? pushData.user_id : undefined,
      data,
    });
    await showNotificationWithData(
      notificationPayload.title,
      notificationPayload.options.body,
      data,
      notificationPayload.options.silent ?? undefined,
      notificationPayload.options.icon,
      notificationPayload.options.badge
    );
  };

  const handleInvitationNotification = async (pushData: MatrixPushData) => {
    const senderDisplayName = pushData?.sender_display_name;
    const roomName = pushData?.room_name;

    let body = '';
    if (senderDisplayName && roomName) body = `${senderDisplayName} invites you to ${roomName}`;
    if (senderDisplayName && !roomName) body = `from ${senderDisplayName}`;
    if (!senderDisplayName && roomName) body = `to ${roomName}`;
    if (!senderDisplayName && !roomName) body = '';

    const data = {
      type: pushData?.type,
      content: pushData?.content,
      user_id: pushData?.user_id,
      timestamp: Date.now(),
      ...pushData.data,
    };

    await showNotificationWithData('New Invitation', body, data, resolveSilent());
  };

  const handlePushNotificationPushData = async (pushData: MatrixPushData) => {
    const eventType = pushData?.type as EventType | undefined;
    if (!eventType) {
      console.warn('no event type');
    }

    switch (eventType as string) {
      case EventType.RoomMessage as string:
      case EventType.Sticker as string:
        await handleRoomMessageNotification(pushData);
        break;
      case EventType.RoomMessageEncrypted as string:
        await handleEncryptedMessageNotification(pushData);
        break;
      case EventType.RoomMember as string:
        if (!((pushData?.content as { membership?: string } | undefined)?.membership === 'invite'))
          break;
        await handleInvitationNotification(pushData);
        break;
      case 'org.matrix.msc4075.call.notify':
      case 'org.matrix.msc4075.rtc.notification':
        await handleCallNotification(pushData);
        break;
      default:
        // no voip support in app anyway
        break;
    }
  };

  return { handlePushNotificationPushData };
};
