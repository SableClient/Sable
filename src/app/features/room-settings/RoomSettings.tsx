import { useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import { useAtomValue } from 'jotai';
import { Avatar, Box, config, IconButton, MenuItem, Text } from 'folds';
import { JoinRule } from '$types/matrix-sdk';
import { PageNav, PageNavContent, PageNavHeader, PageRoot } from '$components/page';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { mobileOrTabletLayout } from '$utils/user-agent';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useCachedMxcConverter } from '$hooks/useCachedMxcConverter';
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
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import {
  composerIcon,
  GearSix,
  Info,
  Lock,
  PaintBrush,
  settingsNavIcon,
  Smiley,
  Terminal,
  User,
  X,
} from '$components/icons/phosphor';
import { Permissions } from './permissions';
import { General } from './general';
import { RoomAbbreviations } from './abbreviations/RoomAbbreviations';

type PhosphorIcon = ComponentType<IconProps>;

type RoomSettingsMenuItem = {
  page: RoomSettingsPage;
  name: string;
  icon: PhosphorIcon;
  activeIcon?: PhosphorIcon;
};

const useRoomSettingsMenuItems = (): RoomSettingsMenuItem[] =>
  useMemo(
    () => [
      {
        page: RoomSettingsPage.GeneralPage,
        name: 'General',
        icon: GearSix,
      },
      {
        page: RoomSettingsPage.MembersPage,
        name: 'Members',
        icon: User,
      },
      {
        page: RoomSettingsPage.PermissionsPage,
        name: 'Permissions',
        icon: Lock,
      },
      {
        page: RoomSettingsPage.CosmeticsPage,
        name: 'Cosmetics',
        icon: PaintBrush,
      },
      {
        page: RoomSettingsPage.AbbreviationsPage,
        name: 'Abbreviations',
        icon: Info,
      },
      {
        page: RoomSettingsPage.EmojisStickersPage,
        name: 'Emojis & Stickers',
        icon: Smiley,
      },
      {
        page: RoomSettingsPage.DeveloperToolsPage,
        name: 'Developer Tools',
        icon: Terminal,
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
  const convertMxc = useCachedMxcConverter();
  const mDirects = useAtomValue(mDirectAtom);
  const [customDMCards] = useSetting(settingsAtom, 'customDMCards');

  const roomAvatar = useRoomAvatar(room, mDirects.has(room.roomId) && !customDMCards);
  const roomName = useRoomName(room);
  const joinRuleContent = useRoomJoinRule(room);

  const avatarUrl = roomAvatar
    ? (convertMxc(mx, roomAvatar, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;

  const screenSize = useScreenSizeContext();
  const isPhoneLayout = screenSize === ScreenSize.Mobile || mobileOrTabletLayout();
  const [activePage, setActivePage] = useState<RoomSettingsPage | undefined>(() => {
    if (initialPage) return initialPage;
    return isPhoneLayout ? undefined : RoomSettingsPage.GeneralPage;
  });
  const menuItems = useRoomSettingsMenuItems();

  const handlePageRequestClose = () => {
    if (isPhoneLayout) {
      setActivePage(undefined);
      return;
    }
    requestClose();
  };

  const handleSwipeBack = () => {
    if (isPhoneLayout) {
      requestClose();
    }
  };

  return (
    <SwipeableOverlayWrapper direction="right" onClose={handleSwipeBack}>
      <PageRoot
        nav={
          isPhoneLayout && activePage !== undefined ? undefined : (
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
                  {isPhoneLayout && (
                    <IconButton onClick={requestClose} variant="Background">
                      {composerIcon(X)}
                    </IconButton>
                  )}
                </Box>
              </PageNavHeader>
              <Box grow="Yes" direction="Column">
                <PageNavContent>
                  <div style={{ flexGrow: 1 }}>
                    {menuItems.map((item) => {
                      const active = activePage === item.page;
                      const IconComponent = active && item.activeIcon ? item.activeIcon : item.icon;

                      return (
                        <MenuItem
                          key={item.name}
                          variant="Background"
                          radii="400"
                          aria-pressed={active}
                          before={settingsNavIcon(IconComponent, active)}
                          onClick={() => setActivePage(item.page)}
                        >
                          <Text
                            style={{
                              fontWeight: active ? config.fontWeight.W600 : undefined,
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
        {activePage === RoomSettingsPage.AbbreviationsPage && (
          <RoomAbbreviations requestClose={handlePageRequestClose} />
        )}
      </PageRoot>
    </SwipeableOverlayWrapper>
  );
}
