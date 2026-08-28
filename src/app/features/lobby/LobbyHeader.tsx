import { forwardRef, useState } from 'react';
import { Avatar, Box, IconButton, Line, Menu, MenuItem, Text, Tooltip, config, toRem } from 'folds';
import { TooltipProvider } from '$components/overlay-stack';
import { ResponsiveMenu } from '$components/ResponsiveMenu';
import { useMenuAnchor } from '$hooks/useMenuAnchor';
import { PageHeader } from '$components/page';
import { useSetSetting, useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useRoomAvatar, useRoomName } from '$hooks/useRoomMeta';
import { useSpace } from '$hooks/useSpace';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { RoomAvatar } from '$components/room-avatar';
import {
  ArrowLeft,
  composerIcon,
  DotsThreeOutlineVerticalIcon,
  GearSix,
  menuIcon,
  SignOut,
  UserCircle,
  UserPlus,
} from '$components/icons/phosphor';
import { nameInitials } from '$utils/common';
import type { IPowerLevels } from '$hooks/usePowerLevels';
import { UseStateProvider } from '$components/UseStateProvider';
import { LeaveSpacePrompt } from '$components/leave-space-prompt';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { BackRouteHandler } from '$components/BackRouteHandler';
import { mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { InviteUserPrompt } from '$components/invite-user-prompt';
import * as css from './LobbyHeader.css';
import { useOpenRoomSettings } from '$state/hooks/roomSettings';
import { RoomSettingsPage } from '$state/roomSettings';

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
    const openRoomSettings = useOpenRoomSettings();
    const screenSize = useScreenSizeContext();

    const [invitePrompt, setInvitePrompt] = useState(false);

    const handleInvite = () => {
      setInvitePrompt(true);
    };

    const handleRoomSettings = () => {
      openRoomSettings(space.roomId);
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
            after={menuIcon(UserPlus)}
            radii="300"
            aria-pressed={invitePrompt}
            disabled={!canInvite}
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Invite
            </Text>
          </MenuItem>
          {screenSize !== ScreenSize.Desktop && (
            <MenuItem
              onClick={() => {
                openRoomSettings(space.roomId, undefined, RoomSettingsPage.MembersPage);
                requestClose();
              }}
              size="300"
              after={menuIcon(UserCircle)}
              radii="300"
            >
              <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                Members
              </Text>
            </MenuItem>
          )}
          <MenuItem onClick={handleRoomSettings} size="300" after={menuIcon(GearSix)} radii="300">
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
                  after={menuIcon(SignOut)}
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
  const [peopleDrawer] = useSetting(settingsAtom, 'isPeopleDrawer');
  const menu = useMenuAnchor<HTMLButtonElement>();
  const screenSize = useScreenSizeContext();

  const name = useRoomName(space);
  const avatarMxc = useRoomAvatar(space);
  const avatarUrl = avatarMxc
    ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;

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
        <Box shrink="No" className={css.ActionsBox} justifyContent="End">
          {screenSize === ScreenSize.Desktop && (
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
          <ResponsiveMenu
            anchor={menu.anchor}
            requestClose={menu.close}
            position="Bottom"
            align="End"
            menu={<LobbyMenu powerLevels={powerLevels} requestClose={menu.close} />}
          >
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
                  onClick={menu.triggerProps.onClick}
                  ref={triggerRef}
                  aria-pressed={!!menu.anchor}
                >
                  {composerIcon(DotsThreeOutlineVerticalIcon, {
                    weight: menu.anchor ? 'fill' : 'regular',
                  })}
                </IconButton>
              )}
            </TooltipProvider>
          </ResponsiveMenu>
        </Box>
      </Box>
    </PageHeader>
  );
}
