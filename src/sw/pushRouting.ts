import {
  DEFAULT_NOTIFICATION_BADGE,
  DEFAULT_NOTIFICATION_ICON,
} from '../app/utils/notificationStyle';

export type InAppPushFallbackPayload = {
  roomId?: string;
  eventId?: string;
  userId?: string;
  title: string;
  body?: string;
  roomName?: string;
  senderName?: string;
  navigate?: string;
};

export type DeclarativeWebPushPayload = {
  web_push: 8030;
  notification: {
    title: string;
    body?: string;
    navigate?: string;
    app_badge?: number | string;
    tag?: string;
    icon?: string;
    badge?: string;
    image?: string;
    silent?: boolean;
    renotify?: boolean;
    data?: Record<string, unknown>;
  };
};

type MatrixLikePushPayload = {
  room_id?: unknown;
  event_id?: unknown;
  user_id?: unknown;
  sender_display_name?: unknown;
  room_name?: unknown;
};

export function isMinimalPushPayload(data: unknown): data is { room_id: string; event_id: string } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.room_id === 'string' && typeof d.event_id === 'string' && !d.type;
}

export function isDeclarativeWebPushPayload(data: unknown): data is DeclarativeWebPushPayload {
  if (!data || typeof data !== 'object') return false;
  const payload = data as Record<string, unknown>;
  if (payload.web_push !== 8030) return false;
  const notification = payload.notification;
  if (!notification || typeof notification !== 'object') return false;
  return typeof (notification as Record<string, unknown>).title === 'string';
}

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

export function buildInAppFallbackPayload(data: unknown): InAppPushFallbackPayload {
  if (isDeclarativeWebPushPayload(data)) {
    const { notification } = data;
    const nestedData =
      notification.data && typeof notification.data === 'object' ? notification.data : {};
    return {
      roomId: stringOrUndefined(nestedData.room_id),
      eventId: stringOrUndefined(nestedData.event_id),
      userId: stringOrUndefined(nestedData.user_id),
      title: notification.title || 'New Message',
      body: stringOrUndefined(notification.body) ?? 'New message received.',
      navigate: stringOrUndefined(notification.navigate),
    };
  }

  const pushData = data as MatrixLikePushPayload;
  const senderName = stringOrUndefined(pushData?.sender_display_name);
  const roomName = stringOrUndefined(pushData?.room_name);
  return {
    roomId: stringOrUndefined(pushData?.room_id),
    eventId: stringOrUndefined(pushData?.event_id),
    userId: stringOrUndefined(pushData?.user_id),
    title: roomName ?? 'New Message',
    body: senderName ? `${senderName} sent a message.` : 'New message received.',
    roomName,
    senderName,
  };
}

export function buildDeclarativeNotificationOptions(payload: DeclarativeWebPushPayload): {
  title: string;
  options: NotificationOptions;
} {
  const { notification } = payload;
  const data =
    notification.data && typeof notification.data === 'object'
      ? { ...notification.data, navigate: notification.navigate }
      : { navigate: notification.navigate };

  const options = {
    body: notification.body,
    icon: notification.icon ?? DEFAULT_NOTIFICATION_ICON,
    badge: notification.badge ?? DEFAULT_NOTIFICATION_BADGE,
    image: notification.image,
    tag: notification.tag,
    renotify: notification.renotify,
    silent: notification.silent,
    data,
  };

  return {
    title: notification.title,
    options: options as NotificationOptions,
  };
}
