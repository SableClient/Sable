import { describe, expect, it } from 'vitest';
import {
  buildDeclarativeNotificationOptions,
  getEncryptedMinimalPushFocusDecision,
  isDeclarativeWebPushPayload,
  isMinimalPushPayload,
  shouldSuppressOsPushForForegroundState,
} from './pushRouting';

describe('service worker push routing helpers', () => {
  it('detects event_id_only minimal push payloads', () => {
    expect(isMinimalPushPayload({ room_id: '!room:example', event_id: '$event' })).toBe(true);
    expect(
      isMinimalPushPayload({ room_id: '!room:example', event_id: '$event', type: 'm.room.message' })
    ).toBe(false);
  });

  it('detects and maps declarative web push payloads', () => {
    const payload = {
      web_push: 8030,
      notification: {
        title: 'Charm',
        body: 'New message',
        navigate: '/to/%40alice%3Aexample/%21room%3Aexample',
        app_badge: 4,
        data: {
          room_id: '!room:example',
          event_id: '$event',
          user_id: '@alice:example',
        },
      },
    } as const;

    expect(isDeclarativeWebPushPayload(payload)).toBe(true);

    const { title, options } = buildDeclarativeNotificationOptions(payload);
    expect(title).toBe('Charm');
    expect(options.body).toBe('New message');
    expect(options.data).toMatchObject({
      navigate: '/to/%40alice%3Aexample/%21room%3Aexample',
      room_id: '!room:example',
      event_id: '$event',
      user_id: '@alice:example',
    });
  });

  it('ignores focused clients for encrypted minimal push suppression', () => {
    expect(getEncryptedMinimalPushFocusDecision(0)).toBe('no_focused_client');
    expect(getEncryptedMinimalPushFocusDecision(1)).toBe('ignore_stale_focus');
  });

  it('suppresses OS push only when a live client confirms visible foreground state', () => {
    expect(shouldSuppressOsPushForForegroundState({ visibilityState: 'visible' })).toBe(true);
    expect(shouldSuppressOsPushForForegroundState({ visibilityState: 'hidden' })).toBe(false);
    expect(shouldSuppressOsPushForForegroundState(undefined)).toBe(false);
  });
});
