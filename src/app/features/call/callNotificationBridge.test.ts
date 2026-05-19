import { describe, expect, it } from 'vitest';
import {
  resolveIncomingCallFromNotificationData,
  resolveIncomingCallFromSearchParams,
} from './callNotificationBridge';

describe('callNotificationBridge', () => {
  it('hydrates incoming call from notification click payload', () => {
    const now = 1_000_000;
    const incoming = resolveIncomingCallFromNotificationData(
      {
        isCall: true,
        roomId: '!room:test',
        eventId: '$notif',
        callNotificationType: 'ring',
        callIntentKind: 'video',
        callRefEventId: '$ref',
        callSenderId: '@alice:test',
        callSenderTs: now - 1_000,
        callExpiresAt: now + 10_000,
      },
      true,
      now
    );

    expect(incoming).toMatchObject({
      roomId: '!room:test',
      notificationEventId: '$notif',
      refEventId: '$ref',
      senderId: '@alice:test',
      notificationType: 'ring',
      intentKind: 'video',
      isDirect: true,
    });
  });

  it('drops expired call notifications', () => {
    const now = 1_000_000;
    const incoming = resolveIncomingCallFromNotificationData(
      {
        isCall: true,
        roomId: '!room:test',
        eventId: '$notif',
        callNotificationType: 'ring',
        callExpiresAt: now - 1,
      },
      false,
      now
    );

    expect(incoming).toBeUndefined();
  });

  it('hydrates incoming call from legacy joinCall deep-link params', () => {
    const now = 1_000_000;
    const params = new URLSearchParams({
      joinCall: 'true',
      callType: 'ring',
    });

    const incoming = resolveIncomingCallFromSearchParams(
      params,
      '!room:test',
      '$notif',
      true,
      now
    );

    expect(incoming).toMatchObject({
      roomId: '!room:test',
      notificationEventId: '$notif',
      notificationType: 'ring',
    });
  });

  it('hydrates incoming call from /to/ deep-link search params', () => {
    const now = 1_000_000;
    const params = new URLSearchParams({
      call: '1',
      callType: 'notification',
      callIntentKind: 'audio',
      callRefEventId: '$ref',
      callSenderId: '@bob:test',
      callSenderTs: String(now - 500),
      callExpiresAt: String(now + 5_000),
    });

    const incoming = resolveIncomingCallFromSearchParams(
      params,
      '!room:test',
      '$notif',
      false,
      now
    );

    expect(incoming).toMatchObject({
      roomId: '!room:test',
      notificationEventId: '$notif',
      refEventId: '$ref',
      senderId: '@bob:test',
      notificationType: 'notification',
      intentKind: 'audio',
      isDirect: false,
    });
  });
});
