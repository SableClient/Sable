import {
  DEFAULT_NOTIFICATION_BADGE,
  DEFAULT_NOTIFICATION_ICON,
} from '../app/utils/notificationStyle';

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

export type EncryptedMinimalPushFocusDecision = 'ignore_stale_focus' | 'no_focused_client';

export function getEncryptedMinimalPushFocusDecision(
  focusedClientCount: number
): EncryptedMinimalPushFocusDecision {
  return focusedClientCount > 0 ? 'ignore_stale_focus' : 'no_focused_client';
}

export type ForegroundPushState = {
  visibilityState?: string;
};

export function shouldSuppressOsPushForForegroundState(
  state: ForegroundPushState | undefined
): boolean {
  return state?.visibilityState === 'visible';
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
