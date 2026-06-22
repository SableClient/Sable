import { describe, it, expect, beforeEach } from 'vitest';
import {
  defaultSettings,
  getSettings,
  mergePersistedSettings,
  primeRuntimeSettingsDefaults,
  sanitizeSettingsDefaults,
  resetRuntimeSettingsDefaults,
  setSettings,
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

  it('restores explicitly cleared theme values after a reload', () => {
    setSettings({
      ...defaultSettings,
      themeId: undefined,
      lightThemeId: undefined,
      darkThemeId: undefined,
      themeRemoteManualFullUrl: undefined,
      themeRemoteLightFullUrl: undefined,
      themeRemoteDarkFullUrl: undefined,
      themeRemoteManualKind: undefined,
      themeRemoteLightKind: undefined,
      themeRemoteDarkKind: undefined,
      arboriumLightTheme: undefined,
      arboriumDarkTheme: undefined,
    });

    const merged = mergePersistedSettings(localStorage.getItem('settings'), {});

    expect(merged.themeId).toBeUndefined();
    expect(merged.lightThemeId).toBeUndefined();
    expect(merged.darkThemeId).toBeUndefined();
    expect(merged.arboriumLightTheme).toBeUndefined();
    expect(merged.arboriumDarkTheme).toBeUndefined();
  });

  it('keeps deployer theme defaults when untouched optional theme fields stay undefined', () => {
    primeRuntimeSettingsDefaults({ themeId: 'deployer-theme' });

    setSettings({
      ...getSettings(),
      twitterEmoji: false,
    });

    const merged = mergePersistedSettings(localStorage.getItem('settings'), {});

    expect(merged.themeId).toBe('deployer-theme');
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

  it('accepts the new notification and composer settings', () => {
    expect(
      sanitizeSettingsDefaults({
        notificationDeviceScope: 'active_client_only',
        emojiAutoExpand: true,
        structuredMarkdownAssist: false,
      })
    ).toEqual({
      notificationDeviceScope: 'active_client_only',
      emojiAutoExpand: true,
      structuredMarkdownAssist: false,
    });
    expect(sanitizeSettingsDefaults({ notificationDeviceScope: 'invalid-scope' })).toEqual({});
  });
});

describe('primeRuntimeSettingsDefaults', () => {
  it('updates getSettings before atoms are bootstrapped', () => {
    primeRuntimeSettingsDefaults({ defaultLandingScreen: 'direct' });

    expect(getSettings().defaultLandingScreen).toBe('direct');
  });
});
