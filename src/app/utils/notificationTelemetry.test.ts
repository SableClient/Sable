import { describe, expect, it } from 'vitest';
import {
  buildNotificationBreadcrumb,
  buildNotificationMetricAttributes,
  sanitizeNotificationTelemetryData,
} from './notificationTelemetry';

describe('notificationTelemetry', () => {
  it('drops nullish telemetry values', () => {
    expect(
      sanitizeNotificationTelemetryData({
        click_id: 'abc',
        room_id: undefined,
        event_id: null,
        has_event_id: true,
      })
    ).toEqual({
      click_id: 'abc',
      has_event_id: true,
    });
  });

  it('builds standardized notification breadcrumb payloads', () => {
    expect(
      buildNotificationBreadcrumb('restore', 'restore_jump_started', {
        click_id: 'abc',
        room_id: '!room:example',
        event_id: '$event',
      })
    ).toEqual({
      category: 'notification.restore',
      message: 'restore_jump_started',
      level: 'info',
      data: {
        click_id: 'abc',
        room_id: '!room:example',
        event_id: '$event',
      },
    });
  });

  it('builds metric attributes with an empty object fallback', () => {
    expect(buildNotificationMetricAttributes()).toEqual({});
  });
});
