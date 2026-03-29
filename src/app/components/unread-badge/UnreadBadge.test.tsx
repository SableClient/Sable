import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatUnreadBadgeCount, resolveUnreadBadgeMode, UnreadBadge } from './UnreadBadge';

const settings = {
  showUnreadCounts: true,
  badgeCountDMsOnly: true,
  showPingCounts: true,
  showEasterEggs: true,
};

vi.mock('$state/hooks/settings', () => ({
  useSetting: (_atom: unknown, key: keyof typeof settings) => [settings[key]],
}));

vi.mock('$state/settings', () => ({
  settingsAtom: {},
}));

beforeEach(() => {
  settings.showUnreadCounts = true;
  settings.badgeCountDMsOnly = true;
  settings.showPingCounts = true;
  settings.showEasterEggs = true;
});

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

describe('formatUnreadBadgeCount', () => {
  it.each([
    [1, '1'],
    [9, '9'],
    [99, '99'],
    [999, '999'],
    [1000, '1k'],
    [1001, ':3'],
    [2000, ':3'],
    [2001, ':3'],
    [9000, ':3'],
    [9001, ':3'],
    [10000, ':3'],
  ])('formats %i as %s when easter eggs are enabled', (count, expected) => {
    expect(formatUnreadBadgeCount(count, true)).toBe(expected);
  });

  it.each([
    [1, '1'],
    [99, '99'],
    [999, '999'],
    [1000, '1k'],
    [1001, '1k+'],
    [2000, '1k+'],
    [2001, '1k+'],
    [9000, '1k+'],
    [9001, '1k+'],
    [10000, '1k+'],
  ])('formats %i as %s when easter eggs are disabled', (count, expected) => {
    expect(formatUnreadBadgeCount(count, false)).toBe(expected);
  });
});

describe('UnreadBadge', () => {
  it('renders :3 instead of k+ when easter eggs are enabled', () => {
    settings.showEasterEggs = true;

    render(<UnreadBadge count={1001} mode="count" />);

    expect(screen.getByText(':3')).toBeInTheDocument();
    expect(screen.queryByText('1k+')).not.toBeInTheDocument();
  });

  it('renders k+ when easter eggs are disabled', () => {
    settings.showEasterEggs = false;

    render(<UnreadBadge count={1001} mode="count" />);

    expect(screen.getByText('1k+')).toBeInTheDocument();
    expect(screen.queryByText(':3')).not.toBeInTheDocument();
  });
});
