import { Chip, config, Menu, MenuItem, PopOut, RectCords, Text } from 'folds';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
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
import { PhosphorIcon } from '$components/PhosphorIcon';

export function CreatorChip() {
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
            <div style={{ padding: config.space.S100 }}>
              <MenuItem
                variant="Surface"
                fill="None"
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
        variant="Success"
        outlined
        radii="Pill"
        before={
          cords ? (
            <PhosphorIcon size="50" as={CaretDownIcon} />
          ) : (
            <PowerColorBadge color={tag.color} />
          )
        }
        after={tagIconSrc ? <PowerIcon size="50" iconSrc={tagIconSrc} /> : undefined}
        onClick={open}
        aria-pressed={!!cords}
      >
        <Text size="B300" truncate>
          {tag.name}
        </Text>
      </Chip>
    </PopOut>
  );
}
