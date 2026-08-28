import { atom } from 'jotai';

const NATIVE_REPLY_MAX = 8;
export const NATIVE_REPLY_EXPIRY_MS = 120_000;
export type NativeNotificationReply = {
  key: string;
  userId: string;
  roomId: string;
  eventId: string;
  text: string;
  createdAt: number;
};
type NativeActionPayload = {
  actionId: string;
  inputValue?: string | null;
  notification: {
    actionTypeId: string;
    extra: { user_id: string; room_id: string; event_id: string };
  };
};

export function parseNativeNotificationReply(
  value: unknown
): Omit<NativeNotificationReply, 'createdAt'> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const event = value as Partial<NativeActionPayload>;
  const notification = event.notification;
  const extra = notification?.extra;
  const text = typeof event.inputValue === 'string' ? event.inputValue.trim() : '';
  if (
    event.actionId !== 'sable-reply' ||
    notification?.actionTypeId !== 'sable-message' ||
    !text ||
    !extra ||
    typeof extra.user_id !== 'string' ||
    !extra.user_id ||
    typeof extra.room_id !== 'string' ||
    !extra.room_id ||
    typeof extra.event_id !== 'string' ||
    !extra.event_id
  )
    return undefined;
  return {
    key: `${extra.user_id}\u0000${extra.room_id}\u0000${extra.event_id}\u0000${text}`,
    userId: extra.user_id,
    roomId: extra.room_id,
    eventId: extra.event_id,
    text,
  };
}

export const nativeNotificationRepliesAtom = atom<NativeNotificationReply[]>([]);
export const nativeNotificationReplyInFlightAtom = atom<Set<string>>(new Set<string>());
export const enqueueNativeNotificationReplyAtom = atom(
  null,
  (get, set, reply: Omit<NativeNotificationReply, 'createdAt'>) => {
    const now = Date.now();
    const queue = get(nativeNotificationRepliesAtom).filter(
      (item) => now - item.createdAt < NATIVE_REPLY_EXPIRY_MS
    );
    if (queue.some((item) => item.key === reply.key) || queue.length >= NATIVE_REPLY_MAX) {
      set(nativeNotificationRepliesAtom, queue);
      return false;
    }
    set(nativeNotificationRepliesAtom, [...queue, { ...reply, createdAt: now }]);
    return true;
  }
);
export const removeNativeNotificationReplyAtom = atom(null, (get, set, key: string) =>
  set(
    nativeNotificationRepliesAtom,
    get(nativeNotificationRepliesAtom).filter((item) => item.key !== key)
  )
);
