import type { MouseEventHandler, TouchEvent as ReactTouchEvent } from 'react';
import { forwardRef, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RectCords } from 'folds';
import { Box, Menu, MenuItem, PopOut, Text, config, toRem } from 'folds';
import FocusTrap from 'focus-trap-react';
import { useAtomValue } from 'jotai';
import { useDirects } from '$state/hooks/roomList';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { mDirectAtom } from '$state/mDirectList';
import { allRoomsAtom } from '$state/room-list/roomList';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { getDirectPath, joinPathComponent } from '$pages/pathUtils';
import { useRoomsUnread } from '$state/hooks/unread';
import {
  SidebarAvatar,
  SidebarItemLeft,
  SidebarUnreadBadge,
  SidebarItemTooltip,
} from '$components/sidebar';
import { useDirectSelected } from '$hooks/router/useDirectSelected';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useNavToActivePathAtom } from '$state/hooks/navToActivePath';
import { markAsRead } from '$utils/notifications';
import { stopPropagation } from '$utils/keyboard';
import { Checks, menuIcon, getPhosphorIconSize, User } from '$components/icons/phosphor';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { useDirectRooms } from '$pages/client/direct/useDirectRooms';
import { useSidebarDirectRoomIds } from './useSidebarDirectRoomIds';
import { useMobileLongPress } from '$hooks/useMobileLongPress';

type DirectMenuProps = {
  requestClose: () => void;
};
const DirectMenu = forwardRef<HTMLDivElement, DirectMenuProps>(({ requestClose }, ref) => {
  const orphanRooms = useDirectRooms();
  const [hideReads] = useSetting(settingsAtom, 'hideReads');
  const unread = useRoomsUnread(orphanRooms, roomToUnreadAtom);
  const mx = useMatrixClient();

  const handleMarkAsRead = () => {
    if (!unread) return;
    orphanRooms.forEach((rId) => markAsRead(mx, rId, hideReads));
    requestClose();
  };

  return (
    <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem
          onClick={handleMarkAsRead}
          size="300"
          after={menuIcon(Checks)}
          radii="300"
          aria-disabled={!unread}
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Mark as Read
          </Text>
        </MenuItem>
      </Box>
    </Menu>
  );
});

export function DirectTab() {
  const navigate = useNavigate();
  const mx = useMatrixClient();
  const screenSize = useScreenSizeContext();
  const navToActivePath = useAtomValue(useNavToActivePathAtom());

  const mDirects = useAtomValue(mDirectAtom);
  const directs = useDirects(mx, allRoomsAtom, mDirects);
  const sidebarRoomIds = useSidebarDirectRoomIds();
  // Only count unread for DMs not already shown as individual avatars in the
  // sidebar — prevents double-badging (issue #235).
  const overflowDirects = useMemo(() => {
    const sidebarSet = new Set(sidebarRoomIds);
    return directs.filter((id) => !sidebarSet.has(id));
  }, [directs, sidebarRoomIds]);
  const directUnread = useRoomsUnread(overflowDirects, roomToUnreadAtom);
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const directSelected = useDirectSelected();

  const handleDirectClick = () => {
    const activePath = navToActivePath.get('direct');
    const activePathname = activePath?.pathname;
    const isValidDirectPath =
      typeof activePathname === 'string' && activePathname.startsWith('/direct/');
    if (activePath && isValidDirectPath && screenSize !== ScreenSize.Mobile) {
      navigate(joinPathComponent(activePath));
      return;
    }

    navigate(getDirectPath());
  };

  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const openMenuAt = (element: HTMLElement) => {
    const cords = element.getBoundingClientRect();
    setMenuAnchor((currentState) => (currentState ? undefined : cords));
  };

  const handleContextMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    evt.preventDefault();
    openMenuAt(evt.currentTarget);
  };

  const longPress = useMobileLongPress(() => {
    if (buttonRef.current) openMenuAt(buttonRef.current);
  });

  const handleTouchStart = (evt: ReactTouchEvent<HTMLButtonElement>) => {
    buttonRef.current = evt.currentTarget;
    longPress.onTouchStart(evt);
  };
  return (
    <SidebarItemLeft active={directSelected}>
      <SidebarItemTooltip tooltip="Direct Messages">
        {(triggerRef) => (
          <SidebarAvatar
            as="button"
            ref={triggerRef}
            outlined
            onClick={handleDirectClick}
            onContextMenu={handleContextMenu}
            onTouchStart={handleTouchStart}
            onTouchEnd={longPress.onTouchEnd}
            onTouchMove={longPress.onTouchMove}
            onTouchCancel={longPress.onTouchCancel}
          >
            <User
              size={getPhosphorIconSize('toolbar')}
              weight={directSelected ? 'fill' : 'regular'}
            />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      {directUnread && (
        <SidebarUnreadBadge
          highlight={directUnread.highlight > 0}
          count={directUnread.highlight > 0 ? directUnread.highlight : directUnread.total}
          dm
        />
      )}
      {menuAnchor && (
        <PopOut
          anchor={menuAnchor}
          position="Right"
          align="Start"
          content={
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                returnFocusOnDeactivate: false,
                onDeactivate: () => setMenuAnchor(undefined),
                clickOutsideDeactivates: true,
                isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                escapeDeactivates: stopPropagation,
              }}
            >
              <DirectMenu requestClose={() => setMenuAnchor(undefined)} />
            </FocusTrap>
          }
        />
      )}
    </SidebarItemLeft>
  );
}
