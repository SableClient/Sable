import { describe, expect, it } from 'vitest';
import { getSettingsPath, getToRoomEventPath } from './pathUtils';

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

describe('getToRoomEventPath', () => {
  it('builds the canonical notification deep-link path', () => {
    expect(getToRoomEventPath('@alice:example.com', '!room:example.com', '$event123')).toBe(
      '/to/%40alice%3Aexample.com/!room%3Aexample.com/%24event123'
    );
  });

  it('omits the event segment when no event id is provided', () => {
    expect(getToRoomEventPath('@alice:example.com', '!room:example.com')).toBe(
      '/to/%40alice%3Aexample.com/!room%3Aexample.com'
    );
  });
});
