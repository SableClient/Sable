import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS_LINK_BASE_URL,
  buildSettingsPermalink,
  getEffectiveSettingsLinkBaseUrl,
  parseSettingsPermalink,
  toSettingsFocusIdPart,
} from './settingsLink';

describe('settingsLink', () => {
  it('builds settings permalinks for plain and hash-router base urls', () => {
    expect(
      buildSettingsPermalink('https://app.example', 'appearance', 'message-link-preview')
    ).toBe('https://app.example/settings/appearance?focus=message-link-preview');
    expect(
      buildSettingsPermalink('https://app.example/#/app', 'appearance', 'message-link-preview')
    ).toBe('https://app.example/#/app/settings/appearance?focus=message-link-preview');
  });

  it('resolves the settings link base URL from built-in default, config, and override', () => {
    expect(getEffectiveSettingsLinkBaseUrl({}, undefined)).toBe(DEFAULT_SETTINGS_LINK_BASE_URL);
    expect(getEffectiveSettingsLinkBaseUrl({}, true as never)).toBe(DEFAULT_SETTINGS_LINK_BASE_URL);
    expect(
      getEffectiveSettingsLinkBaseUrl({ settingsLinkBaseUrl: 'https://config.example/' })
    ).toBe('https://config.example');
    expect(
      getEffectiveSettingsLinkBaseUrl(
        { settingsLinkBaseUrl: 'https://config.example' },
        'https://override.example/'
      )
    ).toBe('https://override.example');
  });

  it('parses settings permalinks from the same app origin only', () => {
    expect(
      parseSettingsPermalink(
        'https://app.example',
        'https://app.example/settings/appearance?focus=message-link-preview'
      )
    ).toEqual({ section: 'appearance', focus: 'message-link-preview' });
    expect(
      parseSettingsPermalink(
        'https://app.example',
        'https://app.example/settings/appearance/?focus=message-link-preview'
      )
    ).toEqual({ section: 'appearance', focus: 'message-link-preview' });

    expect(
      parseSettingsPermalink('https://app.example', 'https://other.example/settings/appearance')
    ).toBeUndefined();
    expect(
      parseSettingsPermalink('https://app.example', 'https://app.example/home/')
    ).toBeUndefined();
  });

  it('rejects a same-origin hash permalink that does not match the configured app base', () => {
    expect(
      parseSettingsPermalink(
        'https://app.example/#/app',
        'https://app.example/#/wrong/settings/appearance?focus=message-link-preview'
      )
    ).toBeUndefined();
  });

  it('rejects a same-origin hash permalink that only shares the configured base as a prefix', () => {
    expect(
      parseSettingsPermalink(
        'https://app.example/#/app',
        'https://app.example/#/ap/settings/appearance?focus=message-link-preview'
      )
    ).toBeUndefined();
  });

  it('normalizes focus id parts', () => {
    expect(toSettingsFocusIdPart('@alice:example.org')).toBe('alice-example-org');
    expect(toSettingsFocusIdPart('DEVICE-123')).toBe('device-123');
  });
});
