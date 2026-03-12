import { MatrixClient, ReceiptType } from '$types/matrix-sdk';
import { isTauri } from '@tauri-apps/api/core';

export async function markAsRead(mx: MatrixClient, roomId: string, privateReceipt: boolean) {
  const room = mx.getRoom(roomId);
  if (!room) return;

  const timeline = room.getLiveTimeline().getEvents();
  const readEventId = room.getEventReadUpTo(mx.getUserId()!);

  const getLatestValidEvent = () => {
    for (let i = timeline.length - 1; i >= 0; i -= 1) {
      const latestEvent = timeline[i];
      if (latestEvent.getId() === readEventId) return null;
      if (!latestEvent.isSending()) return latestEvent;
    }
    return null;
  };
  if (timeline.length === 0) return;
  const latestEvent = getLatestValidEvent();
  if (latestEvent === null) return;

  const latestEventId = latestEvent.getId();
  if (!latestEventId) return;

  // Update both read receipt and fully-read marker so unread state clears reliably
  // across clients and bridge-heavy rooms where hidden events may exist.
  if (privateReceipt) {
    await mx.setRoomReadMarkers(roomId, latestEventId, undefined, latestEvent);
  } else {
    await mx.setRoomReadMarkers(roomId, latestEventId, latestEvent);
  }

  // Keep legacy receipt path as a safety fallback for homeservers with partial support.
  await mx.sendReadReceipt(
    latestEvent,
    privateReceipt ? ReceiptType.ReadPrivate : ReceiptType.Read
  );

  // On Android (Tauri), dismiss the room's OS notification immediately so
  // it stays in sync with the read state instead of lingering until the
  // next push payload with unread: 0 arrives.
  if (isTauri()) {
    try {
      const { clearRoomNotification } =
        await import('$features/settings/notifications/UnifiedPushNotifications');
      await clearRoomNotification(roomId);
    } catch {
      // Notification plugin not available (desktop, web) — ignore.
    }
  }
}
