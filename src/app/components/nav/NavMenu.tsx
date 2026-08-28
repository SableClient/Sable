import type { ReactNode } from 'react';
import { forwardRef } from 'react';
import { Box, Menu, MenuItem, Text, config, toRem } from 'folds';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { useRoomsUnread } from '$state/hooks/unread';
import { markAsRead } from '$utils/notifications';
import { Checks, menuIcon } from '$components/icons/phosphor';

type NavMenuProps = {
  rooms: string[];
  requestClose: () => void;
  children?: ReactNode;
};

export const NavMenu = forwardRef<HTMLDivElement, NavMenuProps>(
  ({ rooms, requestClose, children }, ref) => {
    const mx = useMatrixClient();
    const [hideReads] = useSetting(settingsAtom, 'hideReads');
    const unread = useRoomsUnread(rooms, roomToUnreadAtom);

    const handleMarkAsRead = () => {
      if (!unread) return;
      rooms.forEach((rId) => markAsRead(mx, rId, hideReads, true));
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
          {children}
        </Box>
      </Menu>
    );
  }
);
NavMenu.displayName = 'NavMenu';
