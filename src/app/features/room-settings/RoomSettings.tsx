import { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Avatar, Box, config, Icon, IconButton, Icons, IconSrc, MenuItem, Text } from 'folds';
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
import { Permissions } from './permissions';
import { General } from './general';

type RoomSettingsMenuItem = {
  page: RoomSettingsPage;
  name: string;
  icon: IconSrc;
  activeIcon?: IconSrc;
};

const useRoomSettingsMenuItems = (): RoomSettingsMenuItem[] =>
  useMemo(
    () => [
      {
        page: RoomSettingsPage.GeneralPage,
        name: 'General',
        icon: Icons.Setting,
      },
      {
        page: RoomSettingsPage.MembersPage,
        name: 'Members',
        icon: Icons.User,
      },
      {
        page: RoomSettingsPage.PermissionsPage,
        name: 'Permissions',
        icon: Icons.Lock,
      },
      {
        page: RoomSettingsPage.CosmeticsPage,
        name: 'Cosmetics',
        icon: Icons.Alphabet,
        activeIcon: Icons.AlphabetUnderline,
      },
      {
        page: RoomSettingsPage.EmojisStickersPage,
        name: 'Emojis & Stickers',
        icon: Icons.Smile,
      },
      {
        page: RoomSettingsPage.DeveloperToolsPage,
        name: 'Developer Tools',
        icon: Icons.Terminal,
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
                          filled
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
                      <Icon src={Icons.Cross} />
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
                            <Icon src={currentIcon} size="100" filled={activePage === item.page} />
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
