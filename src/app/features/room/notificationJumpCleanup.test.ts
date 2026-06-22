import { describe, expect, it } from 'vitest';
import {
  buildNotificationJumpCleanupTarget,
  shouldClearNotificationJumpRoute,
} from './notificationJumpCleanup';

describe('notificationJumpCleanup', () => {
  it('only clears a notification jump route once the room is back at live bottom', () => {
    expect(
      shouldClearNotificationJumpRoute({
        eventId: '$event',
        jumpMode: 'notification_live',
        atBottom: true,
        liveTimelineLinked: true,
      })
    ).toBe(true);

    expect(
      shouldClearNotificationJumpRoute({
        eventId: '$event',
        jumpMode: 'notification_live',
        atBottom: false,
        liveTimelineLinked: true,
      })
    ).toBe(false);

    expect(
      shouldClearNotificationJumpRoute({
        eventId: '$event',
        jumpMode: 'notification_live',
        atBottom: true,
        liveTimelineLinked: false,
      })
    ).toBe(false);

    expect(
      shouldClearNotificationJumpRoute({
        eventId: '$event',
        jumpMode: 'history_context',
        atBottom: true,
        liveTimelineLinked: true,
      })
    ).toBe(false);
  });

  it('removes notification-only query params and strips the event segment', () => {
    expect(
      buildNotificationJumpCleanupTarget(
        '/direct/%21abc/%24event',
        '?jumpMode=notification_live&joinCall=true&via=push',
        '$event'
      )
    ).toBe('/direct/%21abc?via=push');
  });
});
