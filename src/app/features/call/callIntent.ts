export type CallIntentKind = 'audio' | 'video';
export type CallNotificationType = 'ring' | 'notification';

export const MAX_CALL_NOTIFICATION_LIFETIME_MS = 120_000;

export const normalizeCallIntent = (intentKindRaw?: string, intentRaw?: string): CallIntentKind => {
  if (intentKindRaw === 'audio' || intentKindRaw === 'video') {
    return intentKindRaw;
  }
  const normalized = intentRaw?.toLowerCase();
  if (normalized?.includes('voice')) return 'audio';
  if (normalized?.includes('video')) return 'video';
  return 'audio';
};

export const toCallNotificationType = (value: unknown): CallNotificationType | undefined =>
  value === 'ring' || value === 'notification' ? value : undefined;

export const toCallNotificationTypeOrDefault = (
  value: unknown,
  defaultType: CallNotificationType = 'ring'
): CallNotificationType => toCallNotificationType(value) ?? defaultType;
