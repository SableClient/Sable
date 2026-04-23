import { Chip, config, Icon, Icons, Menu, MenuItem, PopOut, RectCords, Text } from 'folds';
import { MouseEventHandler, useState } from 'react';
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
import * as css from './styles.css';

export function CreatorChip({
  backgroundColor,
  innerColor,
  cardColor,
  textColor,
}: {
  backgroundColor?: string;
  innerColor?: string;
  cardColor?: string;
  textColor?: string;
}) {
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
                style={{ backgroundColor: cardColor, color: textColor }}
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
        className={css.UserHeroChip}
        style={{
          backgroundColor: cardColor,
          borderColor: backgroundColor,
          color: textColor,
        }}
      >
        <Text size="B300" truncate>
          {tag.name}
        </Text>
      </Chip>
    </PopOut>
  );
}
