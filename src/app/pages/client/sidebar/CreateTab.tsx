import type { MouseEventHandler } from 'react';
import { useState } from 'react';
import type { RectCords } from 'folds';
import { Box, config, Menu, PopOut, Text } from 'folds';
import FocusTrap from 'focus-trap-react';
import { useNavigate } from 'react-router-dom';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '$components/sidebar';
import { stopPropagation } from '$utils/keyboard';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { ContainerColor } from '$styles/ContainerColor.css';
import {
  encodeSearchParamValueArray,
  getCreatePath,
  getExploreFeaturedPath,
  getExplorePath,
  getExploreServerPath,
  getSpacePath,
  joinPathComponent,
  withSearchParam,
} from '$pages/pathUtils';
import { useCreateSelected } from '$hooks/router/useCreateSelected';
import { JoinAddressPrompt } from '$components/join-address-prompt';
import {
  composerIcon,
  Link,
  getPhosphorSize,
  SquaresFour,
  Compass,
  MagnifyingGlass,
  UsersThree,
} from '$components/icons/phosphor';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useClientConfig } from '$hooks/useClientConfig';
import { useAtom, useAtomValue } from 'jotai';
import { useNavToActivePathAtom } from '$state/hooks/navToActivePath';
import { getMxIdServer } from '$utils/mxIdHelper';
import { useExploreSelected } from '$hooks/router/useExploreSelected';
import { searchModalAtom } from '$state/searchModal';

export function CreateTab() {
  const mx = useMatrixClient();
  const screenSize = useScreenSizeContext();
  const clientConfig = useClientConfig();
  const navToActivePath = useAtomValue(useNavToActivePathAtom());
  const createSelected = useCreateSelected();
  const exploreSelected = useExploreSelected();
  const [searchRoom, setSearchRoom] = useAtom(searchModalAtom);

  const navigate = useNavigate();
  const [menuCords, setMenuCords] = useState<RectCords>();
  const [joinAddress, setJoinAddress] = useState(false);
  const isSelected = createSelected || exploreSelected || joinAddress || searchRoom;

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(menuCords ? undefined : evt.currentTarget.getBoundingClientRect());
  };

  const handleCreateSpace = () => {
    navigate(getCreatePath());
    setMenuCords(undefined);
  };

  const handleJoinWithAddress = () => {
    setJoinAddress(true);
    setMenuCords(undefined);
  };

  const handleExploreClick = () => {
    if (screenSize === ScreenSize.Mobile) {
      navigate(getExplorePath());
      setMenuCords(undefined);
      return;
    }

    const activePath = navToActivePath.get('explore');
    if (activePath) {
      navigate(joinPathComponent(activePath));
      setMenuCords(undefined);
      return;
    }

    if (clientConfig.featuredCommunities?.openAsDefault) {
      navigate(getExploreFeaturedPath());
      setMenuCords(undefined);
      return;
    }
    const userId = mx.getUserId();
    const userServer = userId ? getMxIdServer(userId) : undefined;
    if (userServer) {
      navigate(getExploreServerPath(userServer));
      setMenuCords(undefined);
      return;
    }
    navigate(getExplorePath());
    setMenuCords(undefined);
  };
  const openSearchRoom = () => {
    setSearchRoom(true);
    setMenuCords(undefined);
  };

  return (
    <SidebarItem active={isSelected}>
      <SidebarItemTooltip tooltip="Add Space">
        {(triggerRef) => (
          <PopOut
            anchor={menuCords}
            position="Right"
            align="Center"
            content={
              <FocusTrap
                focusTrapOptions={{
                  returnFocusOnDeactivate: false,
                  initialFocus: false,
                  onDeactivate: () => setMenuCords(undefined),
                  clickOutsideDeactivates: true,
                  isKeyForward: (evt: KeyboardEvent) =>
                    evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
                  isKeyBackward: (evt: KeyboardEvent) =>
                    evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Menu>
                  <Box direction="Column">
                    <SequenceCard
                      style={{ padding: config.space.S300 }}
                      variant="Surface"
                      direction="Column"
                      gap="100"
                      radii="0"
                      as="button"
                      type="button"
                      onClick={handleCreateSpace}
                    >
                      <SettingTile before={composerIcon(SquaresFour)}>
                        <Text size="H6">Create a New Community Space</Text>
                      </SettingTile>
                    </SequenceCard>
                    <SequenceCard
                      style={{ padding: config.space.S300 }}
                      variant="Surface"
                      direction="Column"
                      gap="100"
                      radii="0"
                      as="button"
                      type="button"
                      onClick={handleJoinWithAddress}
                    >
                      <SettingTile before={composerIcon(Link)}>
                        <Text size="H6">Join Community via Address</Text>
                      </SettingTile>
                    </SequenceCard>
                    <SequenceCard
                      style={{ padding: config.space.S300 }}
                      variant="Surface"
                      direction="Column"
                      gap="100"
                      radii="0"
                      as="button"
                      type="button"
                      onClick={handleExploreClick}
                    >
                      <SettingTile before={composerIcon(UsersThree)}>
                        <Text size="H6">Explore Recommended Communities</Text>
                      </SettingTile>
                    </SequenceCard>
                    <SequenceCard
                      style={{ padding: config.space.S300 }}
                      variant="Surface"
                      direction="Column"
                      gap="100"
                      radii="0"
                      as="button"
                      type="button"
                      onClick={openSearchRoom}
                    >
                      <SettingTile before={composerIcon(MagnifyingGlass)}>
                        <Text size="H6">Search amongst Your Rooms</Text>
                      </SettingTile>
                    </SequenceCard>
                  </Box>
                </Menu>
              </FocusTrap>
            }
          >
            <SidebarAvatar
              className={menuCords ? ContainerColor({ variant: 'Surface' }) : undefined}
              as="button"
              ref={triggerRef}
              outlined
              onClick={handleMenu}
            >
              {(searchRoom && <MagnifyingGlass size={getPhosphorSize().toolbar} weight="fill" />) ||
                (joinAddress && <Link size={getPhosphorSize().toolbar} />) ||
                (exploreSelected && (
                  <UsersThree size={getPhosphorSize().toolbar} weight="fill" />
                )) ||
                (createSelected && (
                  <SquaresFour size={getPhosphorSize().toolbar} weight="fill" />
                )) || <Compass size={getPhosphorSize().toolbar} />}
            </SidebarAvatar>
            {joinAddress && (
              <JoinAddressPrompt
                onCancel={() => setJoinAddress(false)}
                onOpen={(roomIdOrAlias, viaServers) => {
                  setJoinAddress(false);
                  const path = getSpacePath(roomIdOrAlias);
                  navigate(
                    viaServers
                      ? withSearchParam(path, {
                          viaServers: encodeSearchParamValueArray(viaServers),
                        })
                      : path
                  );
                }}
              />
            )}
          </PopOut>
        )}
      </SidebarItemTooltip>
    </SidebarItem>
  );
}
