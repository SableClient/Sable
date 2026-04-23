/* oxlint-disable no-console */
// Keep the service worker import graph narrow, the app barrel pulls in runtime Matrix SDK modules that break SW script evaluation
import { EventType } from 'matrix-js-sdk/lib/@types/event';
import {
  buildRoomMessageNotification,
  DEFAULT_NOTIFICATION_ICON,
  DEFAULT_NOTIFICATION_BADGE,
  resolveNotificationPreviewText,
} from '../app/utils/notificationStyle';

type NotificationSettings = {
  showMessageContent: boolean;
  showEncryptedMessageContent: boolean;
};

interface MatrixPushData {
  type?: string;
  content?: { notification_type?: string; membership?: string };
  sender_display_name?: string;
  room_name?: string;
  room_id?: string;
  room_avatar_url?: string;
  event_id?: string;
  user_id?: string;
  timestamp?: number;
  data?: Record<string, unknown>;
}

const resolveSilent = (): boolean => false;

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
    badge?: string
  ) => {
    const roomId: string | undefined = data?.room_id as string | undefined;
    // Group by room so new messages in the same room replace the previous
    // notification rather than stacking individually. renotify: true ensures
    // the user is still alerted when the existing tag is replaced.
    const tag: string = roomId ? `room-${roomId}` : ((data?.event_id as string) ?? 'Cinny');
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
    const content = pushData?.content as { notification_type?: string } | undefined;
    if (content?.notification_type !== 'ring') return;

    const senderDisplayName = pushData?.sender_display_name;
    const roomName = pushData?.room_name;
    const title = 'Incoming Call';
    const body = senderDisplayName
      ? `${senderDisplayName} is calling you ${roomName ? `in ${roomName}` : ''}`
      : 'Incoming voice chat';

    const data = {
      type: pushData?.type,
      room_id: pushData?.room_id,
      user_id: pushData?.user_id,
      timestamp: Date.now(),
      isCall: true,
      ...pushData.data,
    };

    await showNotificationWithData(title, body, data, resolveSilent(), pushData?.room_avatar_url);
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
