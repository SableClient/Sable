import { describe, expect, it } from 'vitest';
import {
  buildDeclarativeNotificationOptions,
  buildInAppFallbackPayload,
  isDeclarativeWebPushPayload,
  isMinimalPushPayload,
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
        title: 'Sable',
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
    expect(title).toBe('Sable');
    expect(options.body).toBe('New message');
    expect(options.data).toMatchObject({
      navigate: '/to/%40alice%3Aexample/%21room%3Aexample',
      room_id: '!room:example',
      event_id: '$event',
      user_id: '@alice:example',
    });
  });

  it('builds a generic fallback banner payload from Matrix push data', () => {
    expect(
      buildInAppFallbackPayload({
        room_id: '!room:example',
        event_id: '$event',
        user_id: '@alice:example',
        sender_display_name: 'Alice',
        room_name: 'Sable',
      })
    ).toEqual({
      roomId: '!room:example',
      eventId: '$event',
      userId: '@alice:example',
      title: 'Sable',
      body: 'Alice sent a message.',
      roomName: 'Sable',
      senderName: 'Alice',
    });
  });

  it('builds a fallback banner payload from declarative push data', () => {
    expect(
      buildInAppFallbackPayload({
        web_push: 8030,
        notification: {
          title: 'Declarative title',
          body: 'Declarative body',
          navigate: '/inbox/notifications/',
        },
      })
    ).toEqual({
      roomId: undefined,
      eventId: undefined,
      userId: undefined,
      title: 'Declarative title',
      body: 'Declarative body',
      navigate: '/inbox/notifications/',
    });
  });
});
