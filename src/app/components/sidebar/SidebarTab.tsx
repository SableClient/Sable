import type { ReactNode } from 'react';
import {
  SidebarAvatar,
  SidebarItemLeft,
  SidebarUnreadBadge,
  SidebarItemTooltip,
} from '$components/sidebar';
import { ResponsiveMenu } from '$components/ResponsiveMenu';
import type { MenuAnchor } from '$hooks/useMenuAnchor';

type SidebarTabProps = {
  icon: ReactNode;
  selected: boolean;
  tooltip: string;
  onClick: () => void;
  menu: ReactNode;
  menuAnchor: MenuAnchor<HTMLButtonElement>;
  unreadHighlight?: boolean;
  unreadCount?: number;
  dm?: boolean;
};

export function SidebarTab({
  icon,
  selected,
  tooltip,
  onClick,
  menu,
  menuAnchor,
  unreadHighlight = false,
  unreadCount = 0,
  dm = false,
}: SidebarTabProps) {
  const { anchor, close, triggerProps, consumeLongPressFired } = menuAnchor;

  // Platforms that do not fire `contextmenu` on a long press (WKWebView) still send a
  // synthetic click on release, which would navigate away from the menu just opened.
  const handleClick = () => {
    if (consumeLongPressFired()) return;
    onClick();
  };

  return (
    <SidebarItemLeft active={selected}>
      <SidebarItemTooltip tooltip={tooltip}>
        {(triggerRef) => (
          <ResponsiveMenu
            anchor={anchor}
            requestClose={close}
            position="Right"
            align="Start"
            menu={menu}
          >
            <SidebarAvatar
              as="button"
              ref={triggerRef}
              outlined
              onClick={handleClick}
              onContextMenu={triggerProps.onContextMenu}
              onTouchStart={triggerProps.onTouchStart}
              onTouchEnd={triggerProps.onTouchEnd}
              onTouchMove={triggerProps.onTouchMove}
              onTouchCancel={triggerProps.onTouchCancel}
            >
              {icon}
            </SidebarAvatar>
          </ResponsiveMenu>
        )}
      </SidebarItemTooltip>
      {unreadCount > 0 && (
        <SidebarUnreadBadge highlight={unreadHighlight} count={unreadCount} dm={dm} />
      )}
    </SidebarItemLeft>
  );
}
