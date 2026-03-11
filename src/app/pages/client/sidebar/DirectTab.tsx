import { MouseEventHandler, forwardRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Box, Icon, Icons, Menu, MenuItem, PopOut, RectCords, Text, config, toRem } from 'folds';
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
  SidebarItem,
  SidebarItemBadge,
  SidebarItemTooltip,
} from '$components/sidebar';
import { useDirectSelected } from '$hooks/router/useDirectSelected';
import { UnreadBadge } from '$components/unread-badge';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useNavToActivePathAtom } from '$state/hooks/navToActivePath';
import { markAsRead } from '$utils/notifications';
import { stopPropagation } from '$utils/keyboard';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { useDirectRooms } from '$pages/client/direct/useDirectRooms';
import { RoomAvatar } from '$components/room-avatar';
import { getDirectRoomAvatarUrl } from '$utils/room';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { nameInitials } from '$utils/common';
import { factoryRoomIdByActivity } from '$utils/sort';
import * as css from './DirectTab.css';

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
          after={<Icon size="100" src={Icons.CheckTwice} />}
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
  const useAuthentication = useMediaAuthentication();
  const screenSize = useScreenSizeContext();
  const navToActivePath = useAtomValue(useNavToActivePathAtom());

  const mDirects = useAtomValue(mDirectAtom);
  const directs = useDirects(mx, allRoomsAtom, mDirects);
  const directUnread = useRoomsUnread(directs, roomToUnreadAtom);
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const directSelected = useDirectSelected();

  // Get up to 3 recent DMs, prioritizing ones with unread messages
  const recentDMs = useMemo(() => {
    const withUnread = directs.filter((roomId) => {
      const unread = roomToUnread.get(roomId);
      return unread && (unread.total > 0 || unread.highlight > 0);
    });

    const sorted = Array.from(directs).sort(factoryRoomIdByActivity(mx));
    const prioritized = [
      ...withUnread.sort(factoryRoomIdByActivity(mx)),
      ...sorted.filter((id) => !withUnread.includes(id)),
    ];

    return prioritized.slice(0, 3).map((roomId) => mx.getRoom(roomId)).filter(Boolean);
  }, [directs, mx, roomToUnread]);

  const handleDirectClick = () => {
    const activePath = navToActivePath.get('direct');
    if (activePath && screenSize !== ScreenSize.Mobile) {
      navigate(joinPathComponent(activePath));
      return;
    }

    navigate(getDirectPath());
  };

  const handleContextMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    evt.preventDefault();
    const cords = evt.currentTarget.getBoundingClientRect();
    setMenuAnchor((currentState) => {
      if (currentState) return undefined;
      return cords;
    });
  };
  return (
    <SidebarItem active={directSelected}>
      <SidebarItemTooltip tooltip="Direct Messages">
        {(triggerRef) => (
          <SidebarAvatar
            as="button"
            ref={triggerRef}
            outlined
            onClick={handleDirectClick}
            onContextMenu={handleContextMenu}
          >
            {recentDMs.length === 0 ? (
              <Icon src={Icons.User} filled={directSelected} />
            ) : (
              <div className={css.DMStackContainer}>
                {recentDMs.map((room, index) => {
                  const avatarClass =
                    recentDMs.length === 1
                      ? css.DMStackSingle
                      : recentDMs.length === 2
                        ? css.DMStackDouble
                        : css.DMStackTriple;

                  return (
                    <div key={room.roomId} className={avatarClass}>
                      <Avatar size="100" radii="400" className={css.DMAvatar}>
                        <RoomAvatar
                          roomId={room.roomId}
                          src={getDirectRoomAvatarUrl(mx, room, 32, useAuthentication)}
                          alt={room.name}
                          renderFallback={() => (
                            <Text as="span" size="Inherit">
                              {nameInitials(room.name)}
                            </Text>
                          )}
                        />
                      </Avatar>
                    </div>
                  );
                })}
              </div>
            )}
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      {directUnread && (
        <SidebarItemBadge hasCount={directUnread.total > 0}>
          <UnreadBadge
            highlight={directUnread.highlight > 0}
            count={directUnread.highlight > 0 ? directUnread.highlight : directUnread.total}
            dm
          />
        </SidebarItemBadge>
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
    </SidebarItem>
  );
}
