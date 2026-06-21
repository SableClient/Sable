import { describe, expect, it } from 'vitest';
import { resolveNotificationPreviewText } from './notificationStyle';

describe('resolveNotificationPreviewText', () => {
  it('uses shared preview placeholders for link-only messages', () => {
    expect(
      resolveNotificationPreviewText({
        content: { msgtype: 'm.text', body: 'https://example.com' },
        eventType: 'm.room.message',
        isEncryptedRoom: false,
        showMessageContent: true,
        showEncryptedMessageContent: true,
      })
    ).toBe('🔗 Link');
  });

  it('keeps reaction wording notification-specific', () => {
    expect(
      resolveNotificationPreviewText({
        content: { 'm.relates_to': { key: '👍' } },
        eventType: 'm.reaction',
        isEncryptedRoom: false,
        showMessageContent: true,
        showEncryptedMessageContent: true,
      })
    ).toBe('Reacted with 👍');
  });

  it('still respects privacy gating for encrypted rooms', () => {
    expect(
      resolveNotificationPreviewText({
        content: { msgtype: 'm.text', body: 'secret' },
        eventType: 'm.room.encrypted',
        isEncryptedRoom: true,
        showMessageContent: true,
        showEncryptedMessageContent: false,
      })
    ).toBe('Encrypted message');
  });

  it('preserves body text for custom room-message msgtypes', () => {
    expect(
      resolveNotificationPreviewText({
        content: { msgtype: 'com.example.cute', body: 'Custom event body' },
        eventType: 'm.room.message',
        isEncryptedRoom: false,
        showMessageContent: true,
        showEncryptedMessageContent: true,
      })
    ).toBe('Custom event body');
  });

  it('uses decrypted effective type for encrypted room-message notifications', () => {
    expect(
      resolveNotificationPreviewText({
        content: { msgtype: 'm.text', body: 'Decrypted body' },
        eventType: 'm.room.encrypted',
        effectiveType: 'm.room.message',
        isEncryptedRoom: false,
        showMessageContent: true,
        showEncryptedMessageContent: true,
      })
    ).toBe('Decrypted body');
  });

  it('uses decrypted body when encrypted notifications only have decrypted content', () => {
    expect(
      resolveNotificationPreviewText({
        content: { msgtype: 'm.text', body: 'Decrypted body' },
        eventType: 'm.room.encrypted',
        isEncryptedRoom: false,
        showMessageContent: true,
        showEncryptedMessageContent: true,
      })
    ).toBe('Decrypted body');
  });

  it('uses the decrypted effective type for encrypted reaction notifications', () => {
    expect(
      resolveNotificationPreviewText({
        content: { 'm.relates_to': { key: '👍' } },
        eventType: 'm.room.encrypted',
        effectiveType: 'm.reaction',
        isEncryptedRoom: true,
        showMessageContent: true,
        showEncryptedMessageContent: true,
      })
    ).toBe('Reacted with 👍');
  });

  it('keeps encrypted reaction previews gated when encrypted content is hidden', () => {
    expect(
      resolveNotificationPreviewText({
        content: { 'm.relates_to': { key: '👍' } },
        eventType: 'm.room.encrypted',
        effectiveType: 'm.reaction',
        isEncryptedRoom: true,
        showMessageContent: true,
        showEncryptedMessageContent: false,
      })
    ).toBe('Encrypted message');
  });
});
