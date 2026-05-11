import { describe, expect, it } from 'vitest';
import { getSettingsPath } from './pathUtils';

describe('getSettingsPath', () => {
  it('returns the settings root path', () => {
    expect(getSettingsPath()).toBe('/settings');
  });

  it('returns a section path with an optional focus query', () => {
    expect(getSettingsPath('devices')).toBe('/settings/devices');
    expect(getSettingsPath('appearance', 'message-link-preview')).toBe(
      '/settings/appearance?focus=message-link-preview'
    );
  });
});
