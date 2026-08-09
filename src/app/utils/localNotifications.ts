import type { IContent, IEvent, MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { EventType, MatrixEventEvent, ReceiptType } from '$types/matrix-sdk';
import { NotificationType } from '$types/matrix/room';
import { isDMRoom, isNotificationEvent } from './room/unread';

export type StoredNotification = {
  room_id: string;
  event: IEvent;
  ts: number;
  highlight: boolean;
  isDM: boolean;
};

export type NotificationTab = 'dms' | 'mentions' | 'all';

export const MAX_BODY_LENGTH = 120;

const truncateContent = (content: IContent, storeContent: boolean): IContent => {
  if (content.ciphertext !== undefined) {
    return { ...content };
  }

  if (!storeContent) {
    return typeof content.msgtype === 'string' ? { msgtype: content.msgtype } : {};
  }

  const body = typeof content.body === 'string' ? content.body : undefined;
  const formattedBody =
    typeof content.formatted_body === 'string' ? content.formatted_body : undefined;

  const bodyTooLong = body !== undefined && body.length > MAX_BODY_LENGTH;
  const formattedTooLong = formattedBody !== undefined && formattedBody.length > MAX_BODY_LENGTH;

  const truncated: IContent = { ...content };
  if (!bodyTooLong && !formattedTooLong) return truncated;

  if (bodyTooLong) truncated.body = `${body.slice(0, MAX_BODY_LENGTH)}…`;
  delete truncated.formatted_body;
  delete truncated.format;
  return truncated;
};

const latestReceiptTs = (room: Room, userId: string): number | undefined => {
  const timestamps = [ReceiptType.Read, ReceiptType.ReadPrivate]
    .map((type) => room.getReadReceiptForUserId(userId, false, type)?.data?.ts)
    .filter((ts): ts is number => typeof ts === 'number');

  return timestamps.length === 0 ? undefined : Math.max(...timestamps);
};

export const isStoredNotificationRead = (
  room: Room,
  userId: string,
  entry: StoredNotification
): boolean => {
  if (room.findEventById(entry.event.event_id)) {
    return room.hasUserReadEvent(userId, entry.event.event_id);
  }

  const receiptTs = latestReceiptTs(room, userId);
  if (receiptTs === undefined) return false;
  return entry.ts <= receiptTs;
};

export const arePushRulesReady = (mx: MatrixClient): boolean => mx.pushRules?.global !== undefined;

const DM_OVERRIDE_EXCLUDED = new Set(['m.reaction', 'm.room.create']);

export type EvaluateOptions = {
  /** False when the user opted out of persisting message content. */
  storeContent?: boolean;
};

export const evaluateNotification = (
  mx: MatrixClient,
  room: Room,
  mEvent: MatrixEvent,
  mDirects: Set<string>,
  notificationType: NotificationType,
  options?: EvaluateOptions
): StoredNotification | undefined => {
  if (!arePushRulesReady(mx)) {
    return undefined;
  }

  if (notificationType === NotificationType.Mute) {
    return undefined;
  }

  if (room.isSpaceRoom()) {
    return undefined;
  }

  const userId = mx.getSafeUserId() ?? mx.getUserId() ?? '';
  if (!isNotificationEvent(mEvent, room, userId)) {
    return undefined;
  }

  if (mEvent.getSender() === userId) {
    return undefined;
  }

  if (mEvent.isSending()) {
    return undefined;
  }

  const pushProcessor = mx.pushProcessor;
  const actions = pushProcessor.actionsForEvent(mEvent);
  let notify = actions.notify;
  const highlight = actions.tweaks?.highlight === true;

  const isDM = isDMRoom(room, mDirects);
  notify =
    notify ||
    (isDM &&
      notificationType !== NotificationType.MentionsAndKeywords &&
      !DM_OVERRIDE_EXCLUDED.has(mEvent.getType()));

  if (!notify) {
    return undefined;
  }

  const event: IEvent = {
    event_id: mEvent.getId()!,
    type: mEvent.getType(),
    content: truncateContent(mEvent.getContent(), options?.storeContent !== false),
    sender: mEvent.getSender()!,
    origin_server_ts: mEvent.getTs(),
    room_id: room.roomId,
    unsigned: {},
  };

  return {
    room_id: room.roomId,
    event,
    ts: mEvent.getTs(),
    highlight,
    isDM,
  };
};

export const DECRYPT_WAIT_MS = 30_000;

export const isAwaitingDecryption = (mEvent: MatrixEvent): boolean =>
  mEvent.getType() === (EventType.RoomMessageEncrypted as string) && mEvent.isEncrypted();

export const watchDecryption = (
  mEvent: MatrixEvent,
  onDecrypted: () => void,
  onGiveUp?: () => void
): (() => void) => {
  const listener = () => {
    if (mEvent.isDecryptionFailure()) return;
    onDecrypted();
  };
  mEvent.on(MatrixEventEvent.Decrypted, listener);
  const giveUpId = onGiveUp && setTimeout(onGiveUp, DECRYPT_WAIT_MS);

  return () => {
    if (giveUpId !== undefined) clearTimeout(giveUpId);
    mEvent.off(MatrixEventEvent.Decrypted, listener);
  };
};

export const sliceNotificationPage = (
  all: StoredNotification[],
  offset: number,
  limit: number,
  tab: NotificationTab,
  includeRead: boolean,
  isRead: (entry: StoredNotification) => boolean
): { page: StoredNotification[]; nextToken?: string } => {
  const sorted = all
    .filter((entry) => {
      if (tab === 'dms' && !entry.isDM) return false;
      if (tab === 'mentions' && !entry.highlight) return false;
      return includeRead || !isRead(entry);
    })
    .toSorted((a, b) => b.ts - a.ts);
  const page = sorted.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  const nextToken = nextOffset < sorted.length ? String(nextOffset) : undefined;
  return { page, nextToken };
};
