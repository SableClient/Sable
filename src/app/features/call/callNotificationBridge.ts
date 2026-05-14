import type { IncomingCall, IncomingCallIntentKind, IncomingCallNotificationType } from '$state/callEmbed';

const MAX_CALL_NOTIFICATION_LIFETIME_MS = 120_000;

type CallCandidate = {
  roomId: string;
  notificationEventId: string;
  notificationTypeRaw?: string;
  intentKindRaw?: string;
  intentRaw?: string;
  refEventIdRaw?: string;
  senderIdRaw?: string;
  senderTsRaw?: number;
  expiresAtRaw?: number;
  isDirect: boolean;
};

const toNotificationType = (
  value: string | undefined
): IncomingCallNotificationType | undefined => {
  if (value === 'ring' || value === 'notification') return value;
  return undefined;
};

const normalizeIntentKind = (
  intentKindRaw: string | undefined,
  intentRaw: string | undefined
): IncomingCallIntentKind => {
  if (intentKindRaw === 'audio' || intentKindRaw === 'video') {
    return intentKindRaw;
  }
  const normalized = intentRaw?.toLowerCase();
  if (normalized?.includes('video')) return 'video';
  return 'audio';
};

const fromCandidate = (candidate: CallCandidate, now = Date.now()): IncomingCall | undefined => {
  const notificationType = toNotificationType(candidate.notificationTypeRaw) ?? 'ring';
  const senderTs =
    typeof candidate.senderTsRaw === 'number' && Number.isFinite(candidate.senderTsRaw)
      ? candidate.senderTsRaw
      : now;
  const expiresAt =
    typeof candidate.expiresAtRaw === 'number' && Number.isFinite(candidate.expiresAtRaw)
      ? candidate.expiresAtRaw
      : senderTs + MAX_CALL_NOTIFICATION_LIFETIME_MS;

  if (now >= expiresAt) return undefined;

  return {
    roomId: candidate.roomId,
    notificationEventId: candidate.notificationEventId,
    refEventId: candidate.refEventIdRaw || candidate.notificationEventId,
    senderId: candidate.senderIdRaw || 'unknown',
    senderTs,
    expiresAt,
    notificationType,
    intentKind: normalizeIntentKind(candidate.intentKindRaw, candidate.intentRaw),
    intentRaw: candidate.intentRaw,
    isDirect: candidate.isDirect,
  };
};

export const resolveIncomingCallFromNotificationData = (
  data: Record<string, unknown>,
  isDirect: boolean,
  now = Date.now()
): IncomingCall | undefined => {
  const roomId = typeof data.roomId === 'string' ? data.roomId : undefined;
  const eventId = typeof data.eventId === 'string' ? data.eventId : undefined;
  const callType = typeof data.callNotificationType === 'string' ? data.callNotificationType : undefined;

  if (!roomId || !eventId) return undefined;
  if (data.isCall !== true && !callType) return undefined;

  return fromCandidate(
    {
      roomId,
      notificationEventId: eventId,
      notificationTypeRaw: callType,
      intentKindRaw: typeof data.callIntentKind === 'string' ? data.callIntentKind : undefined,
      intentRaw: typeof data.callIntentRaw === 'string' ? data.callIntentRaw : undefined,
      refEventIdRaw: typeof data.callRefEventId === 'string' ? data.callRefEventId : undefined,
      senderIdRaw: typeof data.callSenderId === 'string' ? data.callSenderId : undefined,
      senderTsRaw: typeof data.callSenderTs === 'number' ? data.callSenderTs : undefined,
      expiresAtRaw: typeof data.callExpiresAt === 'number' ? data.callExpiresAt : undefined,
      isDirect,
    },
    now
  );
};

export const resolveIncomingCallFromSearchParams = (
  searchParams: URLSearchParams,
  roomId: string,
  notificationEventId: string | undefined,
  isDirect: boolean,
  now = Date.now()
): IncomingCall | undefined => {
  if (searchParams.get('call') !== '1') return undefined;
  if (!notificationEventId) return undefined;

  const senderTsRaw = Number(searchParams.get('callSenderTs'));
  const expiresAtRaw = Number(searchParams.get('callExpiresAt'));

  return fromCandidate(
    {
      roomId,
      notificationEventId,
      notificationTypeRaw: searchParams.get('callType') ?? undefined,
      intentKindRaw: searchParams.get('callIntentKind') ?? undefined,
      intentRaw: searchParams.get('callIntentRaw') ?? undefined,
      refEventIdRaw: searchParams.get('callRefEventId') ?? undefined,
      senderIdRaw: searchParams.get('callSenderId') ?? undefined,
      senderTsRaw: Number.isFinite(senderTsRaw) ? senderTsRaw : undefined,
      expiresAtRaw: Number.isFinite(expiresAtRaw) ? expiresAtRaw : undefined,
      isDirect,
    },
    now
  );
};

export const dismissSystemCallNotifications = async (roomId?: string): Promise<void> => {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const notifications = roomId
      ? await registration.getNotifications({ tag: `call-${roomId}` })
      : await registration.getNotifications();
    notifications.forEach((notification) => {
      if (!roomId || notification?.data?.room_id === roomId || notification?.data?.roomId === roomId) {
        notification.close();
      }
    });
  } catch {
    // Best-effort cleanup; ignore unsupported browsers and transient SW errors.
  }
};
