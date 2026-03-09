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
} from '$plugins/tauri-notifications';
import { EventType } from 'matrix-js-sdk/lib/@types/event';
import {
  buildRoomMessageNotification,
  resolveNotificationPreviewText,
} from '$utils/notificationStyle';
import { mxcUrlToHttp, authenticatedMediaFetch } from '$utils/matrix';

export { getUnifiedPushDistributors, getUnifiedPushDistributor, saveUnifiedPushDistributor };

/**
 * Probes the UP endpoint to discover if the distributor exposes a
 * Matrix-compatible push gateway (like FluffyChat does). Falls back
 * to the well-known public gateway or the configured one.
 */
async function discoverGateway(upEndpoint: string, configuredGateway?: string): Promise<string> {
  const PUBLIC_GATEWAY = 'https://matrix.gateway.unifiedpush.org/_matrix/push/v1/notify';
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
    // Probe failed — fall through to configured or public gateway
  }
  return configuredGateway ?? PUBLIC_GATEWAY;
}

export async function enableUnifiedPush(
  mx: MatrixClient,
  clientConfig: ClientConfig
): Promise<{ endpoint: string; instance: string }> {
  const { endpoint, instance } = await registerForUnifiedPush();

  const appId = clientConfig.pushNotificationDetails?.unifiedPushAppID ?? 'moe.sable.up';
  const configuredGateway =
    clientConfig.pushNotificationDetails?.unifiedPushGatewayUrl ??
    clientConfig.pushNotificationDetails?.pushNotifyUrl;

  const gatewayUrl = await discoverGateway(endpoint, configuredGateway);

  await mx.setPusher({
    kind: 'http',
    app_id: appId,
    pushkey: endpoint,
    app_display_name: 'Sable (UnifiedPush)',
    device_display_name:
      (await mx.getDevice(mx.getDeviceId() ?? '')).display_name ?? 'Android Device',
    lang: navigator.language || 'en',
    data: {
      url: gatewayUrl,
      format: 'event_id_only',
    },
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
  useAuthentication: boolean;
  showMessageContent: boolean;
  showEncryptedMessageContent: boolean;
  notificationSoundEnabled: boolean;
};

/**
 * Derives a stable 32-bit notification ID from a room ID so
 * newer messages in the same room replace the previous notification.
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Downloads an mxc:// avatar with authentication and returns a data: URL.
 * Returns undefined on any failure so the notification just omits the avatar.
 */
async function resolveAvatarDataUrl(
  mx: MatrixClient,
  useAuthentication: boolean,
  mxcUrl?: string
): Promise<string | undefined> {
  if (!mxcUrl) return undefined;
  try {
    const httpUrl = mxcUrlToHttp(mx, mxcUrl, useAuthentication, 96, 96, 'scale');
    if (!httpUrl) return undefined;
    const res = await authenticatedMediaFetch(httpUrl, mx.getAccessToken());
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

async function handleUnifiedPushPayload(
  raw: Record<string, unknown>,
  getSettings: () => NotificationSettings
) {
  // Sygnal wraps the payload in a `notification` field;
  // UP may also deliver the object flat.
  const pushData = (raw.notification ?? raw) as Record<string, any>;
  const eventType = pushData?.type as EventType | undefined;
  if (!eventType) return;

  const settings = getSettings();

  switch (eventType) {
    case EventType.RoomMessage:
    case EventType.Sticker:
    case EventType.RoomMessageEncrypted: {
      const isEncrypted = eventType === EventType.RoomMessageEncrypted;

      const avatarDataUrl = await resolveAvatarDataUrl(
        settings.mx,
        settings.useAuthentication,
        pushData?.room_avatar_url
      );

      const payload = buildRoomMessageNotification({
        roomName: pushData?.room_name,
        username: pushData?.sender_display_name,
        roomAvatar: avatarDataUrl ?? pushData?.room_avatar_url,
        previewText: resolveNotificationPreviewText({
          content: pushData?.content,
          eventType: pushData?.type,
          isEncryptedRoom: isEncrypted,
          showMessageContent: settings.showMessageContent,
          showEncryptedMessageContent: settings.showEncryptedMessageContent,
        }),
        silent: !settings.notificationSoundEnabled,
        eventId: pushData?.event_id,
        recipientId: typeof pushData?.user_id === 'string' ? pushData.user_id : undefined,
      });

      const roomId: string | undefined = pushData?.room_id;

      await sendNotification({
        // Stable per-room ID so newer messages in the same room
        // replace the previous notification instead of stacking.
        id: roomId ? Math.abs(hashCode(roomId)) : undefined,
        title: payload.title,
        body: payload.options.body ?? undefined,
        channelId: 'messages',
        group: roomId,
        icon: 'notification_icon',
        silent: payload.options.silent ?? false,
        autoCancel: true,
        extra: {
          room_id: roomId,
          event_id: pushData?.event_id,
          user_id: pushData?.user_id,
        },
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

      await sendNotification({
        title: 'New Invitation',
        body,
        channelId: 'messages',
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
