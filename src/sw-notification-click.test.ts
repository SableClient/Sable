import { describe, expect, it } from 'vitest';
import {
  buildNotificationClickTargetUrl,
  didWindowClientActivationSucceed,
  rankNotificationClickClients,
} from './sw-notification-click';

describe('buildNotificationClickTargetUrl', () => {
  const scope = 'https://charm.example/app/';

  it('builds room notification deep links with joinCall preserved', () => {
    expect(
      buildNotificationClickTargetUrl(scope, {
        user_id: '@alice:example.org',
        room_id: '!room:example.org',
        event_id: '$event',
        isCall: true,
      })
    ).toBe(
      'https://charm.example/app/to/%40alice%3Aexample.org/!room%3Aexample.org/%24event?joinCall=true'
    );
  });

  it('builds invite deep links for the matching account', () => {
    expect(
      buildNotificationClickTargetUrl(scope, {
        user_id: '@alice:example.org',
        content: { membership: 'invite' },
      })
    ).toBe('https://charm.example/app/inbox/invites/?uid=%40alice%3Aexample.org');
  });

  it('falls back to inbox notifications when the payload lacks a room target', () => {
    expect(buildNotificationClickTargetUrl(scope, {})).toBe(
      'https://charm.example/app/inbox/notifications/'
    );
  });
});

describe('rankNotificationClickClients', () => {
  const scope = 'https://charm.example/app/';

  it('prefers focused visible app clients over hidden login pages', () => {
    const ranked = rankNotificationClickClients(
      [
        {
          url: 'https://charm.example/app/login',
          visibilityState: 'hidden',
          focused: false,
        },
        {
          url: 'https://charm.example/app/home',
          visibilityState: 'visible',
          focused: true,
        },
      ],
      scope
    );

    expect(ranked[0]?.url).toBe('https://charm.example/app/home');
  });

  it('keeps scoped clients ahead of about:blank windows', () => {
    const ranked = rankNotificationClickClients(
      [
        {
          url: 'about:blank',
          visibilityState: 'visible',
          focused: true,
        },
        {
          url: 'https://charm.example/app/direct',
          visibilityState: 'hidden',
          focused: false,
        },
      ],
      scope
    );

    expect(ranked[0]?.url).toBe('https://charm.example/app/direct');
  });
});

describe('didWindowClientActivationSucceed', () => {
  it('treats null activation results as failure', () => {
    expect(didWindowClientActivationSucceed(null)).toBe(false);
  });

  it('treats a window client object as success', () => {
    expect(didWindowClientActivationSucceed({} as WindowClient)).toBe(true);
  });
});
