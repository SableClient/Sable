import { describe, expect, it } from 'vitest';
import {
  callRingtoneVolumeToGain,
  canPlayCallAudio,
  clampCallRingtoneVolume,
  resolveIncomingCallToneUrl,
  resolveOutgoingRingbackToneUrl,
} from './callRingtone';

describe('callRingtone', () => {
  it('clamps ringtone volume to 0-100', () => {
    expect(clampCallRingtoneVolume(-5)).toBe(0);
    expect(clampCallRingtoneVolume(42.4)).toBe(42);
    expect(clampCallRingtoneVolume(121)).toBe(100);
  });

  it('converts volume to audio gain', () => {
    expect(callRingtoneVolumeToGain(0)).toBe(0);
    expect(callRingtoneVolumeToGain(80)).toBe(0.8);
    expect(callRingtoneVolumeToGain(100)).toBe(1);
  });

  it('resolves incoming tone with custom override', () => {
    expect(
      resolveIncomingCallToneUrl({ callRingtoneId: 'custom' }, 'blob:https://example.test/custom')
    ).toBe('blob:https://example.test/custom');
  });

  it('falls back to default incoming tone when custom asset is missing', () => {
    const incoming = resolveIncomingCallToneUrl({ callRingtoneId: 'custom' });
    expect(typeof incoming).toBe('string');
    expect(incoming).not.toBeNull();
  });

  it('resolves outgoing ringback modes', () => {
    expect(
      resolveOutgoingRingbackToneUrl(
        { callRingbackTone: 'same-as-ringtone', callRingtoneId: 'minimal-ping' },
        'blob:https://example.test/custom'
      )
    ).toContain('/public/sound/notification.ogg');
    expect(
      resolveOutgoingRingbackToneUrl(
        { callRingbackTone: 'same-as-ringtone', callRingtoneId: 'custom' },
        'blob:https://example.test/custom'
      )
    ).toBe('blob:https://example.test/custom');

    expect(
      resolveOutgoingRingbackToneUrl({
        callRingbackTone: 'silent',
        callRingtoneId: 'sable-default',
      })
    ).toBeNull();
  });

  it('respects call sound override against global notification sounds', () => {
    expect(
      canPlayCallAudio({
        isNotificationSounds: false,
        callSoundOverrideGlobalNotifications: false,
      })
    ).toBe(false);

    expect(
      canPlayCallAudio({
        isNotificationSounds: false,
        callSoundOverrideGlobalNotifications: true,
      })
    ).toBe(true);
  });
});
