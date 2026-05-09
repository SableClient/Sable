import { describe, expect, it } from 'vitest';
import {
  buildSettingsLink,
  getSettingsLinkLabel,
  normalizeSettingsFocusId,
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
    expect(
      parseSettingsLink(
        'https://app.example',
        `https://app.example/settings/general?focus=composer-formatting-toolbar&${SETTINGS_LINK_ACTION_PARAM}=${SETTINGS_LINK_ACTION_SETTINGS}`
      )
    ).toEqual({ section: 'general', focus: 'composer-formatting-toolbar' });
    expect(
      parseSettingsLink(
        'https://app.example',
        'https://app.example/settings/account?focus=display-name&moe.sable.client.action=settings&hello=world'
      )
    ).toEqual({ section: 'account', focus: 'display-name' });

    expect(parseSettingsLink('https://app.example', 'https://app.example/home/')).toBeUndefined();
  });

  it('accepts the incoming inline image height focus ids', () => {
    expect(
      parseSettingsLink(
        'https://app.example',
        'https://app.example/settings/appearance?focus=incoming-inline-images-default-height'
      )
    ).toEqual({
      section: 'appearance',
      focus: 'incoming-inline-images-default-height',
    });
    expect(
      parseSettingsLink(
        'https://app.example',
        'https://app.example/settings/appearance?focus=incoming-inline-images-max-height'
      )
    ).toEqual({
      section: 'appearance',
      focus: 'incoming-inline-images-max-height',
    });
    expect(
      parseSettingsLink(
        'https://app.example',
        'https://app.example/settings/appearance?focus=link-preview-image-max-height'
      )
    ).toEqual({
      section: 'appearance',
      focus: 'link-preview-image-max-height',
    });
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
      parseSettingsLink(
        'https://app.example',
        `https://other.example/settings/account?focus=status&${SETTINGS_LINK_ACTION_PARAM}=${SETTINGS_LINK_ACTION_SETTINGS}&hello=world`
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

  it('rejects settings links with malformed focus ids', () => {
    expect(
      parseSettingsLink(
        'https://app.example',
        'https://app.example/settings/account?focus=display-name%22%3ESettings'
      )
    ).toBeUndefined();
    expect(
      parseSettingsLink(
        'https://app.example',
        `https://other.example/settings/account?focus=display-name%22%3ESettings&${SETTINGS_LINK_ACTION_PARAM}=${SETTINGS_LINK_ACTION_SETTINGS}`
      )
    ).toBeUndefined();
  });

  it('rejects settings links with unknown focus ids', () => {
    expect(
      parseSettingsLink(
        'https://app.example',
        'https://app.example/settings/account?focus=display-name2'
      )
    ).toBeUndefined();
    expect(
      parseSettingsLink(
        'https://app.example',
        `https://other.example/settings/account?focus=display-name2&${SETTINGS_LINK_ACTION_PARAM}=${SETTINGS_LINK_ACTION_SETTINGS}`
      )
    ).toBeUndefined();
  });

  it('rejects settings links with malformed query params', () => {
    expect(
      parseSettingsLink(
        'https://app.example',
        'https://app.example/settings/account?focus=status&moe.sable.client.action=settings%22%3ESettings'
      )
    ).toBeUndefined();
    expect(
      parseSettingsLink(
        'https://app.example',
        'https://app.example/settings/account?focus=status&hello=world%22%3ESettings'
      )
    ).toBeUndefined();
    expect(
      parseSettingsLink(
        'https://app.example',
        `https://other.example/settings/account?focus=status&hello=world%22%3ESettings&${SETTINGS_LINK_ACTION_PARAM}=${SETTINGS_LINK_ACTION_SETTINGS}`
      )
    ).toBeUndefined();
  });

  it('normalizes focus id parts', () => {
    expect(toSettingsFocusIdPart('@alice:example.org')).toBe('alice-example-org');
    expect(toSettingsFocusIdPart('DEVICE-123')).toBe('device-123');
  });

  it('accepts only valid settings focus ids', () => {
    expect(normalizeSettingsFocusId('display-name')).toBe('display-name');
    expect(normalizeSettingsFocusId('display-name">Settings')).toBeUndefined();
    expect(normalizeSettingsFocusId('')).toBeUndefined();
  });

  it('builds human-readable settings link labels', () => {
    expect(getSettingsLinkLabel('appearance', 'message-link-preview')).toBe(
      'Settings > Appearance > Message Link Preview'
    );
    expect(getSettingsLinkLabel('account')).toBe('Settings > Account');
  });
});
