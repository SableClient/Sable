import type { RectCords } from 'folds';
import {
  Box,
  Button,
  Chip,
  config,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Line,
  Menu,
  MenuItem,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  Spinner,
  Text,
  toRem,
} from 'folds';
import type { CSSProperties } from 'react';
import type { MouseEventHandler } from 'react';
import { useCallback, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { isKeyHotkey } from 'is-hotkey';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useGetMemberPowerLevel, usePowerLevels } from '$hooks/usePowerLevels';
import { getPowers, usePowerLevelTags } from '$hooks/usePowerLevelTags';
import { stopPropagation } from '$utils/keyboard';

import { useOpenRoomSettings } from '$state/hooks/roomSettings';
import { RoomSettingsPage } from '$state/roomSettings';
import { useRoom } from '$hooks/useRoom';
import { useSpaceOptionally } from '$hooks/useSpace';
import { useOpenSpaceSettings } from '$state/hooks/spaceSettings';
import { SpaceSettingsPage } from '$state/spaceSettings';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { BreakWord } from '$styles/Text.css';
import { getPowerTagIconSrc, useGetMemberPowerTag } from '$hooks/useMemberPowerTag';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { useMemberPowerCompare } from '$hooks/useMemberPowerCompare';
import { CutoutCard } from '$components/cutout-card';
import { PowerColorBadge, PowerIcon } from '$components/power';
import { EventType } from '$types/matrix-sdk';
import { heroMenuItemStyle } from './heroMenuItemStyle';
import * as css from './styles.css';

type SelfDemoteAlertProps = {
  power: number;
  onCancel: () => void;
  onChange: (power: number) => void;
};
function SelfDemoteAlert({ power, onCancel, onChange }: SelfDemoteAlertProps) {
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onCancel,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface">
            <Header
              style={{ padding: `0 ${config.space.S200} 0 ${config.space.S400}` }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Self Demotion</Text>
              </Box>
              <IconButton size="300" onClick={onCancel} radii="300">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400, paddingTop: 0 }} direction="Column" gap="500">
              <Box direction="Column" gap="200">
                <Text priority="400">
                  You are about to demote yourself! You will not be able to regain this power
                  yourself. Are you sure?
                </Text>
              </Box>
              <Box direction="Column" gap="200">
                <Button type="submit" variant="Warning" onClick={() => onChange(power)}>
                  <Text size="B400">Demote</Text>
                </Button>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

type SharedPowerAlertProps = {
  power: number;
  onCancel: () => void;
  onChange: (power: number) => void;
};
function SharedPowerAlert({ power, onCancel, onChange }: SharedPowerAlertProps) {
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onCancel,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface">
            <Header
              style={{ padding: `0 ${config.space.S200} 0 ${config.space.S400}` }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Shared Power</Text>
              </Box>
              <IconButton size="300" onClick={onCancel} radii="300">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400, paddingTop: 0 }} direction="Column" gap="500">
              <Box direction="Column" gap="200">
                <Text priority="400">
                  You are promoting the user to have the same power as yourself! You will not be
                  able to change their power afterward. Are you sure?
                </Text>
              </Box>
              <Box direction="Column" gap="200">
                <Button type="submit" variant="Warning" onClick={() => onChange(power)}>
                  <Text size="B400">Promote</Text>
                </Button>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

