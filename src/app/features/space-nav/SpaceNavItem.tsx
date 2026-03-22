import { MouseEventHandler, useState } from 'react';
import { Room } from '$types/matrix-sdk';
import { Box, Icon, Icons, Text, config, RectCords, Avatar } from 'folds';
import { useNavigate } from 'react-router-dom';
import { NavButton, NavItem, NavItemContent } from '$components/nav';
import { useRoomName } from '$hooks/useRoomMeta';

type SpaceNavItemProps = {
  room: Room;
  selected: boolean;
  linkPath: string;
};

export function SpaceNavItem({ room, selected, linkPath }: SpaceNavItemProps) {
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const matrixRoomName = useRoomName(room);
  const roomName = matrixRoomName;

  const navigate = useNavigate();

  const handleContextMenu: MouseEventHandler<HTMLElement> = (evt) => {
    evt.preventDefault();
    setMenuAnchor({
      x: evt.clientX,
      y: evt.clientY,
      width: 0,
      height: 0,
    });
  };

  const handleNavItemClick: MouseEventHandler<HTMLElement> = () => {
    navigate(linkPath);
  };

  const ariaLabel = [roomName, 'Space'].flat().filter(Boolean).join(', ');

  return (
    <Box direction="Column" grow="Yes">
      <NavItem
        variant="Background"
        radii="400"
        highlight={false}
        aria-selected={selected}
        data-hover={!!menuAnchor}
        onContextMenu={handleContextMenu}
      >
        <NavButton onClick={handleNavItemClick} aria-label={ariaLabel}>
          <NavItemContent>
            <Box as="span" grow="Yes" alignItems="Center" gap="200">
              <Avatar size="200" radii="400">
                <Icon
                  src={Icons.Space}
                  style={{ opacity: config.opacity.P300 }}
                  filled={selected}
                  size="100"
                />
              </Avatar>
              <Box as="span" grow="Yes">
                <Text priority="300" as="span" size="Inherit" truncate>
                  {roomName}
                </Text>
              </Box>
            </Box>
          </NavItemContent>
        </NavButton>
      </NavItem>
    </Box>
  );
}
