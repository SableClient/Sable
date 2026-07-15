import { describe, expect, it } from 'vitest';
import { resolveCallNotificationCopy } from './pushCallNotificationCopy';

describe('resolveCallNotificationCopy', () => {
  it('uses generic room-call copy when previews are hidden', () => {
    expect(
      resolveCallNotificationCopy({
        notificationType: 'notification',
        intentKind: 'audio',
        showPreviewDetails: false,
      })
    ).toEqual({
      title: 'Room call started',
      body: 'Open Sable to join.',
    });
  });

  it('uses sender and room details for ring notifications', () => {
    expect(
      resolveCallNotificationCopy({
        notificationType: 'ring',
        intentKind: 'video',
        senderDisplayName: 'Alice',
        roomName: 'General',
        showPreviewDetails: true,
      })
    ).toEqual({
      title: 'Incoming video call',
      body: 'Alice is calling you in General',
    });
  });
});
