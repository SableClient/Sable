import { ElementCallIntent } from '$plugins/call/types';

export type CallIntentKind = 'audio' | 'video';
export type CallNotificationType = 'ring' | 'notification';

export const MAX_CALL_NOTIFICATION_LIFETIME_MS = 120_000;

const VOICE_INTENTS = new Set<string>([
  ElementCallIntent.StartCallVoice,
  ElementCallIntent.JoinExistingVoice,
  ElementCallIntent.StartCallDMVoice,
  ElementCallIntent.JoinExistingDMVoice,
]);

const KNOWN_INTENTS = new Set<string>(Object.values(ElementCallIntent));

export const normalizeCallIntent = (intentKindRaw?: string, intentRaw?: string): CallIntentKind => {
  if (intentKindRaw === 'audio' || intentKindRaw === 'video') {
    return intentKindRaw;
  }
  if (!intentRaw) return 'audio';

  const normalized = intentRaw.toLowerCase();
  if (VOICE_INTENTS.has(normalized) || normalized.includes('voice')) {
    return 'audio';
  }
  if (KNOWN_INTENTS.has(normalized) || normalized.includes('video')) {
    return 'video';
  }
  return 'audio';
};

export const toCallNotificationType = (value: unknown): CallNotificationType | undefined =>
  value === 'ring' || value === 'notification' ? value : undefined;

export const toCallNotificationTypeOrDefault = (
  value: unknown,
  defaultType: CallNotificationType = 'ring'
): CallNotificationType => toCallNotificationType(value) ?? defaultType;
