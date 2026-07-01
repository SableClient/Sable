import { describe, it, expect, beforeEach } from 'vitest';
import {
  defaultSettings,
  mergePersistedSettings,
  sanitizeSettingsDefaults,
  resetRuntimeSettingsDefaults,
} from '$state/settings';

beforeEach(() => {
  localStorage.clear();
  resetRuntimeSettingsDefaults();
});

describe('mergePersistedSettings', () => {
  it('layers deployer defaults over code defaults when localStorage is empty', () => {
    const merged = mergePersistedSettings(null, { twitterEmoji: false });
    expect(merged.twitterEmoji).toBe(false);
    expect(merged.pageZoom).toBe(defaultSettings.pageZoom);
  });

  it('lets localStorage override deployer defaults', () => {
    localStorage.setItem('settings', JSON.stringify({ twitterEmoji: true }));
    const merged = mergePersistedSettings(localStorage.getItem('settings'), {
      twitterEmoji: false,
    });
    expect(merged.twitterEmoji).toBe(true);
  });

  it('still applies monochrome migration when layering defaults', () => {
    localStorage.setItem('settings', JSON.stringify({ monochromeMode: true }));
    const merged = mergePersistedSettings(localStorage.getItem('settings'), {});
    expect(merged.saturationLevel).toBe(0);
  });

  it('migrates persisted ringtone preferences to valid values', () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({
        callRingtoneVolume: 140.2,
        callRingtoneId: 'invalid-tone',
        callRingbackTone: 'nope',
      })
    );
    const merged = mergePersistedSettings(localStorage.getItem('settings'), {});
    expect(merged.callRingtoneVolume).toBe(100);
    expect(merged.callRingtoneId).toBe(defaultSettings.callRingtoneId);
    expect(merged.callRingbackTone).toBe(defaultSettings.callRingbackTone);
  });

  it('migrates legacy ringback presets to new ringback ids', () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({
        callRingtoneId: 'minimal-ping',
        callRingbackTone: 'same-as-ringtone',
      })
    );
    const mergedSame = mergePersistedSettings(localStorage.getItem('settings'), {});
    expect(mergedSame.callRingbackTone).toBe('minimal-ping');

    localStorage.setItem('settings', JSON.stringify({ callRingbackTone: 'default-ringback' }));
    const mergedDefault = mergePersistedSettings(localStorage.getItem('settings'), {});
    expect(mergedDefault.callRingbackTone).toBe('classic-soft');
  });

  it('ignores legacy custom tone metadata keys during migration', () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({
        callCustomRingtoneName: 'tone.ogg',
        callCustomRingtoneSizeBytes: -5,
        callCustomRingtoneDurationMs: Number.NaN,
        callCustomRingbackName: 'ringback.ogg',
        callCustomRingbackSizeBytes: -7,
        callCustomRingbackDurationMs: Number.NaN,
      })
    );
    const merged = mergePersistedSettings(localStorage.getItem('settings'), {});
    expect(merged).not.toHaveProperty('callCustomRingtoneName');
    expect(merged).not.toHaveProperty('callCustomRingbackName');
  });
});

describe('sanitizeSettingsDefaults', () => {
  it('keeps known keys with valid types', () => {
    expect(sanitizeSettingsDefaults({ twitterEmoji: false })).toEqual({
      twitterEmoji: false,
    });
  });

  it('drops unknown keys', () => {
    expect(sanitizeSettingsDefaults({ notARealSetting: true, hour24Clock: true })).toEqual({
      hour24Clock: true,
    });
  });

  it('drops invalid types', () => {
    expect(sanitizeSettingsDefaults({ twitterEmoji: 'yes' })).toEqual({});
  });

  it('accepts messageLayout 0–2 only', () => {
    expect(sanitizeSettingsDefaults({ messageLayout: 2 })).toEqual({
      messageLayout: 2,
    });
    expect(sanitizeSettingsDefaults({ messageLayout: 9 })).toEqual({});
    expect(sanitizeSettingsDefaults({ messageLayout: 1.5 })).toEqual({});
  });

  it('accepts rightSwipeAction enum strings', () => {
    expect(sanitizeSettingsDefaults({ rightSwipeAction: 'members' })).toEqual({
      rightSwipeAction: 'members',
    });
    expect(sanitizeSettingsDefaults({ rightSwipeAction: 'nope' })).toEqual({});
  });

  it('sanitizes ringtone settings defaults', () => {
    expect(
      sanitizeSettingsDefaults({
        callRingtoneId: 'classic-soft',
        callRingbackTone: 'minimal-ping',
        callRingtoneVolume: 73.7,
      })
    ).toEqual({
      callRingtoneId: 'classic-soft',
      callRingbackTone: 'minimal-ping',
      callRingtoneVolume: 74,
    });
    expect(
      sanitizeSettingsDefaults({
        callRingtoneId: 'bad',
        callRingbackTone: 'bad',
        callRingtoneVolume: Number.NaN,
      })
    ).toEqual({});
  });

  it('accepts icon base size px values from 0 upward', () => {
    expect(
      sanitizeSettingsDefaults({
        iconCompactSizePx: 16,
        iconInlineSizePx: 20,
        iconToolbarSizePx: 24,
        iconEmptySizePx: 32,
      })
    ).toEqual({
      iconCompactSizePx: 16,
      iconInlineSizePx: 20,
      iconToolbarSizePx: 24,
      iconEmptySizePx: 32,
    });
    expect(sanitizeSettingsDefaults({ iconInlineSizePx: 0 })).toEqual({
      iconInlineSizePx: 0,
    });
    expect(sanitizeSettingsDefaults({ iconToolbarSizePx: 200 })).toEqual({
      iconToolbarSizePx: 200,
    });
    expect(sanitizeSettingsDefaults({ iconEmptySizePx: -1 })).toEqual({});
    expect(sanitizeSettingsDefaults({ iconEmptySizePx: 32.5 })).toEqual({});
  });
});