export function PowerChip({
  userId,
  innerColor,
  cardColor,
  textColor,
  chipSurfaceStyle,
  chipFillColor,
  chipHoverBrightness,
}: {
  userId: string;
  innerColor?: string;
  cardColor?: string;
  textColor?: string;
  chipSurfaceStyle?: CSSProperties;
  chipFillColor?: string;
  chipHoverBrightness?: number;
}) {
  const menuItemBg = chipFillColor ?? cardColor;
  const mx = useMatrixClient();
  const room = useRoom();
  const space = useSpaceOptionally();
  const useAuthentication = useMediaAuthentication();
  const openRoomSettings = useOpenRoomSettings();
  const openSpaceSettings = useOpenSpaceSettings();

  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const getMemberPowerLevel = useGetMemberPowerLevel(powerLevels);
  const { hasMorePower } = useMemberPowerCompare(creators, powerLevels);

  const powerLevelTags = usePowerLevelTags(room, powerLevels);
  const getMemberPowerTag = useGetMemberPowerTag(room, creators, powerLevels);

  const myUserId = mx.getSafeUserId();
  const canChangePowers =
    permissions.stateEvent(EventType.RoomPowerLevels, myUserId) &&
    (myUserId === userId ? true : hasMorePower(myUserId, userId));

  const tag = getMemberPowerTag(userId);
  const tagIconSrc = tag.icon && getPowerTagIconSrc(mx, useAuthentication, tag.icon);

  const [cords, setCords] = useState<RectCords>();

  const open: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  const close = () => setCords(undefined);

  const [powerState, changePower] = useAsyncCallback<undefined, Error, [number]>(
    useCallback(
      async (power: number) => {
        await mx.setPowerLevel(room.roomId, userId, power);
      },
      [mx, userId, room]
    )
  );
  const changing = powerState.status === AsyncStatus.Loading;
  const error = powerState.status === AsyncStatus.Error;
  const [selfDemote, setSelfDemote] = useState<number>();
  const [sharedPower, setSharedPower] = useState<number>();

  const handlePowerSelect = (power: number): void => {
    close();
    if (!canChangePowers) return;
    if (power === getMemberPowerLevel(userId)) return;

    if (userId === mx.getSafeUserId()) {
      setSelfDemote(power);
      return;
    }
    if (!creators.has(myUserId) && power === getMemberPowerLevel(myUserId)) {
      setSharedPower(power);
      return;
    }

    changePower(power);
  };

  const handleSelfDemote = (power: number) => {
    setSelfDemote(undefined);
    changePower(power);
  };
  const handleSharedPower = (power: number) => {
    setSharedPower(undefined);
    changePower(power);
  };

  return (
    <>
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
              <Box
                direction="Column"
                gap="100"
                style={{
                  padding: config.space.S100,
                  maxWidth: toRem(200),
                  backgroundColor: innerColor,
                }}
              >
                {error && (
                  <CutoutCard style={{ padding: config.space.S200 }} variant="Critical">
                    <Text size="L400">Error: {powerState.error.name}</Text>
                    <Text className={BreakWord} size="T200">
                      {powerState.error.message}
                    </Text>
                  </CutoutCard>
                )}
                {getPowers(powerLevelTags).map((power) => {
                  const powerTag = powerLevelTags[power]!;
                  const powerTagIconSrc =
                    powerTag.icon && getPowerTagIconSrc(mx, useAuthentication, powerTag.icon);

                  const selected = getMemberPowerLevel(userId) === power;
                  const canAssignPower = creators.has(myUserId)
                    ? true
                    : power <= getMemberPowerLevel(myUserId);

                  return (
                    <MenuItem
                      key={power}
                      variant={selected ? 'Primary' : 'Surface'}
                      fill="None"
                      size="300"
                      radii="300"
                      aria-disabled={changing || !canChangePowers || !canAssignPower}
                      aria-pressed={selected}
                      className={css.UserHeroMenuItem}
                      style={heroMenuItemStyle(
                        { backgroundColor: menuItemBg, color: textColor },
                        chipHoverBrightness
                      )}
                      before={<PowerColorBadge color={powerTag.color} />}
                      after={
                        powerTagIconSrc ? (
                          <PowerIcon size="50" iconSrc={powerTagIconSrc} />
                        ) : undefined
                      }
                      onClick={
                        canChangePowers && canAssignPower
                          ? () => handlePowerSelect(power)
                          : undefined
                      }
                    >
                      <Text size="B300">{powerTag.name}</Text>
                    </MenuItem>
                  );
                })}
              </Box>
              <Line size="300" color={textColor} />
              <div style={{ padding: config.space.S100, backgroundColor: innerColor }}>
                <MenuItem
                  variant="Surface"
                  fill="None"
                  size="300"
                  radii="300"
                  className={css.UserHeroMenuItem}
                  style={heroMenuItemStyle(
                    { backgroundColor: menuItemBg, color: textColor },
                    chipHoverBrightness
                  )}
                  onClick={() => {
                    if (room.isSpaceRoom()) {
                      openSpaceSettings(
                        room.roomId,
                        space?.roomId,
                        SpaceSettingsPage.PermissionsPage
                      );
                    } else {
                      openRoomSettings(
                        room.roomId,
                        space?.roomId,
                        RoomSettingsPage.PermissionsPage
                      );
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
          variant={error ? 'Critical' : cardColor ? undefined : 'SurfaceVariant'}
          radii="Pill"
          className={
            error ? undefined : cardColor ? css.UserHeroChipThemed : css.UserHeroBrightnessHover
          }
          style={
            error
              ? undefined
              : heroMenuItemStyle(
                  cardColor && chipSurfaceStyle ? chipSurfaceStyle : {},
                  chipHoverBrightness
                )
          }
          before={
            cords ? (
              <Icon size="50" src={Icons.ChevronBottom} />
            ) : (
              <>
                {!changing && <PowerColorBadge color={tag.color} />}
                {changing && <Spinner size="50" variant="Secondary" fill="Soft" />}
              </>
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
      {typeof selfDemote === 'number' ? (
        <SelfDemoteAlert
          power={selfDemote}
          onCancel={() => setSelfDemote(undefined)}
          onChange={handleSelfDemote}
        />
      ) : null}
      {typeof sharedPower === 'number' ? (
        <SharedPowerAlert
          power={sharedPower}
          onCancel={() => setSharedPower(undefined)}
          onChange={handleSharedPower}
        />
      ) : null}
    </>
  );
}
