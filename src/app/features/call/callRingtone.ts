import InviteSound from '$public/sound/invite.ogg';
import NotificationSound from '$public/sound/notification.ogg';
import RingtoneSound from '$public/sound/ringtone.webm';
import { CALL_TONE_IDS, type CallRingtoneId, type Settings } from '$state/settings';

export type CallToneOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

export const CUSTOM_CALL_RINGTONE_MAX_BYTES = 3_000_000;
export const CUSTOM_CALL_RINGTONE_MAX_DURATION_MS = 45_000;

const CALL_TONE_LABELS: Record<CallRingtoneId, string> = {
  'sable-default': 'Sable Default',
  'classic-soft': 'Classic Soft Ring',
  'minimal-ping': 'Minimal Ping Loop',
  silent: 'Silent (Visual Only)',
  custom: 'Custom File',
};

export const CALL_RINGTONE_OPTIONS: CallToneOption<CallRingtoneId>[] = CALL_TONE_IDS.map(
  (value) => ({
    value,
    label: CALL_TONE_LABELS[value],
  })
);

export const CALL_RINGBACK_OPTIONS: CallToneOption<CallRingtoneId>[] = CALL_RINGTONE_OPTIONS;

type ToneSettings = Pick<Settings, 'isNotificationSounds' | 'callSoundOverrideGlobalNotifications'>;

export const clampCallRingtoneVolume = (volume: number): number =>
  Math.max(0, Math.min(100, Math.round(volume)));

export const callRingtoneVolumeToGain = (volume: number): number =>
  clampCallRingtoneVolume(volume) / 100;

export const canPlayCallAudio = (settings: ToneSettings): boolean =>
  settings.callSoundOverrideGlobalNotifications || settings.isNotificationSounds;

const resolveBuiltInTone = (id: Exclude<CallRingtoneId, 'custom'>): string | null => {
  switch (id) {
    case 'sable-default':
      return RingtoneSound;
    case 'classic-soft':
      return InviteSound;
    case 'minimal-ping':
      return NotificationSound;
    case 'silent':
      return null;
    default:
      return RingtoneSound;
  }
};

export const resolveIncomingCallToneUrl = (
  settings: Pick<Settings, 'callRingtoneId'>,
  customRingtoneUrl?: string
): string | null => {
  if (settings.callRingtoneId === 'custom') {
    return customRingtoneUrl ?? RingtoneSound;
  }

  return resolveBuiltInTone(settings.callRingtoneId);
};

export const resolveOutgoingRingbackToneUrl = (
  settings: Pick<Settings, 'callRingbackTone' | 'callRingtoneId'>,
  customRingtoneUrl?: string,
  customRingbackUrl?: string
): string | null => {
  if (settings.callRingbackTone === 'custom') {
    return customRingbackUrl ?? resolveIncomingCallToneUrl(settings, customRingtoneUrl);
  }
  if (settings.callRingbackTone === 'silent') return null;
  if (settings.callRingbackTone === settings.callRingtoneId) {
    return resolveIncomingCallToneUrl(settings, customRingtoneUrl);
  }
  return resolveBuiltInTone(settings.callRingbackTone);
};

export const readAudioDurationMs = async (file: Blob): Promise<number> =>
  new Promise<number>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    const cleanup = () => {
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(objectUrl);
    };

    audio.addEventListener(
      'loadedmetadata',
      () => {
        const duration = Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0;
        cleanup();
        resolve(duration);
      },
      { once: true }
    );
    audio.addEventListener(
      'error',
      () => {
        cleanup();
        reject(new Error('Unable to read audio duration.'));
      },
      { once: true }
    );

    audio.setAttribute('src', objectUrl);
    audio.load();
  });

type CustomRingtoneValidationInput = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
};

export const validateCustomCallRingtone = (
  input: CustomRingtoneValidationInput
): { valid: true } | { valid: false; reason: 'type' | 'size' | 'duration' } => {
  if (!input.mimeType.startsWith('audio/')) {
    return { valid: false, reason: 'type' };
  }
  if (input.sizeBytes > CUSTOM_CALL_RINGTONE_MAX_BYTES) {
    return { valid: false, reason: 'size' };
  }
  if (input.durationMs <= 0 || input.durationMs > CUSTOM_CALL_RINGTONE_MAX_DURATION_MS) {
    return { valid: false, reason: 'duration' };
  }

  return { valid: true };
};
