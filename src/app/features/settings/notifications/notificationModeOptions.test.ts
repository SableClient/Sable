import { describe, expect, it } from 'vitest';

import { NotificationMode } from '$hooks/useNotificationMode';

import { notificationModeSelectorOptions } from './notificationModeOptions';

describe('notificationModeSelectorOptions', () => {
  it('returns the notification modes in display order with stable labels', () => {
    expect(notificationModeSelectorOptions).toEqual([
      { value: NotificationMode.NotifyLoud, label: 'Notify Loud' },
      { value: NotificationMode.Notify, label: 'Notify Silent' },
      { value: NotificationMode.OFF, label: 'Disable' },
    ]);
  });
});
