import { describe, expect, it, vi } from 'vitest';
import { EventType } from 'matrix-js-sdk/lib/@types/event';
import { createPushNotifications } from './pushNotification';

describe('createPushNotifications', () => {
  it('keeps the top-level event routing fields when push data contains stale copies', async () => {
    const showNotification = vi
      .fn<(title: string, options: NotificationOptions) => Promise<void>>()
      .mockResolvedValue(undefined);
    const self = {
      registration: { showNotification },
    } as unknown as ServiceWorkerGlobalScope;
    const notifications = createPushNotifications(self, () => ({
      showMessageContent: true,
      showEncryptedMessageContent: true,
    }));

    await notifications.handlePushNotificationPushData({
      type: EventType.RoomMessage,
      room_id: '!real:example.org',
      event_id: '$real',
      user_id: '@real:example.org',
      data: {
        room_id: '!stale:example.org',
        event_id: '$stale',
        user_id: '@stale:example.org',
      },
    });

    const options = showNotification.mock.calls[0]![1];
    expect(options.data).toMatchObject({
      room_id: '!real:example.org',
      event_id: '$real',
      user_id: '@real:example.org',
    });
  });
});
