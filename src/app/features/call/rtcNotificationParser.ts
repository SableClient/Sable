import {
  MAX_CALL_NOTIFICATION_LIFETIME_MS,
  normalizeCallIntent,
  toCallNotificationType,
  type CallIntentKind,
  type CallNotificationType,
} from './callIntent';

export const RTC_NOTIFICATION_EVENT_TYPE = 'org.matrix.msc4075.rtc.notification';
export const RTC_DECLINE_EVENT_TYPE = 'org.matrix.msc4310.rtc.decline';
export const REFERENCE_REL_TYPE = 'm.reference';

export type NotificationType = CallNotificationType;
export type NotificationIntentKind = CallIntentKind;

export { MAX_CALL_NOTIFICATION_LIFETIME_MS };

export type RtcNotificationEventLike = {
  type: string;
  sender: string;
  roomId: string;
  eventId: string;
  originServerTs: number;
  content: unknown;
  relation?: {
    rel_type?: string;
    event_id?: string;
  };
  isLiveEvent: boolean;
  isEncrypted: boolean;
};

type RtcMentions = {
  room?: boolean;
  user_ids?: string[];
};

type RtcNotificationContent = {
  sender_ts?: number;
  lifetime?: number;
  notification_type?: NotificationType;
  'm.mentions'?: RtcMentions;
  'm.call.intent'?: string;
};

export type ParseIncomingRtcNotificationOptions = {
  myUserId: string;
  now: number;
  maxLifetimeMs?: number;
  decryptContent?: () => Promise<unknown>;
};

export type ParsedIncomingRtcNotification = {
  roomId: string;
  notificationEventId: string;
  refEventId: string;
  senderId: string;
  senderTs: number;
  expiresAt: number;
  notificationType: NotificationType;
  intentKind: NotificationIntentKind;
  intentRaw?: string;
};

export type ParsedRtcDecline = {
  roomId: string;
  declineEventId: string;
  notificationEventId: string;
  senderId: string;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isMentioned = (mentions: RtcMentions | undefined, myUserId: string): boolean => {
  if (!mentions) return false;
  if (mentions.room) return true;
  return Array.isArray(mentions.user_ids) && mentions.user_ids.includes(myUserId);
};

const getSenderTimestamp = (contentTs: number, originTs: number): number =>
  contentTs - originTs > 20_000 ? originTs : contentTs;

export const parseIncomingRtcNotification = async (
  event: RtcNotificationEventLike,
  options: ParseIncomingRtcNotificationOptions
): Promise<ParsedIncomingRtcNotification | undefined> => {
  if (!event.isLiveEvent) return undefined;
  if (event.type !== RTC_NOTIFICATION_EVENT_TYPE) return undefined;
  if (event.sender === options.myUserId) return undefined;
  if (event.relation?.rel_type !== REFERENCE_REL_TYPE || !event.relation.event_id) return undefined;

  const rawContent = event.isEncrypted ? await options.decryptContent?.() : event.content;
  if (!isObject(rawContent)) return undefined;

  const content = rawContent as RtcNotificationContent;
  if (!isMentioned(content['m.mentions'], options.myUserId)) return undefined;

  const senderTsCandidate = content.sender_ts;
  const lifetimeCandidate = content.lifetime;
  const notificationType = toCallNotificationType(content.notification_type);

  if (typeof senderTsCandidate !== 'number') return undefined;
  if (typeof lifetimeCandidate !== 'number' || !Number.isFinite(lifetimeCandidate))
    return undefined;
  if (!notificationType) return undefined;

  const senderTs = getSenderTimestamp(senderTsCandidate, event.originServerTs);
  const lifetime = Math.min(lifetimeCandidate, options.maxLifetimeMs ?? 120_000);
  const expiresAt = senderTs + lifetime;
  if (options.now >= expiresAt) return undefined;

  const intentRaw =
    typeof content['m.call.intent'] === 'string' ? content['m.call.intent'] : undefined;

  return {
    roomId: event.roomId,
    notificationEventId: event.eventId,
    refEventId: event.relation.event_id,
    senderId: event.sender,
    senderTs,
    expiresAt,
    notificationType,
    intentKind: normalizeCallIntent(undefined, intentRaw),
    intentRaw,
  };
};

export const parseRtcDecline = (
  event: RtcNotificationEventLike,
  options: Pick<ParseIncomingRtcNotificationOptions, 'myUserId'>
): ParsedRtcDecline | undefined => {
  if (!event.isLiveEvent) return undefined;
  if (event.type !== RTC_DECLINE_EVENT_TYPE) return undefined;
  if (event.sender === options.myUserId) return undefined;
  if (event.relation?.rel_type !== REFERENCE_REL_TYPE || !event.relation.event_id) {
    return undefined;
  }

  return {
    roomId: event.roomId,
    declineEventId: event.eventId,
    notificationEventId: event.relation.event_id,
    senderId: event.sender,
  };
};
