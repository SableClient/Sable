import { MouseEventHandler, forwardRef, useState } from 'react';
import {
  Avatar,
  Box,
  IconButton,
  Line,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
  Tooltip,
  TooltipProvider,
  config,
  toRem,
} from 'folds';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { DotsThreeVerticalIcon } from '@phosphor-icons/react/dist/csr/DotsThreeVertical';
import { GearIcon } from '@phosphor-icons/react/dist/csr/Gear';
import { SignOutIcon } from '@phosphor-icons/react/dist/csr/SignOut';
import { UserIcon } from '@phosphor-icons/react/dist/csr/User';
import { UserPlusIcon } from '@phosphor-icons/react/dist/csr/UserPlus';
import FocusTrap from 'focus-trap-react';
import { PageHeader } from '$components/page';
import { useSetSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useRoomAvatar, useRoomName } from '$hooks/useRoomMeta';
import { useSpace } from '$hooks/useSpace';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { RoomAvatar } from '$components/room-avatar';
import { nameInitials } from '$utils/common';
import { IPowerLevels } from '$hooks/usePowerLevels';
import { UseStateProvider } from '$components/UseStateProvider';
import { LeaveSpacePrompt } from '$components/leave-space-prompt';
import { stopPropagation } from '$utils/keyboard';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { BackRouteHandler } from '$components/BackRouteHandler';
import { mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useOpenSpaceSettings } from '$state/hooks/spaceSettings';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { InviteUserPrompt } from '$components/invite-user-prompt';
import { PhosphorIcon } from '$components/PhosphorIcon';
import * as css from './LobbyHeader.css';

type LobbyMenuProps = {
  powerLevels: IPowerLevels;
  requestClose: () => void;
};
const LobbyMenu = forwardRef<HTMLDivElement, LobbyMenuProps>(
  ({ powerLevels, requestClose }, ref) => {
    const mx = useMatrixClient();
    const space = useSpace();
    const creators = useRoomCreators(space);

    const permissions = useRoomPermissions(creators, powerLevels);
    const canInvite = permissions.action('invite', mx.getSafeUserId());
    const openSpaceSettings = useOpenSpaceSettings();

    const [invitePrompt, setInvitePrompt] = useState(false);

    const handleInvite = () => {
      setInvitePrompt(true);
    };

    const handleRoomSettings = () => {
      openSpaceSettings(space.roomId);
      requestClose();
    };

    return (
      <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
        {invitePrompt && (
          <InviteUserPrompt
            room={space}
            requestClose={() => {
              setInvitePrompt(false);
              requestClose();
            }}
          />
        )}
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <MenuItem
            onClick={handleInvite}
            variant="Primary"
            fill="None"
            size="300"
            after={<PhosphorIcon as={UserPlusIcon} size="100" />}
            radii="300"
            aria-pressed={invitePrompt}
            disabled={!canInvite}
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Invite
            </Text>
          </MenuItem>
          <MenuItem
            onClick={handleRoomSettings}
            size="300"
            after={<PhosphorIcon as={GearIcon} size="100" />}
            radii="300"
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Space Settings
            </Text>
          </MenuItem>
        </Box>
        <Line variant="Surface" size="300" />
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <UseStateProvider initial={false}>
            {(promptLeave, setPromptLeave) => (
              <>
                <MenuItem
                  onClick={() => setPromptLeave(true)}
                  variant="Critical"
                  fill="None"
                  size="300"
                  after={<PhosphorIcon as={SignOutIcon} size="100" />}
                  radii="300"
                  aria-pressed={promptLeave}
                >
                  <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                    Leave Space
                  </Text>
                </MenuItem>
                {promptLeave && (
                  <LeaveSpacePrompt
                    roomId={space.roomId}
                    onDone={requestClose}
                    onCancel={() => setPromptLeave(false)}
                  />
                )}
              </>
            )}
          </UseStateProvider>
        </Box>
      </Menu>
    );
  }
);

type LobbyHeaderProps = {
  showProfile?: boolean;
  powerLevels: IPowerLevels;
};
export function LobbyHeader({ showProfile, powerLevels }: LobbyHeaderProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const space = useSpace();
  const setPeopleDrawer = useSetSetting(settingsAtom, 'isPeopleDrawer');
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const screenSize = useScreenSizeContext();

  const name = useRoomName(space);
  const avatarMxc = useRoomAvatar(space);
  const avatarUrl = avatarMxc
    ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
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
                    <PhosphorIcon as={ArrowLeftIcon} />
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
                      roomId={space.roomId}
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
          {screenSize !== ScreenSize.Mobile && (
            <TooltipProvider
              position="Bottom"
              offset={4}
              tooltip={
                <Tooltip>
                  <Text>Members</Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton
                  fill="None"
                  ref={triggerRef}
                  onClick={() => setPeopleDrawer((drawer) => !drawer)}
                >
                  <PhosphorIcon as={UserIcon} size="400" />
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
                <PhosphorIcon
                  as={DotsThreeVerticalIcon}
                  size="400"
                  weight={menuAnchor ? 'fill' : 'regular'}
                />
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
                <LobbyMenu
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
