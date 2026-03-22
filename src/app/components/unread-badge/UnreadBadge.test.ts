import { describe, expect, it } from 'vitest';
import { resolveUnreadBadgeMode } from './UnreadBadge';

describe('resolveUnreadBadgeMode', () => {
  it('returns count for a room unread when unread counts are enabled', () => {
    expect(
      resolveUnreadBadgeMode({
        count: 4,
        showUnreadCounts: true,
        badgeCountDMsOnly: false,
        showPingCounts: false,
      })
    ).toBe('count');
  });

  it('returns dot for a room unread when unread counts are disabled', () => {
    expect(
      resolveUnreadBadgeMode({
        count: 4,
        showUnreadCounts: false,
        badgeCountDMsOnly: false,
        showPingCounts: false,
      })
    ).toBe('dot');
  });

  it('returns count for a DM unread when DM counts are enabled', () => {
    expect(
      resolveUnreadBadgeMode({
        count: 4,
        dm: true,
        showUnreadCounts: false,
        badgeCountDMsOnly: true,
        showPingCounts: false,
      })
    ).toBe('count');
  });

  it('returns count for a highlight when ping counts are enabled', () => {
    expect(
      resolveUnreadBadgeMode({
        count: 2,
        highlight: true,
        showUnreadCounts: false,
        badgeCountDMsOnly: false,
        showPingCounts: true,
      })
    ).toBe('count');
  });
});
