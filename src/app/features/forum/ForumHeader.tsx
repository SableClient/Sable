import type { MouseEventHandler } from 'react';
import { useEffect, useState } from 'react';
import type { RectCords } from 'folds';
import {
  Avatar,
  Badge,
  Box,
  IconButton,
  PopOut,
  Text,
  Tooltip,
  TooltipProvider,
  toRem,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import type { Room } from 'matrix-js-sdk';
import { PageHeader } from '$components/page';
import { useSetSetting, useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useRoomAvatar, useRoomName } from '$hooks/useRoomMeta';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { RoomAvatar } from '$components/room-avatar';
import {
  ArrowLeft,
  composerIcon,
  DotsThreeOutlineVerticalIcon,
  PushPin,
  UserCircle,
} from '$components/icons/phosphor';
import { nameInitials } from '$utils/common';
import type { IPowerLevels } from '$hooks/usePowerLevels';
import { stopPropagation } from '$utils/keyboard';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { BackRouteHandler } from '$components/BackRouteHandler';
import { mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useRoomPinnedEvents } from '$hooks/useRoomPinnedEvents';
import { getPinsHash } from '$utils/room';
import { RoomPinMenu } from '$features/room/room-pin-menu';
import { ForumMenu } from './ForumMenu';
import * as css from './ForumView.css';

type ForumHeaderProps = {
  room: Room;
  showProfile?: boolean;
  powerLevels: IPowerLevels;
};
export function ForumHeader({ room, showProfile, powerLevels }: ForumHeaderProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const setPeopleDrawer = useSetSetting(settingsAtom, 'isPeopleDrawer');
  const [peopleDrawer] = useSetting(settingsAtom, 'isPeopleDrawer');
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const [pinMenuAnchor, setPinMenuAnchor] = useState<RectCords>();
  const screenSize = useScreenSizeContext();
  const pinnedEvents = useRoomPinnedEvents(room);
  const [currentHash, setCurrentHash] = useState('');

  useEffect(() => {
    getPinsHash(pinnedEvents)
      .then(setCurrentHash)
      .catch(() => undefined);
  }, [pinnedEvents]);

  const name = useRoomName(room);
  const avatarMxc = useRoomAvatar(room);
  const avatarUrl = avatarMxc
    ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const handleOpenPinMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setPinMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <PageHeader className={showProfile ? undefined : css.Header} balance>
      <Box grow="Yes" alignItems="Center" gap="200">
        {screenSize === ScreenSize.Mobile ? (
          <>
            <Box shrink="No">
              <BackRouteHandler>
                {(onBack) => (
                  <IconButton fill="None" onClick={onBack}>
                    {composerIcon(ArrowLeft)}
                  </IconButton>
                )}
              </BackRouteHandler>
            </Box>
            <Box grow="Yes" justifyContent="Center">
              {showProfile && (
                <Text size="H3" truncate>
                  {name}
                </Text>
              )}
            </Box>
          </>
        ) : (
          <>
            <Box grow="Yes" basis="No" />
            <Box justifyContent="Center" alignItems="Center" gap="300">
              {showProfile && (
                <>
                  <Avatar size="300">
                    <RoomAvatar
                      roomId={room.roomId}
                      src={avatarUrl}
                      alt={name}
                      renderFallback={() => <Text size="H4">{nameInitials(name)}</Text>}
                    />
                  </Avatar>
                  <Text size="H3" truncate>
                    {name}
                  </Text>
                </>
              )}
            </Box>
          </>
        )}
        <Box
          shrink="No"
          grow={screenSize === ScreenSize.Mobile ? 'No' : 'Yes'}
          basis={screenSize === ScreenSize.Mobile ? 'Yes' : 'No'}
          justifyContent="End"
        >
          <TooltipProvider
            position="Bottom"
            offset={4}
            tooltip={
              <Tooltip>
                <Text>Pinned Messages</Text>
              </Tooltip>
            }
          >
            {(triggerRef) => (
              <IconButton
                fill="None"
                style={{ position: 'relative' }}
                onClick={handleOpenPinMenu}
                ref={triggerRef}
                aria-pressed={!!pinMenuAnchor}
              >
                {pinnedEvents.length > 0 && (
                  <Badge
                    style={{
                      position: 'absolute',
                      left: toRem(3),
                      top: toRem(3),
                    }}
                    variant="Secondary"
                    size="400"
                    fill="Solid"
                    radii="Pill"
                  >
                    <Text as="span" size="L400">
                      {pinnedEvents.length}
                    </Text>
                  </Badge>
                )}
                {composerIcon(PushPin, { weight: pinMenuAnchor ? 'fill' : 'regular' })}
              </IconButton>
            )}
          </TooltipProvider>
          <PopOut
            anchor={pinMenuAnchor}
            position="Bottom"
            content={
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  returnFocusOnDeactivate: false,
                  onDeactivate: () => setPinMenuAnchor(undefined),
                  clickOutsideDeactivates: true,
                  isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                  isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                  escapeDeactivates: stopPropagation,
                }}
              >
                <RoomPinMenu
                  room={room}
                  requestClose={() => setPinMenuAnchor(undefined)}
                  currentHash={currentHash}
                />
              </FocusTrap>
            }
          />
          {screenSize !== ScreenSize.Mobile && (
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>{peopleDrawer ? 'Hide Members' : 'Show Members'}</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton
                  fill="None"
                  ref={triggerRef}
                  onClick={() => setPeopleDrawer((drawer) => !drawer)}
                >
                  {composerIcon(UserCircle, { weight: peopleDrawer ? 'fill' : 'regular' })}
                </IconButton>
              )}
            </TooltipProvider>
          )}
          <TooltipProvider
            position="Bottom"
            align="End"
            offset={4}
            tooltip={
              <Tooltip>
                <Text>More Options</Text>
              </Tooltip>
            }
          >
            {(triggerRef) => (
              <IconButton
                fill="None"
                onClick={handleOpenMenu}
                ref={triggerRef}
                aria-pressed={!!menuAnchor}
              >
                {composerIcon(DotsThreeOutlineVerticalIcon, {
                  weight: menuAnchor ? 'fill' : 'regular',
                })}
              </IconButton>
            )}
          </TooltipProvider>
          <PopOut
            anchor={menuAnchor}
            position="Bottom"
            align="End"
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
                <ForumMenu
                  room={room}
                  powerLevels={powerLevels}
                  requestClose={() => setMenuAnchor(undefined)}
                />
              </FocusTrap>
            }
          />
        </Box>
      </Box>
    </PageHeader>
  );
}
