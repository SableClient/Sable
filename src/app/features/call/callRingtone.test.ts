import { describe, expect, it } from 'vitest';
import {
  CALL_RINGBACK_OPTIONS,
  callRingtoneVolumeToGain,
  canPlayCallAudio,
  clampCallRingtoneVolume,
  resolveIncomingCallToneUrl,
  resolveOutgoingRingbackToneUrl,
  validateCustomCallRingtone,
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
        { callRingbackTone: 'minimal-ping', callRingtoneId: 'minimal-ping' },
        'blob:https://example.test/custom'
      )
    ).toContain('/public/sound/notification.ogg');
    expect(
      resolveOutgoingRingbackToneUrl(
        { callRingbackTone: 'custom', callRingtoneId: 'custom' },
        'blob:https://example.test/custom',
        'blob:https://example.test/ringback-custom'
      )
    ).toBe('blob:https://example.test/ringback-custom');
    expect(
      resolveOutgoingRingbackToneUrl(
        { callRingbackTone: 'custom', callRingtoneId: 'custom' },
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

  it('validates custom ringtone type, size, and duration constraints', () => {
    expect(
      validateCustomCallRingtone({
        fileName: 'ring.txt',
        mimeType: 'text/plain',
        sizeBytes: 10,
        durationMs: 1_000,
      })
    ).toEqual({ valid: false, reason: 'type' });

    expect(
      validateCustomCallRingtone({
        fileName: 'ring.ogg',
        mimeType: 'audio/ogg',
        sizeBytes: 9_999_999,
        durationMs: 1_000,
      })
    ).toEqual({ valid: false, reason: 'size' });

    expect(
      validateCustomCallRingtone({
        fileName: 'ring.ogg',
        mimeType: 'audio/ogg',
        sizeBytes: 10_000,
        durationMs: 0,
      })
    ).toEqual({ valid: false, reason: 'duration' });

    expect(
      validateCustomCallRingtone({
        fileName: 'ring.ogg',
        mimeType: 'audio/ogg',
        sizeBytes: 10_000,
        durationMs: 4_000,
      })
    ).toEqual({ valid: true });
  });

  it('excludes silent option from ringback choices', () => {
    expect(CALL_RINGBACK_OPTIONS.some((option) => option.value === 'silent')).toBe(false);
    expect(CALL_RINGBACK_OPTIONS.length).toBeGreaterThan(0);
  });
});
