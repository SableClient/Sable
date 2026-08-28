import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { NotificationCountType, ReceiptType } from '$types/matrix-sdk';
import { isTauri } from '@tauri-apps/api/core';

const latestReceiptTarget = (timeline: MatrixEvent[], readEventId: string | null) => {
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    const event = timeline[i];
    if (!event) continue;
    if (event.getId() === readEventId) return null;
    if (!event.isSending()) return event;
  }
  return null;
};

const markRoomTimelineAsRead = async (
  mx: MatrixClient,
  room: Room,
  userId: string,
  privateReceipt: boolean
): Promise<boolean> => {
  const target = latestReceiptTarget(
    room.getLiveTimeline().getEvents(),
    room.getEventReadUpTo(userId)
  );
  const targetId = target?.getId();
  if (!target || !targetId) return false;

  if (privateReceipt) {
    await mx.setRoomReadMarkers(room.roomId, targetId, undefined, target);
  } else {
    await mx.setRoomReadMarkers(room.roomId, targetId, target);
  }
  room.setUnreadNotificationCount(NotificationCountType.Total, 0);
  room.setUnreadNotificationCount(NotificationCountType.Highlight, 0);
  return true;
};

// Thread replies never land in the live timeline, and the room badge sums the
// per-thread counters, so the room receipt alone can never clear them.
const markThreadsAsRead = async (
  mx: MatrixClient,
  room: Room,
  userId: string,
  privateReceipt: boolean
): Promise<boolean> => {
  const receiptType = privateReceipt ? ReceiptType.ReadPrivate : ReceiptType.Read;

  const cleared = await Promise.all(
    room.getThreads().map(async (thread) => {
      const hasUnread =
        room.getThreadUnreadNotificationCount(thread.id, NotificationCountType.Total) > 0 ||
        room.getThreadUnreadNotificationCount(thread.id, NotificationCountType.Highlight) > 0;
      if (!hasUnread) return false;

      const lastReply = thread.lastReply((event) => !event.isSending());
      const lastReplyId = lastReply?.getId();
      if (!lastReply || !lastReplyId) return false;

      if (thread.getEventReadUpTo(userId) !== lastReplyId) {
        try {
          await mx.sendReadReceipt(lastReply, receiptType);
        } catch {
          return false;
        }
      }
      room.setThreadUnreadNotificationCount(thread.id, NotificationCountType.Total, 0);
      room.setThreadUnreadNotificationCount(thread.id, NotificationCountType.Highlight, 0);
      return true;
    })
  );

  return cleared.some(Boolean);
};

// includeThreads is for explicit "mark as read" actions only: reading the main
// timeline must not wipe badges for threads the user has not opened.
export async function markAsRead(
  mx: MatrixClient,
  roomId: string,
  privateReceipt: boolean,
  includeThreads = false
) {
  const room = mx.getRoom(roomId);
  const userId = mx.getUserId();
  if (!room || !userId) return;

  const roomCleared = await markRoomTimelineAsRead(mx, room, userId, privateReceipt);
  const threadsCleared =
    includeThreads && (await markThreadsAsRead(mx, room, userId, privateReceipt));
  if (!roomCleared && !threadsCleared) return;

  // On Android (Tauri), dismiss the room's OS notification immediately so
  // it stays in sync with the read state instead of lingering until the
  // next push payload with unread: 0 arrives.
  if (isTauri()) {
    try {
      const { clearRoomNotification } =
        await import('$features/settings/notifications/UnifiedPushNotifications');
      await clearRoomNotification(userId, roomId);
    } catch {
      // Notification plugin not available (desktop, web) — ignore.
    }
  }
}
