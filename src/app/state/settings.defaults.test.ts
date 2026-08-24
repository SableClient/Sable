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
  it('defaults new calls off and persists the opt-in', () => {
    expect(defaultSettings.newCallsEnabled).toBe(false);

    localStorage.setItem('settings', JSON.stringify({ newCallsEnabled: true }));
    expect(mergePersistedSettings(localStorage.getItem('settings'), {}).newCallsEnabled).toBe(true);
  });

  it('enables new calls when either legacy experimental setting was on', () => {
    localStorage.setItem('settings', JSON.stringify({ livekitJsCallsEnabled: true }));
    const merged = mergePersistedSettings(localStorage.getItem('settings'), {});
    expect(merged.newCallsEnabled).toBe(true);
    expect(merged).not.toHaveProperty('livekitJsCallsEnabled');

    localStorage.setItem('settings', JSON.stringify({ livekitJsMediaTestEnabled: true }));
    const mergedMedia = mergePersistedSettings(localStorage.getItem('settings'), {});
    expect(mergedMedia.newCallsEnabled).toBe(true);
    expect(mergedMedia).not.toHaveProperty('livekitJsMediaTestEnabled');
  });

  it('keeps new calls off when both legacy settings were off or absent', () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({ livekitJsCallsEnabled: false, livekitJsMediaTestEnabled: false })
    );
    const merged = mergePersistedSettings(localStorage.getItem('settings'), {});
    expect(merged.newCallsEnabled).toBe(false);
    expect(merged).not.toHaveProperty('livekitJsCallsEnabled');
    expect(merged).not.toHaveProperty('livekitJsMediaTestEnabled');
  });

  it('does not override an explicit new calls preference with legacy keys', () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({ newCallsEnabled: false, livekitJsCallsEnabled: true })
    );
    const merged = mergePersistedSettings(localStorage.getItem('settings'), {});
    expect(merged.newCallsEnabled).toBe(false);
    expect(merged).not.toHaveProperty('livekitJsCallsEnabled');
  });

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

  it('turns the gif and sticker triggers on once for clients persisted before the migration', () => {
    expect(defaultSettings.editorGifButton).toBe(true);
    expect(defaultSettings.editorStickerButton).toBe(true);

    localStorage.setItem(
      'settings',
      JSON.stringify({ editorGifButton: false, editorStickerButton: false })
    );
    const merged = mergePersistedSettings(localStorage.getItem('settings'), {});
    expect(merged.editorGifButton).toBe(true);
    expect(merged.editorStickerButton).toBe(true);
    expect(merged.editorTriggerButtonsMigrated).toBe(true);
  });

  it('keeps the trigger buttons off once the migration has run', () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({
        editorGifButton: false,
        editorStickerButton: false,
        editorTriggerButtonsMigrated: true,
      })
    );
    const merged = mergePersistedSettings(localStorage.getItem('settings'), {});
    expect(merged.editorGifButton).toBe(false);
    expect(merged.editorStickerButton).toBe(false);
  });

  it('seeds the name color correction once for clients persisted before the migration', () => {
    localStorage.setItem('settings', JSON.stringify({ nameColorLightnessCorrection: 'off' }));
    const merged = mergePersistedSettings(localStorage.getItem('settings'), {});
    expect(merged.nameColorLightnessCorrection).toBe('strong');
    expect(merged.nameColorLightnessCorrectionMigrated).toBe(true);
  });

  it('keeps the name color correction once the migration has run', () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({
        nameColorLightnessCorrection: 'off',
        nameColorLightnessCorrectionMigrated: true,
      })
    );
    const merged = mergePersistedSettings(localStorage.getItem('settings'), {});
    expect(merged.nameColorLightnessCorrection).toBe('off');
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

  it.each([
    [{ usePushNotifications: true }, true, null],
    [{ usePushNotifications: true, useUnifiedPush: true }, true, 'unifiedpush'],
    [{ usePushNotifications: false, useUnifiedPush: false }, false, null],
    [
      {
        usePushNotifications: true,
        backgroundPushEnabled: false,
        backgroundPushProvider: null,
      },
      false,
      null,
    ],
  ] as const)(
    'migrates legacy push settings without overwriting new transport state',
    (persisted, enabled, provider) => {
      const merged = mergePersistedSettings(JSON.stringify(persisted), {});
      expect(merged.backgroundPushEnabled).toBe(enabled);
      expect(merged.backgroundPushProvider).toBe(provider);
    }
  );
});

describe('sanitizeSettingsDefaults', () => {
  it('keeps known keys with valid types', () => {
    expect(sanitizeSettingsDefaults({ twitterEmoji: false })).toEqual({
      twitterEmoji: false,
    });
  });

  it('accepts the new calls setting', () => {
    expect(sanitizeSettingsDefaults({ newCallsEnabled: true })).toEqual({
      newCallsEnabled: true,
    });
    expect(sanitizeSettingsDefaults({ newCallsEnabled: 'yes' })).toEqual({});
  });

  it('drops the legacy LiveKit JS experimental settings', () => {
    expect(
      sanitizeSettingsDefaults({ livekitJsCallsEnabled: true, livekitJsMediaTestEnabled: true })
    ).toEqual({});
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
