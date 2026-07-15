import { describe, expect, it } from 'vitest';
import { resolveIncomingCallFromNotificationData } from './callNotificationBridge';
import {
  parseIncomingRtcNotification,
  REFERENCE_REL_TYPE,
  RTC_NOTIFICATION_EVENT_TYPE,
  type RtcNotificationEventLike,
} from './rtcNotificationParser';

const NOW = 1_700_000_000_000;
const MY_USER_ID = '@self:example.org';

const createEvent = (
  overrides: Partial<RtcNotificationEventLike> = {}
): RtcNotificationEventLike => ({
  type: RTC_NOTIFICATION_EVENT_TYPE,
  sender: '@caller:example.org',
  roomId: '!room:example.org',
  eventId: '$notif',
  originServerTs: NOW - 1_000,
  isLiveEvent: true,
  isEncrypted: false,
  relation: {
    rel_type: REFERENCE_REL_TYPE,
    event_id: '$call',
  },
  content: {
    sender_ts: NOW - 500,
    lifetime: 60_000,
    notification_type: 'ring',
    'm.call.intent': 'start_call_dm',
    'm.mentions': {
      user_ids: [MY_USER_ID],
    },
  },
  ...overrides,
});

describe('call intent cross-path consistency', () => {
  it('parser and notification bridge agree for the same RTC fields', async () => {
    const parsed = await parseIncomingRtcNotification(createEvent(), {
      myUserId: MY_USER_ID,
      now: NOW,
    });
    expect(parsed).toBeDefined();

    const fromBridge = resolveIncomingCallFromNotificationData(
      {
        isCall: true,
        roomId: parsed!.roomId,
        eventId: parsed!.notificationEventId,
        callNotificationType: parsed!.notificationType,
        callIntentRaw: parsed!.intentRaw,
        callRefEventId: parsed!.refEventId,
        callSenderId: parsed!.senderId,
        callSenderTs: parsed!.senderTs,
        callExpiresAt: parsed!.expiresAt,
      },
      true,
      NOW
    );

    expect(fromBridge).toMatchObject({
      notificationType: parsed!.notificationType,
      intentKind: parsed!.intentKind,
      intentRaw: parsed!.intentRaw,
      senderTs: parsed!.senderTs,
      expiresAt: parsed!.expiresAt,
    });
  });

  it('parser and bridge both map start_call_dm to video', async () => {
    const parsed = await parseIncomingRtcNotification(
      createEvent({
        content: {
          sender_ts: NOW - 500,
          lifetime: 60_000,
          notification_type: 'ring',
          'm.call.intent': 'start_call_dm',
          'm.mentions': { user_ids: [MY_USER_ID] },
        },
      }),
      { myUserId: MY_USER_ID, now: NOW }
    );

    const fromBridge = resolveIncomingCallFromNotificationData(
      {
        isCall: true,
        roomId: '!room:example.org',
        eventId: '$notif',
        callNotificationType: 'ring',
        callIntentRaw: 'start_call_dm',
        callSenderTs: NOW - 500,
        callExpiresAt: NOW + 59_500,
      },
      true,
      NOW
    );

    expect(parsed?.intentKind).toBe('video');
    expect(fromBridge?.intentKind).toBe('video');
  });
});
