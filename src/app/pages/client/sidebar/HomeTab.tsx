import { forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Menu, MenuItem, Text, config, toRem } from 'folds';
import { useAtomValue } from 'jotai';
import { useOrphanRooms } from '$state/hooks/roomList';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { mDirectAtom } from '$state/mDirectList';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { allRoomsAtom } from '$state/room-list/roomList';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { getHomePath, joinPathComponent } from '$pages/pathUtils';
import { useRoomsUnread } from '$state/hooks/unread';
import {
  SidebarAvatar,
  SidebarItemLeft,
  SidebarUnreadBadge,
  SidebarItemTooltip,
} from '$components/sidebar';
import { useHomeSelected } from '$hooks/router/useRouteSelected';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useNavToActivePathAtom } from '$state/hooks/navToActivePath';
import { markAsRead } from '$utils/notifications';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useHomeRooms } from '$pages/client/home/useHomeRooms';
import { Checks, House, menuIcon, getPhosphorIconSize } from '$components/icons/phosphor';
import { ResponsiveMenu } from '$components/ResponsiveMenu';
import { useMenuAnchor } from '$hooks/useMenuAnchor';

type HomeMenuProps = {
  requestClose: () => void;
};
const HomeMenu = forwardRef<HTMLDivElement, HomeMenuProps>(({ requestClose }, ref) => {
  const orphanRooms = useHomeRooms();
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

export function HomeTab() {
  const navigate = useNavigate();
  const mx = useMatrixClient();
  const screenSize = useScreenSizeContext();
  const navToActivePath = useAtomValue(useNavToActivePathAtom());

  const mDirects = useAtomValue(mDirectAtom);
  const roomToParents = useAtomValue(roomToParentsAtom);
  const orphanRooms = useOrphanRooms(mx, allRoomsAtom, mDirects, roomToParents);
  const homeUnread = useRoomsUnread(orphanRooms, roomToUnreadAtom);
  const homeSelected = useHomeSelected();
  const menu = useMenuAnchor<HTMLButtonElement>();

  const handleHomeClick = () => {
    const activePath = navToActivePath.get('home');
    if (activePath && screenSize !== ScreenSize.Mobile) {
      navigate(joinPathComponent(activePath));
      return;
    }

    navigate(getHomePath());
  };

  return (
    <SidebarItemLeft active={homeSelected}>
      <SidebarItemTooltip tooltip="Home">
        {(triggerRef) => (
          <ResponsiveMenu
            anchor={menu.anchor}
            requestClose={menu.close}
            position="Right"
            align="Start"
            menu={<HomeMenu requestClose={menu.close} />}
          >
            <SidebarAvatar
              as="button"
              ref={triggerRef}
              outlined
              onClick={handleHomeClick}
              onContextMenu={menu.triggerProps.onContextMenu}
              onTouchStart={menu.triggerProps.onTouchStart}
              onTouchEnd={menu.triggerProps.onTouchEnd}
              onTouchMove={menu.triggerProps.onTouchMove}
              onTouchCancel={menu.triggerProps.onTouchCancel}
            >
              <House
                size={getPhosphorIconSize('toolbar')}
                weight={homeSelected ? 'fill' : 'regular'}
              />
            </SidebarAvatar>
          </ResponsiveMenu>
        )}
      </SidebarItemTooltip>
      {homeUnread && (
        <SidebarUnreadBadge
          highlight={homeUnread.highlight > 0}
          count={homeUnread.highlight > 0 ? homeUnread.highlight : homeUnread.total}
        />
      )}
    </SidebarItemLeft>
  );
}
