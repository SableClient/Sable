import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SidebarUnreadBadge } from './SidebarUnreadBadge';

const settings = {
  showUnreadCounts: true,
  badgeCountDMsOnly: false,
  showPingCounts: false,
};

vi.mock('$state/hooks/settings', () => ({
  useSetting: (_atom: unknown, key: keyof typeof settings) => [settings[key]],
}));

vi.mock('$state/settings', () => ({
  settingsAtom: {},
}));

vi.mock('./SidebarItem', () => ({
  SidebarItemBadge: ({ mode, children }: { mode: 'dot' | 'count'; children: ReactNode }) => (
    <div data-testid="sidebar-item-badge" data-mode={mode}>
      {children}
    </div>
  ),
}));

describe('SidebarUnreadBadge', () => {
  it('uses count mode when room unread counts are enabled', () => {
    settings.showUnreadCounts = true;

    render(<SidebarUnreadBadge count={4} />);

    expect(screen.getByTestId('sidebar-item-badge')).toHaveAttribute('data-mode', 'count');
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('uses dot mode when room unread counts are disabled', () => {
    settings.showUnreadCounts = false;

    render(<SidebarUnreadBadge count={4} />);

    expect(screen.getByTestId('sidebar-item-badge')).toHaveAttribute('data-mode', 'dot');
    expect(screen.queryByText('4')).not.toBeInTheDocument();
  });
});
