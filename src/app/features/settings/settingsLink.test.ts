import { describe, expect, it } from 'vitest';
import {
  buildSettingsLink,
  parseSettingsLink,
  SETTINGS_LINK_ACTION_PARAM,
  SETTINGS_LINK_ACTION_SETTINGS,
  toSettingsFocusIdPart,
} from './settingsLink';

describe('settingsLink', () => {
  it('builds settings links with the explicit action marker for plain and hash-router base urls', () => {
    expect(buildSettingsLink('https://app.example', 'appearance', 'message-link-preview')).toBe(
      `https://app.example/settings/appearance?focus=message-link-preview&${SETTINGS_LINK_ACTION_PARAM}=${SETTINGS_LINK_ACTION_SETTINGS}`
    );
    expect(
      buildSettingsLink('https://app.example/#/app', 'appearance', 'message-link-preview')
    ).toBe(
      `https://app.example/#/app/settings/appearance?focus=message-link-preview&${SETTINGS_LINK_ACTION_PARAM}=${SETTINGS_LINK_ACTION_SETTINGS}`
    );
  });

  it('parses plain same-base settings links for compatibility', () => {
    expect(
      parseSettingsLink(
        'https://app.example',
        'https://app.example/settings/appearance?focus=message-link-preview'
      )
    ).toEqual({ section: 'appearance', focus: 'message-link-preview' });
    expect(
      parseSettingsLink(
        'https://app.example',
        'https://app.example/settings/appearance/?focus=message-link-preview'
      )
    ).toEqual({ section: 'appearance', focus: 'message-link-preview' });

    expect(parseSettingsLink('https://app.example', 'https://app.example/home/')).toBeUndefined();
  });

  it('parses cross-base settings links only when the explicit action marker is present', () => {
    expect(
      parseSettingsLink(
        'https://app.example',
        `https://other.example/settings/appearance?focus=message-link-preview&${SETTINGS_LINK_ACTION_PARAM}=${SETTINGS_LINK_ACTION_SETTINGS}`
      )
    ).toEqual({ section: 'appearance', focus: 'message-link-preview' });

    expect(
      parseSettingsLink(
        'https://app.example/#/app',
        `https://other.example/#/client/settings/account?focus=status&${SETTINGS_LINK_ACTION_PARAM}=${SETTINGS_LINK_ACTION_SETTINGS}`
      )
    ).toEqual({ section: 'account', focus: 'status' });

    expect(
      parseSettingsLink('https://app.example', 'https://other.example/settings/appearance')
    ).toBeUndefined();
    expect(
      parseSettingsLink(
        'https://app.example',
        `https://other.example/settings/appearance?${SETTINGS_LINK_ACTION_PARAM}=not-settings`
      )
    ).toBeUndefined();
    expect(
      parseSettingsLink(
        'https://app.example',
        `https://other.example/redirect?next=/settings/appearance?focus=status&${SETTINGS_LINK_ACTION_PARAM}=${SETTINGS_LINK_ACTION_SETTINGS}`
      )
    ).toBeUndefined();
  });

  it('rejects a same-origin hash settings link that does not match the configured app base', () => {
    expect(
      parseSettingsLink(
        'https://app.example/#/app',
        'https://app.example/#/wrong/settings/appearance?focus=message-link-preview'
      )
    ).toBeUndefined();
  });

  it('rejects a same-origin hash settings link that only shares the configured base as a prefix', () => {
    expect(
      parseSettingsLink(
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
