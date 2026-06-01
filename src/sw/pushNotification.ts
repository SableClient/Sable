/* oxlint-disable no-console */
// Keep the service worker import graph narrow, the app barrel pulls in runtime Matrix SDK modules that break SW script evaluation
import { EventType } from 'matrix-js-sdk/lib/@types/event';
import {
  buildRoomMessageNotification,
  DEFAULT_NOTIFICATION_ICON,
  DEFAULT_NOTIFICATION_BADGE,
  resolveNotificationPreviewText,
} from '../app/utils/notificationStyle';

type FocusMode = 'off' | 'focus' | 'dnd';

type NotificationSettings = {
  showMessageContent: boolean;
  showEncryptedMessageContent: boolean;
};

/**
 * Determines if a push notification should be shown based on the current focus mode.
 *
 * Focus Mode rules:
 * - DMs: always show
 * - Rooms: only show if highlight/mention
 *
 * Do Not Disturb rules:
 * - DMs: only show if highlight/mention
 * - Rooms: only show if highlight/mention
 *
 * Off: no filtering, show everything according to existing settings
 */
function shouldShowNotificationInFocusMode(
  focusMode: FocusMode,
  isDM: boolean,
  isHighlight: boolean
): boolean {
  console.log('[SW shouldShowNotificationInFocusMode]', { focusMode, isDM, isHighlight });
  
  if (focusMode === 'off') {
    console.log('[SW shouldShowNotificationInFocusMode] Off mode - allowing all');
    return true;
  }

  if (focusMode === 'focus') {
    // Focus: show all DMs, only highlights from rooms
    const result = isDM || isHighlight;
    console.log('[SW shouldShowNotificationInFocusMode] Focus mode -', result ? 'ALLOW' : 'BLOCK');
    return result;
  }

  if (focusMode === 'dnd') {
    // DND: only show DM highlights or room highlights
    console.log('[SW shouldShowNotificationInFocusMode] DND mode -', isHighlight ? 'ALLOW (is highlight)' : 'BLOCK (not highlight)');
    return isHighlight;
  }

  console.log('[SW shouldShowNotificationInFocusMode] Unknown mode - allowing by default');
  return true;
}

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
  counts?: {
    unread?: number;
    missed_calls?: number;
  };
  // Matrix push gateways should include this when the event matched a highlight rule
  // https://spec.matrix.org/v1.11/push-gateway-api/#post_matrixpushv1notify
  prio?: 'high' | 'low';
  data?: Record<string, unknown>;
}

/**
 * Attempt to determine if a push notification is for a direct message room.
 * This is a best-effort heuristic since the push payload doesn't always include
 * explicit room type information.
 */
function isDMRoom(pushData: MatrixPushData): boolean {
  // Check if data includes is_direct flag (some push gateways include this)
  if (pushData.data?.is_direct === true) return true;
  
  // Heuristic: DMs typically don't have a room name or have a simple name
  // (just the other user's name). This isn't perfect but better than nothing.
  // TODO: Ideally the push gateway should include explicit room type information.
  return false; // Conservative default - assume not a DM unless explicitly marked
}

/**
 * Attempt to determine if a push notification is for a highlight/mention.
 * This checks:
 * 1. Priority hint from push gateway (high priority usually indicates highlight)
 * 2. Explicit highlight flag in data (if push gateway includes it)
 */
function isHighlightNotification(pushData: MatrixPushData): boolean {
  // Check if data includes explicit highlight flag
  if (pushData.data?.highlight === true) return true;
  
  // High priority from push gateway usually indicates a highlight
  // https://spec.matrix.org/v1.11/push-gateway-api/#post_matrixpushv1notify
  if (pushData.prio === 'high') return true;
  
  return false;
}

const resolveSilent = (): boolean => false;

export const createPushNotifications = (
  self: ServiceWorkerGlobalScope,
  getNotificationSettings: () => NotificationSettings,
  getFocusMode: () => FocusMode,
  postSentryMetric: (
    metricName: string,
    value: number,
    attributes?: Record<string, string | number | boolean>
  ) => Promise<void>
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
    try {
      await self.registration.showNotification(title, notifOptions as NotificationOptions);
      // Track successful notification display
      postSentryMetric('sable.notification.displayed', 1, {
        event_type: (data?.type as string) ?? 'unknown',
        is_call: Boolean(data?.isCall),
        silent: Boolean(silent),
      }).catch(() => undefined);
    } catch (err) {
      console.error('[SW showNotification] failed:', err);
      // Track notification display failures
      postSentryMetric('sable.notification.display_failed', 1, {
        error_type: err instanceof Error ? err.name : 'unknown',
      }).catch(() => undefined);
      throw err;
    }
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
      console.warn('[SW pushNotification] no event type');
    }

    // Log push payload structure to Sentry for debugging focus mode filtering
    // This helps us understand what metadata is available for filtering decisions
    postSentryMetric('sable.push.payload_structure', 1, {
      event_type: pushData.type ?? 'unknown',
      has_prio: pushData.prio !== undefined,
      prio_value: pushData.prio ?? 'none',
      has_counts: pushData.counts !== undefined,
      has_data: pushData.data !== undefined,
      has_data_highlight: pushData.data?.highlight !== undefined,
      data_highlight_value: String(pushData.data?.highlight ?? 'none'),
      has_data_is_direct: pushData.data?.is_direct !== undefined,
      data_is_direct_value: String(pushData.data?.is_direct ?? 'none'),
      has_room_name: pushData.room_name !== undefined,
      room_name_empty: pushData.room_name === '',
    }).catch(() => undefined);

    // NOTE: Focus mode filtering is currently DISABLED in the service worker
    // because push payloads don't reliably include highlight/DM metadata.
    // Focus mode filtering happens on the app side (ClientNonUIFeatures and
    // BackgroundNotifications) where we have full event and room context.
    //
    // The app-side filtering works correctly and blocks notifications as expected.
    // Service worker push notifications are only shown when the app is fully
    // backgrounded/killed, and in that case it's safer to show the notification
    // (and let the user see it) than to incorrectly block an important message.
    //
    // TODO: Re-enable SW filtering once we can reliably detect DM/highlight status
    // from the push payload, or implement a mechanism to sync room metadata to SW.
    
    const focusMode = getFocusMode();
    console.log('[SW handlePushNotificationPushData] Focus mode:', focusMode, '(filtering disabled in SW - handled by app)');
    console.log('[SW handlePushNotificationPushData] Payload fields:', {
      has_prio: pushData.prio !== undefined,
      prio: pushData.prio,
      has_data_highlight: pushData.data?.highlight !== undefined,
      data_highlight: pushData.data?.highlight,
      has_data_is_direct: pushData.data?.is_direct !== undefined,
      data_is_direct: pushData.data?.is_direct,
    });

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
