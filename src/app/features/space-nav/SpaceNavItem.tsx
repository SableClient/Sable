import type { MouseEventHandler } from 'react';
import type { Room } from '$types/matrix-sdk';
import { Box, Text, config, Avatar } from 'folds';
import { useNavigate } from 'react-router';
import { NavButton, NavItem, NavItemContent } from '$components/nav';
import { useRoomName } from '$hooks/useRoomMeta';
import { menuIcon, SquaresFour } from '$components/icons/phosphor';

type SpaceNavItemProps = {
  room: Room;
  selected: boolean;
  linkPath: string;
  hideText?: boolean;
};

export function SpaceNavItem({ room, selected, linkPath, hideText }: SpaceNavItemProps) {
  const matrixRoomName = useRoomName(room);
  const roomName = matrixRoomName;

  const navigate = useNavigate();

  const handleNavItemClick: MouseEventHandler<HTMLElement> = () => {
    navigate(linkPath);
  };

  const ariaLabel = [roomName, 'Space'].flat().filter(Boolean).join(', ');

  return (
    <Box direction="Column" grow="Yes">
      <NavItem variant="Background" radii="400" highlight={false} aria-selected={selected}>
        <NavButton onClick={handleNavItemClick} aria-label={ariaLabel}>
          <NavItemContent>
            <Box
              as="span"
              grow="Yes"
              alignItems="Center"
              gap="200"
              style={{ padding: hideText ? '0' : '1' }}
            >
              <Avatar size="200" radii="400">
                {menuIcon(SquaresFour, {
                  style: { opacity: config.opacity.P300 },
                  weight: selected ? 'fill' : 'regular',
                })}
              </Avatar>
              {!hideText && (
                <Box as="span" grow="Yes">
                  <Text priority="300" as="span" size="Inherit" truncate>
                    {roomName}
                  </Text>
                </Box>
              )}
            </Box>
          </NavItemContent>
        </NavButton>
      </NavItem>
    </Box>
  );
}
