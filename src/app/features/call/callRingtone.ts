import InviteSound from '$public/sound/invite.ogg';
import NotificationSound from '$public/sound/notification.ogg';
import RingtoneSound from '$public/sound/ringtone.webm';
import type { CallRingbackTone, CallRingtoneId, Settings } from '$state/settings';

export type CallToneOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

export const CUSTOM_CALL_RINGTONE_MAX_BYTES = 3_000_000;
export const CUSTOM_CALL_RINGTONE_MAX_DURATION_MS = 45_000;

export const CALL_RINGTONE_OPTIONS: CallToneOption<CallRingtoneId>[] = [
  { value: 'sable-default', label: 'Sable Default' },
  { value: 'classic-soft', label: 'Classic Soft Ring' },
  { value: 'minimal-ping', label: 'Minimal Ping Loop' },
  { value: 'silent', label: 'Silent (Visual Only)' },
  { value: 'custom', label: 'Custom File' },
];

export const CALL_RINGBACK_OPTIONS: CallToneOption<CallRingbackTone>[] = [
  { value: 'same-as-ringtone', label: 'Same As Ringtone' },
  { value: 'default-ringback', label: 'Default Ringback' },
  { value: 'silent', label: 'Silent' },
];

type ToneSettings = Pick<
  Settings,
  | 'isNotificationSounds'
  | 'callSoundOverrideGlobalNotifications'
>;

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
  customRingtoneUrl?: string
): string | null => {
  if (settings.callRingbackTone === 'silent') return null;

  if (settings.callRingbackTone === 'default-ringback') {
    return InviteSound;
  }

  return resolveIncomingCallToneUrl(settings, customRingtoneUrl);
};

export const readAudioDurationMs = async (file: Blob): Promise<number> =>
  new Promise<number>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    const cleanup = () => {
      audio.src = '';
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

    audio.src = objectUrl;
  });
