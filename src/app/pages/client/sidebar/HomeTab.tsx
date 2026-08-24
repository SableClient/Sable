import { forwardRef } from 'react';
import { useNavigate } from 'react-router';
import { useAtomValue } from 'jotai';
import { useOrphanRooms } from '$state/hooks/roomList';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { mDirectAtom } from '$state/mDirectList';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { allRoomsAtom } from '$state/room-list/roomList';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { getHomePath, joinPathComponent } from '$pages/pathUtils';
import { useRoomsUnread } from '$state/hooks/unread';
import { SidebarTab } from '$components/sidebar';
import { useHomeSelected } from '$hooks/router/useRouteSelected';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useNavToActivePathAtom } from '$state/hooks/navToActivePath';
import { House, getPhosphorIconSize } from '$components/icons/phosphor';
import { useMenuAnchor } from '$hooks/useMenuAnchor';
import { NavMenu } from '$components/nav/NavMenu';
import { useHomeRooms } from '$pages/client/home/useHomeRooms';

type HomeMenuProps = {
  requestClose: () => void;
};
const HomeMenu = forwardRef<HTMLDivElement, HomeMenuProps>(({ requestClose }, ref) => {
  const orphanRooms = useHomeRooms();

  return <NavMenu ref={ref} rooms={orphanRooms} requestClose={requestClose} />;
});
HomeMenu.displayName = 'HomeMenu';

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
  const menuAnchor = useMenuAnchor<HTMLButtonElement>();

  const handleHomeClick = () => {
    const activePath = navToActivePath.get('home');
    if (activePath && screenSize !== ScreenSize.Mobile) {
      navigate(joinPathComponent(activePath));
      return;
    }

    navigate(getHomePath());
  };

  return (
    <SidebarTab
      icon={
        <House size={getPhosphorIconSize('toolbar')} weight={homeSelected ? 'fill' : 'regular'} />
      }
      selected={homeSelected}
      tooltip="Home"
      onClick={handleHomeClick}
      menu={<HomeMenu requestClose={menuAnchor.close} />}
      menuAnchor={menuAnchor}
      unreadHighlight={homeUnread ? homeUnread.highlight > 0 : false}
      unreadCount={
        homeUnread ? (homeUnread.highlight > 0 ? homeUnread.highlight : homeUnread.total) : 0
      }
    />
  );
}
