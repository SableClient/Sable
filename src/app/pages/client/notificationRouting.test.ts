import { describe, expect, it } from 'vitest';
import {
  isForegroundFocusedClient,
  shouldDeferInviteNotificationToPush,
  shouldDeferMessageNotificationToPush,
} from './notificationRouting';

describe('notification routing', () => {
  it('detects only visible focused clients as active foreground clients', () => {
    expect(isForegroundFocusedClient('visible', true)).toBe(true);
    expect(isForegroundFocusedClient('visible', false)).toBe(false);
    expect(isForegroundFocusedClient('hidden', true)).toBe(false);
  });

  it('lets web push own invite delivery only when push is enabled and ready', () => {
    expect(shouldDeferInviteNotificationToPush(true, true)).toBe(true);
    expect(shouldDeferInviteNotificationToPush(true, false)).toBe(false);
    expect(shouldDeferInviteNotificationToPush(false, true)).toBe(false);
  });

  it('defers message delivery to push whenever the client is not actively focused', () => {
    expect(shouldDeferMessageNotificationToPush(true, 'visible', true)).toBe(false);
    expect(shouldDeferMessageNotificationToPush(true, 'visible', false)).toBe(true);
    expect(shouldDeferMessageNotificationToPush(true, 'hidden', false)).toBe(true);
    expect(shouldDeferMessageNotificationToPush(false, 'hidden', false)).toBe(false);
  });
});
