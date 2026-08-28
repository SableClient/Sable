import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { Avatar, Box, Text } from 'folds';
import { JoinRule } from '$types/matrix-sdk';
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
import { SettingsShell, type SectionDescriptor } from '$components/SettingsShell';
import { Members } from '$features/common-settings/members';
import { EmojisStickers } from '$features/common-settings/emojis-stickers';
import { DeveloperTools } from '$features/common-settings/developer-tools';
import { Cosmetics } from '$features/common-settings/cosmetics/Cosmetics';
import { Appearance } from '$features/common-settings/appearance/Appearance';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import {
  GearSix,
  Info,
  Lock,
  PaintBrush,
  Palette,
  Smiley,
  Terminal,
  User,
} from '$components/icons/phosphor';
import { Permissions } from './permissions';
import { General } from './general';
import { RoomAbbreviations } from './abbreviations/RoomAbbreviations';

function makeAbbreviationsComponent(isSpace: boolean) {
  function AbbreviationsWrapper(props: { requestBack?: () => void; requestClose: () => void }) {
    return (
      <RoomAbbreviations
        isSpace={isSpace}
        requestBack={props.requestBack}
        requestClose={props.requestClose}
      />
    );
  }
  return AbbreviationsWrapper;
}

function makeSwipeWrapper(direction: 'left' | 'right' | 'both', onClose: () => void) {
  function SwipeWrapper(children: ReactNode) {
    return (
      <SwipeableOverlayWrapper direction={direction} onClose={onClose}>
        {children}
      </SwipeableOverlayWrapper>
    );
  }
  return SwipeWrapper;
}

/** String keys for room settings sections. */
type RoomSectionId =
  | 'general'
  | 'members'
  | 'permissions'
  | 'cosmetics'
  | 'abbreviations'
  | 'emojis-stickers'
  | 'developer-tools'
  | 'appearance';

const roomSectionIds: readonly RoomSectionId[] = [
  'general',
  'members',
  'permissions',
  'cosmetics',
  'abbreviations',
  'emojis-stickers',
  'developer-tools',
];

const pageToSectionId: Record<RoomSettingsPage, RoomSectionId> = {
  [RoomSettingsPage.GeneralPage]: 'general',
  [RoomSettingsPage.MembersPage]: 'members',
  [RoomSettingsPage.PermissionsPage]: 'permissions',
  [RoomSettingsPage.CosmeticsPage]: 'cosmetics',
  [RoomSettingsPage.AbbreviationsPage]: 'abbreviations',
  [RoomSettingsPage.EmojisStickersPage]: 'emojis-stickers',
  [RoomSettingsPage.DeveloperToolsPage]: 'developer-tools',
  [RoomSettingsPage.AppearancePage]: 'appearance',
};

const sectionIdToPage: Record<RoomSectionId, RoomSettingsPage> = {
  general: RoomSettingsPage.GeneralPage,
  members: RoomSettingsPage.MembersPage,
  permissions: RoomSettingsPage.PermissionsPage,
  cosmetics: RoomSettingsPage.CosmeticsPage,
  abbreviations: RoomSettingsPage.AbbreviationsPage,
  'emojis-stickers': RoomSettingsPage.EmojisStickersPage,
  'developer-tools': RoomSettingsPage.DeveloperToolsPage,
  appearance: RoomSettingsPage.AppearancePage,
};

type RoomSettingsProps = {
  initialPage?: RoomSettingsPage;
  openedViaSwipe?: boolean;
  requestClose: () => void;
};

export function RoomSettings({ initialPage, openedViaSwipe, requestClose }: RoomSettingsProps) {
  const room = useRoom();
  const isSpace = room.isSpaceRoom();
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const mDirects = useAtomValue(mDirectAtom);
  const [customDMCards] = useSetting(settingsAtom, 'customDMCards');

  const roomAvatar = useRoomAvatar(room, mDirects.has(room.roomId) && !customDMCards);
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

  const activeSection: RoomSectionId | null =
    activePage !== undefined ? pageToSectionId[activePage] : null;

  const handlePageRequestClose = () => {
    if (screenSize === ScreenSize.Mobile) {
      setActivePage(undefined);
      return;
    }
    requestClose();
  };

  const handleSwipeBack = () => {
    if (screenSize !== ScreenSize.Mobile) return;
    if (openedViaSwipe) {
      requestClose();
      return;
    }
    if (activePage !== undefined) {
      setActivePage(undefined);
      return;
    }
    requestClose();
  };

  const sections = useMemo<Record<RoomSectionId, SectionDescriptor>>(() => {
    const result: Record<RoomSectionId, SectionDescriptor> = {
      general: { label: 'General', icon: GearSix, Component: General },
      members: { label: 'Members', icon: User, Component: Members },
      permissions: { label: 'Permissions', icon: Lock, Component: Permissions },
      cosmetics: { label: 'Cosmetics', icon: PaintBrush, Component: Cosmetics },
      abbreviations: {
        label: 'Abbreviations',
        icon: Info,
        Component: makeAbbreviationsComponent(isSpace),
      },
      'emojis-stickers': {
        label: 'Emojis & Stickers',
        icon: Smiley,
        Component: EmojisStickers,
      },
      'developer-tools': {
        label: 'Developer Tools',
        icon: Terminal,
        Component: DeveloperTools,
      },
      appearance: {
        label: 'Appearance',
        icon: Palette,
        Component: Appearance,
        visible: isSpace,
      },
    };
    return result;
  }, [isSpace]);

  const visibleSectionIds = useMemo<RoomSectionId[]>(() => {
    const ids = [...roomSectionIds];
    if (isSpace) ids.push('appearance');
    return ids;
  }, [isSpace]);

  const renderHeader = (closeButton: ReactNode): ReactNode => (
    <>
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
      <Box shrink="No">{closeButton}</Box>
    </>
  );

  const swipeWrapper = makeSwipeWrapper(openedViaSwipe ? 'both' : 'right', handleSwipeBack);

  return (
    <SettingsShell<RoomSectionId>
      sections={sections}
      sectionIds={visibleSectionIds}
      active={activeSection}
      onSelect={(id) => setActivePage(sectionIdToPage[id])}
      onBack={handlePageRequestClose}
      requestClose={requestClose}
      renderHeader={renderHeader}
      showCloseInHeader={screenSize === ScreenSize.Mobile}
      mobileDrawer={false}
      wrapper={swipeWrapper}
    />
  );
}
