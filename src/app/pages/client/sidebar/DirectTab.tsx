import { forwardRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useDirectSelected } from '$hooks/router/useRouteSelected';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useNavToActivePathAtom } from '$state/hooks/navToActivePath';
import { getPhosphorIconSize, User } from '$components/icons/phosphor';
import { useDirectRooms } from '$pages/client/direct/useDirectRooms';
import { useSidebarDirectRoomIds } from './useSidebarDirectRoomIds';
import { ResponsiveMenu } from '$components/ResponsiveMenu';
import { useMenuAnchor } from '$hooks/useMenuAnchor';
import { NavMenu } from '$components/nav/NavMenu';

type DirectMenuProps = {
  requestClose: () => void;
};
const DirectMenu = forwardRef<HTMLDivElement, DirectMenuProps>(({ requestClose }, ref) => {
  const orphanRooms = useDirectRooms();

  return <NavMenu ref={ref} rooms={orphanRooms} requestClose={requestClose} />;
});
DirectMenu.displayName = 'DirectMenu';

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
  const menu = useMenuAnchor<HTMLButtonElement>();

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

  return (
    <SidebarItemLeft active={directSelected}>
      <SidebarItemTooltip tooltip="Direct Messages">
        {(triggerRef) => (
          <ResponsiveMenu
            anchor={menu.anchor}
            requestClose={menu.close}
            position="Right"
            align="Start"
            menu={<DirectMenu requestClose={menu.close} />}
          >
            <SidebarAvatar
              as="button"
              ref={triggerRef}
              outlined
              onClick={handleDirectClick}
              onContextMenu={menu.triggerProps.onContextMenu}
              onTouchStart={menu.triggerProps.onTouchStart}
              onTouchEnd={menu.triggerProps.onTouchEnd}
              onTouchMove={menu.triggerProps.onTouchMove}
              onTouchCancel={menu.triggerProps.onTouchCancel}
            >
              <User
                size={getPhosphorIconSize('toolbar')}
                weight={directSelected ? 'fill' : 'regular'}
              />
            </SidebarAvatar>
          </ResponsiveMenu>
        )}
      </SidebarItemTooltip>
      {directUnread && (
        <SidebarUnreadBadge
          highlight={directUnread.highlight > 0}
          count={directUnread.highlight > 0 ? directUnread.highlight : directUnread.total}
          dm
        />
      )}
    </SidebarItemLeft>
  );
}
