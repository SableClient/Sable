import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MenuAnchor } from '$hooks/useMenuAnchor';
import { SidebarTab } from './SidebarTab';

vi.mock('$components/sidebar', () => ({
  SidebarItemLeft: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarItemTooltip: ({ children }: { children: (ref: unknown) => ReactNode }) => children(null),
  SidebarUnreadBadge: () => null,
  SidebarAvatar: ({ children, ...props }: { children: ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('$components/ResponsiveMenu', () => ({
  ResponsiveMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const menuAnchorStub = (longPressFired: boolean): MenuAnchor<HTMLButtonElement> => ({
  anchor: undefined,
  isPressing: false,
  close: vi.fn<() => void>(),
  openAt: vi.fn<() => void>(),
  open: vi.fn<() => void>(),
  consumeLongPressFired: () => longPressFired,
  triggerProps: {
    onClick: vi.fn<() => void>(),
    onContextMenu: vi.fn<() => void>(),
    onTouchStart: vi.fn<() => void>(),
    onTouchEnd: vi.fn<() => void>(),
    onTouchMove: vi.fn<() => void>(),
    onTouchCancel: vi.fn<() => void>(),
  },
});

const renderTab = (longPressFired: boolean, onClick: () => void) =>
  render(
    <SidebarTab
      icon={<span>icon</span>}
      selected={false}
      tooltip="Home"
      onClick={onClick}
      menu={<span>menu</span>}
      menuAnchor={menuAnchorStub(longPressFired)}
    />
  );

describe('SidebarTab', () => {
  it('does not navigate on the click that follows a long press', () => {
    const onClick = vi.fn<() => void>();
    renderTab(true, onClick);

    // WKWebView sends no contextmenu on long press, so the release still produces a
    // click; acting on it would navigate away from the menu just opened.
    fireEvent.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('navigates on an ordinary click', () => {
    const onClick = vi.fn<() => void>();
    renderTab(false, onClick);

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
