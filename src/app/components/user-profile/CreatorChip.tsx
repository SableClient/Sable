import type { RectCords } from 'folds';
import { Chip, config, Icon, Icons, Menu, MenuItem, PopOut, Text } from 'folds';
import type { CSSProperties } from 'react';
import type { MouseEventHandler } from 'react';
import { useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { isKeyHotkey } from 'is-hotkey';
import { useRoomCreatorsTag } from '$hooks/useRoomCreatorsTag';
import { getPowerTagIconSrc } from '$hooks/useMemberPowerTag';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { stopPropagation } from '$utils/keyboard';
import { useRoom } from '$hooks/useRoom';
import { useSpaceOptionally } from '$hooks/useSpace';
import { useOpenRoomSettings } from '$state/hooks/roomSettings';
import { useOpenSpaceSettings } from '$state/hooks/spaceSettings';
import { SpaceSettingsPage } from '$state/spaceSettings';
import { RoomSettingsPage } from '$state/roomSettings';
import { PowerColorBadge, PowerIcon } from '$components/power';
import { heroMenuItemStyle } from './heroMenuItemStyle';
import * as css from './styles.css';

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
  const openSpaceSettings = useOpenSpaceSettings();

  const [cords, setCords] = useState<RectCords>();
  const tag = useRoomCreatorsTag();
  const tagIconSrc = tag.icon && getPowerTagIconSrc(mx, useAuthentication, tag.icon);

  const open: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  const close = () => setCords(undefined);

  return (
    <PopOut
      anchor={cords}
      position="Bottom"
      align="Start"
      offset={4}
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: close,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
            isKeyForward: (evt: KeyboardEvent) => isKeyHotkey('arrowdown', evt),
            isKeyBackward: (evt: KeyboardEvent) => isKeyHotkey('arrowup', evt),
          }}
        >
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
                  if (room.isSpaceRoom()) {
                    openSpaceSettings(
                      room.roomId,
                      space?.roomId,
                      SpaceSettingsPage.PermissionsPage
                    );
                  } else {
                    openRoomSettings(room.roomId, space?.roomId, RoomSettingsPage.PermissionsPage);
                  }
                  close();
                }}
              >
                <Text size="B300">Manage Powers</Text>
              </MenuItem>
            </div>
          </Menu>
        </FocusTrap>
      }
    >
      <Chip
        variant={cardColor ? undefined : 'Success'}
        outlined={!cardColor}
        radii="Pill"
        before={
          cords ? (
            <Icon size="50" src={Icons.ChevronBottom} />
          ) : (
            <PowerColorBadge color={tag.color} />
          )
        }
        after={tagIconSrc ? <PowerIcon size="50" iconSrc={tagIconSrc} /> : undefined}
        onClick={open}
        aria-pressed={!!cords}
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
    </PopOut>
  );
}
