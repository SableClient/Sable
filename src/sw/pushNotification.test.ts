import { describe, expect, it, vi } from 'vitest';
import { createPushNotifications } from './pushNotification';

describe('createPushNotifications', () => {
  it('uses decrypted effective types for encrypted push previews', async () => {
    const showNotification = vi
      .fn<(title: string, options?: NotificationOptions) => Promise<void>>()
      .mockResolvedValue(undefined);
    const handle = createPushNotifications(
      {
        registration: { showNotification },
      } as unknown as ServiceWorkerGlobalScope,
      () => ({
        showMessageContent: true,
        showEncryptedMessageContent: true,
      }),
      vi.fn().mockResolvedValue(undefined)
    );

    await handle.handlePushNotificationPushData({
      type: 'm.room.encrypted',
      effectiveType: 'm.reaction',
      content: { 'm.relates_to': { key: '👍' } },
      sender_display_name: 'Alice',
      room_name: 'General',
      event_id: '$event',
      room_id: '!room:example.org',
      user_id: '@me:example.org',
    });

    expect(showNotification).toHaveBeenCalledWith(
      'Alice in General • me',
      expect.objectContaining({
        body: 'Alice: Reacted with 👍',
      })
    );
  });
});
