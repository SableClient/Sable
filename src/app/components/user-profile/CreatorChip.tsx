import { Chip, config, Menu, MenuItem, Text } from 'folds';
import { CaretDown, profileIcon } from '$components/icons/phosphor';
import type { CSSProperties } from 'react';
import { useRoomCreatorsTag } from '$hooks/useRoomCreatorsTag';
import { getPowerTagIconSrc } from '$hooks/useMemberPowerTag';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useRoom } from '$hooks/useRoom';
import { useSpaceOptionally } from '$hooks/useSpace';
import { useOpenRoomSettings } from '$state/hooks/roomSettings';
import { RoomSettingsPage } from '$state/roomSettings';
import { PowerColorBadge, PowerIcon } from '$components/power';
import { heroMenuItemStyle } from './heroMenuItemStyle';
import * as css from './styles.css';
import { ResponsiveMenu } from '$components/ResponsiveMenu';
import { useMenuAnchor } from '$hooks/useMenuAnchor';

export function CreatorChip({
  innerColor,
  cardColor,
  textColor,
  chipSurfaceStyle,
  chipFillColor,
  chipHoverBrightness,
}: {
  innerColor?: string;
  cardColor?: string;
  textColor?: string;
  chipSurfaceStyle?: CSSProperties;
  chipFillColor?: string;
  chipHoverBrightness?: number;
}) {
  const menuItemBg = chipFillColor ?? cardColor;
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const room = useRoom();
  const space = useSpaceOptionally();
  const openRoomSettings = useOpenRoomSettings();

  const creatorMenu = useMenuAnchor<HTMLButtonElement>();
  const tag = useRoomCreatorsTag();
  const tagIconSrc = tag.icon && getPowerTagIconSrc(mx, useAuthentication, tag.icon);

  return (
    <ResponsiveMenu
      anchor={creatorMenu.anchor}
      requestClose={creatorMenu.close}
      position="Bottom"
      align="Start"
      offset={4}
      returnFocusOnDeactivate
      surfaceColor={cardColor ? innerColor : undefined}
      menu={
        <Menu>
          <div style={{ padding: config.space.S100, backgroundColor: innerColor }}>
            <MenuItem
              variant="Surface"
              fill="None"
              className={css.UserHeroMenuItem}
              style={heroMenuItemStyle(
                { backgroundColor: menuItemBg, color: textColor },
                chipHoverBrightness
              )}
              size="300"
              radii="300"
              onClick={() => {
                openRoomSettings(room.roomId, space?.roomId, RoomSettingsPage.PermissionsPage);
                creatorMenu.close();
              }}
            >
              <Text size="B300">Manage Powers</Text>
            </MenuItem>
          </div>
        </Menu>
      }
    >
      <Chip
        variant={cardColor ? undefined : 'Success'}
        outlined={!cardColor}
        radii="Pill"
        before={creatorMenu.anchor ? profileIcon(CaretDown) : <PowerColorBadge color={tag.color} />}
        after={tagIconSrc ? <PowerIcon size="50" iconSrc={tagIconSrc} /> : undefined}
        onClick={creatorMenu.triggerProps.onClick}
        aria-pressed={!!creatorMenu.anchor}
        className={cardColor ? css.UserHeroChipThemed : css.UserHeroBrightnessHover}
        style={heroMenuItemStyle(
          cardColor && chipSurfaceStyle ? chipSurfaceStyle : {},
          chipHoverBrightness
        )}
      >
        <Text size="B300" truncate>
          {tag.name}
        </Text>
      </Chip>
    </ResponsiveMenu>
  );
}
