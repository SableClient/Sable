import { afterEach, describe, expect, it } from 'vitest';
import {
  getAppPathFromWindowHref,
  getSettingsPath,
  getToRoomEventPath,
  withAdditionalSearchParams,
} from './pathUtils';

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
    expect(
      getToRoomEventPath('@alice:example.com', '!room:example.com', '$event123', {
        jumpMode: 'notification_live',
      })
    ).toBe('/to/%40alice%3Aexample.com/!room%3Aexample.com/%24event123?jumpMode=notification_live');
  });

  it('omits the event segment when no event id is provided', () => {
    expect(getToRoomEventPath('@alice:example.com', '!room:example.com')).toBe(
      '/to/%40alice%3Aexample.com/!room%3Aexample.com'
    );
  });

  it('preserves join-call intent as a query parameter', () => {
    expect(
      getToRoomEventPath('@alice:example.com', '!room:example.com', '$event123', {
        joinCall: true,
      })
    ).toBe('/to/%40alice%3Aexample.com/!room%3Aexample.com/%24event123?joinCall=true');
  });

  it('preserves both join-call and notification click restore state', () => {
    expect(
      getToRoomEventPath('@alice:example.com', '!room:example.com', '$event123', {
        joinCall: true,
        swClickId: 'notification-click-123',
        jumpMode: 'notification_live',
      })
    ).toBe(
      '/to/%40alice%3Aexample.com/!room%3Aexample.com/%24event123?joinCall=true&swClickId=notification-click-123&jumpMode=notification_live'
    );
  });
});

describe('withAdditionalSearchParams', () => {
  it('adds search params onto a path without clobbering existing ones', () => {
    expect(withAdditionalSearchParams('/room/abc?foo=bar', { joinCall: 'true' })).toBe(
      '/room/abc?foo=bar&joinCall=true'
    );
  });
});

describe('getAppPathFromWindowHref', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('extracts the current app path for hash-router deployments', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://app.example/#/app/to/%40alice%3Aexample/!room%3Aexample'),
    });

    expect(getAppPathFromWindowHref({ enabled: true, basename: '/app' })).toBe(
      '/to/%40alice%3Aexample/!room%3Aexample'
    );
  });
});
