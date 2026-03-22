import { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Avatar, Box, config, IconButton, MenuItem, Text } from 'folds';
import { GearIcon } from '@phosphor-icons/react/dist/csr/Gear';
import { LockIcon } from '@phosphor-icons/react/dist/csr/Lock';
import { SmileyIcon } from '@phosphor-icons/react/dist/csr/Smiley';
import { TerminalIcon } from '@phosphor-icons/react/dist/csr/Terminal';
import { TextAaIcon } from '@phosphor-icons/react/dist/csr/TextAa';
import { UserIcon } from '@phosphor-icons/react/dist/csr/User';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import type { IconProps } from '@phosphor-icons/react';
import { JoinRule } from '$types/matrix-sdk';
import { PageNav, PageNavContent, PageNavHeader, PageRoot } from '$components/page';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useRoomAvatar, useRoomJoinRule, useRoomName } from '$hooks/useRoomMeta';
import { mDirectAtom } from '$state/mDirectList';
import { RoomAvatar, RoomIcon } from '$components/room-avatar';
import { RoomSettingsPage } from '$state/roomSettings';
import { useRoom } from '$hooks/useRoom';
import { SwipeableOverlayWrapper } from '$components/SwipeableOverlayWrapper';
import { Members } from '$features/common-settings/members';
import { EmojisStickers } from '$features/common-settings/emojis-stickers';
import { DeveloperTools } from '$features/common-settings/developer-tools';
import { Cosmetics } from '$features/common-settings/cosmetics/Cosmetics';
import { PhosphorIcon } from '$components/PhosphorIcon';
import { Permissions } from './permissions';
import { General } from './general';

type RoomSettingsMenuItem = {
  page: RoomSettingsPage;
  name: string;
  icon: React.ComponentType<IconProps>;
  activeIcon?: React.ComponentType<IconProps>;
};

const useRoomSettingsMenuItems = (): RoomSettingsMenuItem[] =>
  useMemo(
    () => [
      {
        page: RoomSettingsPage.GeneralPage,
        name: 'General',
        icon: GearIcon,
      },
      {
        page: RoomSettingsPage.MembersPage,
        name: 'Members',
        icon: UserIcon,
      },
      {
        page: RoomSettingsPage.PermissionsPage,
        name: 'Permissions',
        icon: LockIcon,
      },
      {
        page: RoomSettingsPage.CosmeticsPage,
        name: 'Cosmetics',
        icon: TextAaIcon,
      },
      {
        page: RoomSettingsPage.EmojisStickersPage,
        name: 'Emojis & Stickers',
        icon: SmileyIcon,
      },
      {
        page: RoomSettingsPage.DeveloperToolsPage,
        name: 'Developer Tools',
        icon: TerminalIcon,
      },
    ],
    []
  );

type RoomSettingsProps = {
  initialPage?: RoomSettingsPage;
  requestClose: () => void;
};

export function RoomSettings({ initialPage, requestClose }: RoomSettingsProps) {
  const room = useRoom();
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const mDirects = useAtomValue(mDirectAtom);

  const roomAvatar = useRoomAvatar(room, mDirects.has(room.roomId));
  const roomName = useRoomName(room);
  const joinRuleContent = useRoomJoinRule(room);

  const avatarUrl = roomAvatar
    ? (mxcUrlToHttp(mx, roomAvatar, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;

  const screenSize = useScreenSizeContext();
  const [activePage, setActivePage] = useState<RoomSettingsPage | undefined>(() => {
    if (initialPage) return initialPage;
    return screenSize === ScreenSize.Mobile ? undefined : RoomSettingsPage.GeneralPage;
  });
  const menuItems = useRoomSettingsMenuItems();

  const handlePageRequestClose = () => {
    if (screenSize === ScreenSize.Mobile) {
      setActivePage(undefined);
      return;
    }
    requestClose();
  };

  const handleSwipeBack = () => {
    if (screenSize === ScreenSize.Mobile) {
      requestClose();
    }
  };

  return (
    <SwipeableOverlayWrapper direction="right" onClose={handleSwipeBack}>
      <PageRoot
        nav={
          screenSize === ScreenSize.Mobile && activePage !== undefined ? undefined : (
            <PageNav size="300">
              <PageNavHeader outlined={false}>
                <Box grow="Yes" gap="200">
                  <Avatar size="200" radii="300">
                    <RoomAvatar
                      roomId={room.roomId}
                      src={avatarUrl}
                      alt={roomName}
                      renderFallback={() => (
                        <RoomIcon
                          size="50"
                          roomType={room.getType()}
                          joinRule={joinRuleContent?.join_rule ?? JoinRule.Invite}
                          weight="fill"
                        />
                      )}
                    />
                  </Avatar>
                  <Text size="H4" truncate>
                    {roomName}
                  </Text>
                </Box>
                <Box shrink="No">
                  {screenSize === ScreenSize.Mobile && (
                    <IconButton onClick={requestClose} variant="Background">
                      <PhosphorIcon as={XIcon} weight="fill" />
                    </IconButton>
                  )}
                </Box>
              </PageNavHeader>
              <Box grow="Yes" direction="Column">
                <PageNavContent>
                  <div style={{ flexGrow: 1 }}>
                    {menuItems.map((item) => {
                      const currentIcon =
                        activePage === item.page && item.activeIcon ? item.activeIcon : item.icon;

                      return (
                        <MenuItem
                          key={item.name}
                          variant="Background"
                          radii="400"
                          aria-pressed={activePage === item.page}
                          before={
                            <PhosphorIcon
                              as={currentIcon}
                              size="50"
                              weight={activePage === item.page ? 'fill' : 'regular'}
                            />
                          }
                          onClick={() => setActivePage(item.page)}
                        >
                          <Text
                            style={{
                              fontWeight:
                                activePage === item.page ? config.fontWeight.W600 : undefined,
                            }}
                            size="T300"
                            truncate
                          >
                            {item.name}
                          </Text>
                        </MenuItem>
                      );
                    })}
                  </div>
                </PageNavContent>
              </Box>
            </PageNav>
          )
        }
      >
        {activePage === RoomSettingsPage.GeneralPage && (
          <General requestClose={handlePageRequestClose} />
        )}
        {activePage === RoomSettingsPage.MembersPage && (
          <Members requestClose={handlePageRequestClose} />
        )}
        {activePage === RoomSettingsPage.PermissionsPage && (
          <Permissions requestClose={handlePageRequestClose} />
        )}
        {activePage === RoomSettingsPage.CosmeticsPage && (
          <Cosmetics requestClose={handlePageRequestClose} />
        )}
        {activePage === RoomSettingsPage.EmojisStickersPage && (
          <EmojisStickers requestClose={handlePageRequestClose} />
        )}
        {activePage === RoomSettingsPage.DeveloperToolsPage && (
          <DeveloperTools requestClose={handlePageRequestClose} />
        )}
      </PageRoot>
    </SwipeableOverlayWrapper>
  );
}
