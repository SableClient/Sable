import { describe, expect, it } from 'vitest';
import {
  parseRtcDecline,
  parseIncomingRtcNotification,
  RTC_DECLINE_EVENT_TYPE,
  REFERENCE_REL_TYPE,
  RTC_NOTIFICATION_EVENT_TYPE,
  type RtcNotificationEventLike,
} from './rtcNotificationParser';

const NOW = 1_700_000_000_000;

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
    'm.call.intent': 'start_call_dm_voice',
    'm.mentions': {
      user_ids: ['@self:example.org'],
    },
  },
  ...overrides,
});

describe('parseIncomingRtcNotification', () => {
  it('parses a plain RTC notification event', async () => {
    const parsed = await parseIncomingRtcNotification(createEvent(), {
      myUserId: '@self:example.org',
      now: NOW,
    });

    expect(parsed).toMatchObject({
      roomId: '!room:example.org',
      notificationEventId: '$notif',
      refEventId: '$call',
      senderId: '@caller:example.org',
      notificationType: 'ring',
      intentKind: 'audio',
      intentRaw: 'start_call_dm_voice',
    });
  });

  it('parses encrypted notification when decryption succeeds', async () => {
    const parsed = await parseIncomingRtcNotification(
      createEvent({ isEncrypted: true, content: { ciphertext: 'x' } }),
      {
        myUserId: '@self:example.org',
        now: NOW,
        decryptContent: async () => ({
          sender_ts: NOW - 500,
          lifetime: 60_000,
          notification_type: 'notification',
          'm.call.intent': 'start_call_dm',
          'm.mentions': { room: true },
        }),
      }
    );

    expect(parsed?.notificationType).toBe('notification');
    expect(parsed?.intentKind).toBe('video');
  });

  it('ignores expired notifications', async () => {
    const parsed = await parseIncomingRtcNotification(
      createEvent({
        content: {
          sender_ts: NOW - 120_000,
          lifetime: 10_000,
          notification_type: 'ring',
          'm.mentions': { room: true },
        },
      }),
      {
        myUserId: '@self:example.org',
        now: NOW,
      }
    );

    expect(parsed).toBeUndefined();
  });

  it('ignores events without reference relation', async () => {
    const parsed = await parseIncomingRtcNotification(
      createEvent({ relation: { rel_type: 'm.thread', event_id: '$call' } }),
      {
        myUserId: '@self:example.org',
        now: NOW,
      }
    );

    expect(parsed).toBeUndefined();
  });

  it('ignores self-sent notifications', async () => {
    const parsed = await parseIncomingRtcNotification(
      createEvent({ sender: '@self:example.org' }),
      {
        myUserId: '@self:example.org',
        now: NOW,
      }
    );

    expect(parsed).toBeUndefined();
  });

  it('ignores non-mentioned notifications', async () => {
    const parsed = await parseIncomingRtcNotification(
      createEvent({
        content: {
          sender_ts: NOW - 500,
          lifetime: 60_000,
          notification_type: 'ring',
          'm.mentions': { user_ids: ['@someone-else:example.org'] },
        },
      }),
      {
        myUserId: '@self:example.org',
        now: NOW,
      }
    );

    expect(parsed).toBeUndefined();
  });

  it('preserves ring vs notification type', async () => {
    const ring = await parseIncomingRtcNotification(
      createEvent({
        content: {
          sender_ts: NOW - 500,
          lifetime: 60_000,
          notification_type: 'ring',
          'm.mentions': { room: true },
        },
      }),
      {
        myUserId: '@self:example.org',
        now: NOW,
      }
    );
    const notification = await parseIncomingRtcNotification(
      createEvent({
        content: {
          sender_ts: NOW - 500,
          lifetime: 60_000,
          notification_type: 'notification',
          'm.mentions': { room: true },
        },
      }),
      {
        myUserId: '@self:example.org',
        now: NOW,
      }
    );

    expect(ring?.notificationType).toBe('ring');
    expect(notification?.notificationType).toBe('notification');
  });

  it('maps voice and video intents', async () => {
    const audio = await parseIncomingRtcNotification(
      createEvent({
        content: {
          sender_ts: NOW - 500,
          lifetime: 60_000,
          notification_type: 'ring',
          'm.call.intent': 'join_existing_dm_voice',
          'm.mentions': { room: true },
        },
      }),
      {
        myUserId: '@self:example.org',
        now: NOW,
      }
    );

    const video = await parseIncomingRtcNotification(
      createEvent({
        content: {
          sender_ts: NOW - 500,
          lifetime: 60_000,
          notification_type: 'ring',
          'm.call.intent': 'start_call_dm',
          'm.mentions': { room: true },
        },
      }),
      {
        myUserId: '@self:example.org',
        now: NOW,
      }
    );

    expect(audio?.intentKind).toBe('audio');
    expect(video?.intentKind).toBe('video');
  });
});

describe('parseRtcDecline', () => {
  it('parses a live remote decline referencing a notification event', () => {
    const parsed = parseRtcDecline(
      createEvent({
        type: RTC_DECLINE_EVENT_TYPE,
        eventId: '$decline',
        content: {},
        relation: {
          rel_type: REFERENCE_REL_TYPE,
          event_id: '$notif',
        },
      }),
      { myUserId: '@self:example.org' }
    );

    expect(parsed).toEqual({
      roomId: '!room:example.org',
      declineEventId: '$decline',
      notificationEventId: '$notif',
      senderId: '@caller:example.org',
    });
  });

  it('ignores self-sent declines and declines without reference relations', () => {
    expect(
      parseRtcDecline(
        createEvent({
          type: RTC_DECLINE_EVENT_TYPE,
          sender: '@self:example.org',
        }),
        { myUserId: '@self:example.org' }
      )
    ).toBeUndefined();

    expect(
      parseRtcDecline(
        createEvent({
          type: RTC_DECLINE_EVENT_TYPE,
          relation: {
            rel_type: 'm.thread',
            event_id: '$notif',
          },
        }),
        { myUserId: '@self:example.org' }
      )
    ).toBeUndefined();
  });
});
