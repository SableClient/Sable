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

  it('drops identifier-like string metric attributes while keeping low-cardinality fields', () => {
    expect(
      buildNotificationMetricAttributes({
        room_id: '!room:example',
        event_id: '$event',
        click_id: 'click-123',
        target_url: 'https://example.com/to/room',
        source: 'to_room_event',
        jump_mode: 'notification_live',
        failure_reason: 'timeout',
        sync_state: 'SYNCING',
        visibility_state: 'hidden',
        trigger: 'tap',
        has_event_id: true,
      })
    ).toEqual({
      source: 'to_room_event',
      jump_mode: 'notification_live',
      failure_reason: 'timeout',
      sync_state: 'SYNCING',
      visibility_state: 'hidden',
      trigger: 'tap',
      has_event_id: true,
    });
  });
});
