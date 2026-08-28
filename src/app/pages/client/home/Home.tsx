import { forwardRef, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Avatar, Box, Button, MenuItem, Text, toRem } from 'folds';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAtom, useAtomValue } from 'jotai';
import { factoryRoomIdByActivity, factoryRoomIdByAtoZ } from '$utils/sort';
import {
  NavButton,
  NavCategory,
  NavCategoryHeader,
  NavEmptyCenter,
  NavEmptyLayout,
  NavItem,
  NavItemContent,
  NavLink,
} from '$components/nav';
import {
  encodeSearchParamValueArray,
  getExploreFeaturedPath,
  getExplorePath,
  getExploreServerPath,
  getCreateRoomPath,
  getHomeForumPath,
  getHomeRoomPath,
  getHomeSearchPath,
  withSearchParam,
} from '$pages/pathUtils';
import { CustomRoomType } from '$types/matrix/room';
import { useOpenShallowRoute } from '$pages/client/useShallowRoute';
import { getCanonicalAliasOrRoomId } from '$utils/matrix';
import { useSelectedOrLastRoom } from '$hooks/router/useSelectedRoom';
import { useHomeCreateSelected, useHomeSearchSelected } from '$hooks/router/useRouteSelected';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { VirtualTile } from '$components/virtualizer';
import { RoomNavCategoryButton, RoomNavItem } from '$features/room-nav';
import { makeNavCategoryId } from '$state/closedNavCategories';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { useCategoryHandler } from '$hooks/useCategoryHandler';
import { useNavToActivePathMapper } from '$hooks/useNavToActivePathMapper';
import { PageNavHeaderWithMenu, PageNavContent } from '$components/page';
import { PageNavShell } from '$components/page/PageNavShell';
import { useClosedNavCategoriesAtom } from '$state/hooks/closedNavCategories';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom, ShowRoomIcon } from '$state/settings';
import {
  getRoomNotificationMode,
  useRoomsNotificationPreferencesContext,
} from '$hooks/useRoomsNotificationPreferences';
import {
  composerIcon,
  dropzoneIcon,
  Globe,
  Hash,
  House,
  Link,
  MagnifyingGlass,
  menuIcon,
  Plus,
  UsersThree,
} from '$components/icons/phosphor';
import { UseStateProvider } from '$components/UseStateProvider';
import { JoinAddressPrompt } from '$components/join-address-prompt';
import { useHomeRooms } from './useHomeRooms';
import { useSidebarWidth } from '$hooks/useSidebarWidth';
import { useClientConfig } from '$hooks/useClientConfig';
import { getMxIdServer } from '$utils/mxIdHelper';
import { NavMenu } from '$components/nav/NavMenu';
import { useMenuAnchor } from '$hooks/useMenuAnchor';

type HomeMenuProps = {
  requestClose: () => void;
};
const HomeMenu = forwardRef<HTMLDivElement, HomeMenuProps>(({ requestClose }, ref) => {
  const orphanRooms = useHomeRooms();
  const [isShowingAllRoomsInHome, setIsShowingAllRoomsInHome] = useSetting(
    settingsAtom,
    'isShowingAllRoomsInHome'
  );

  return (
    <NavMenu ref={ref} rooms={orphanRooms} requestClose={requestClose}>
      <MenuItem
        onClick={() => setIsShowingAllRoomsInHome(!isShowingAllRoomsInHome)}
        size="300"
        after={menuIcon(isShowingAllRoomsInHome ? House : Globe)}
        radii="300"
      >
        <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
          {isShowingAllRoomsInHome ? 'Show Home Rooms' : 'Show All Rooms'}
        </Text>
      </MenuItem>
    </NavMenu>
  );
});

function HomeHeader({ hideText }: { hideText?: boolean }) {
  const menu = useMenuAnchor<HTMLButtonElement>();

  return (
    <PageNavHeaderWithMenu
      hideText={hideText}
      title="Home"
      collapsedIcon={composerIcon(House, { weight: menu.anchor ? 'fill' : 'regular' })}
      menu={<HomeMenu requestClose={menu.close} />}
      anchor={menu.anchor}
      requestClose={menu.close}
      triggerProps={menu.triggerProps}
    />
  );
}

function HomeEmpty() {
  const navigate = useNavigate();
  const openShallowRoute = useOpenShallowRoute();

  return (
    <NavEmptyCenter>
      <NavEmptyLayout
        icon={dropzoneIcon(Hash)}
        title={
          <Text size="H5" align="Center">
            No Rooms
          </Text>
        }
        content={
          <Text size="T300" align="Center">
            You do not have any rooms yet.
          </Text>
        }
        options={
          <>
            <Button
              onClick={() => openShallowRoute(getCreateRoomPath())}
              variant="Secondary"
              size="300"
            >
              <Text size="B300" truncate>
                Create Room
              </Text>
            </Button>
            <Button
              onClick={() => navigate(getExplorePath())}
              variant="Secondary"
              fill="Soft"
              size="300"
            >
              <Text size="B300" truncate>
                Explore Community Rooms
              </Text>
            </Button>
          </>
        }
      />
    </NavEmptyCenter>
  );
}

const DEFAULT_CATEGORY_ID = makeNavCategoryId('home', 'room');
export function Home() {
  const mx = useMatrixClient();
  useNavToActivePathMapper('home');
  const clientConfig = useClientConfig();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isShowingAllRoomsInHome] = useSetting(settingsAtom, 'isShowingAllRoomsInHome');
  const rooms = useHomeRooms(isShowingAllRoomsInHome);
  const notificationPreferences = useRoomsNotificationPreferencesContext();
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const navigate = useNavigate();

  const {
    curWidth,
    setCurWidth,
    roomSidebarWidth,
    setRoomSidebarWidth,
    setIsResizingSidebar,
    isMobile,
    hideText,
    oldSidebar,
  } = useSidebarWidth();

  const [showRoomIconGeneral] = useSetting(settingsAtom, 'showRoomIcon');
  const [showRoomIconArray] = useSetting(settingsAtom, 'perRoomShowRoomIcon');
  const showRoomIcon =
    showRoomIconArray.find((item) => item.roomId === 'Home')?.display ?? showRoomIconGeneral;
  const showIcons = () => {
    if (showRoomIcon === ShowRoomIcon.Always) return true;
    if (showRoomIcon === ShowRoomIcon.Never) return false;
    return curWidth < 144;
  };

  const [joinCallOnSingleClick] = useSetting(settingsAtom, 'joinCallOnSingleClick');

  const selectedRoomId = useSelectedOrLastRoom();
  const createRoomSelected = useHomeCreateSelected();
  const openShallowRoute = useOpenShallowRoute();
  const searchSelected = useHomeSearchSelected();
  const noRoomToDisplay = rooms.length === 0;
  const [closedCategories, setClosedCategories] = useAtom(useClosedNavCategoriesAtom());

  const defaultCategoryClosed = closedCategories.has(DEFAULT_CATEGORY_ID);
  const sortRoomsByActivity = defaultCategoryClosed || isShowingAllRoomsInHome;
  const orderedRooms = useMemo(
    () =>
      Array.from(rooms).toSorted(
        sortRoomsByActivity ? factoryRoomIdByActivity(mx) : factoryRoomIdByAtoZ(mx)
      ),
    [mx, rooms, sortRoomsByActivity]
  );

  const sortedRooms = useMemo(() => {
    if (!defaultCategoryClosed) return orderedRooms;

    const hasUnread = (roomId: string) => {
      const unread = roomToUnread.get(roomId);
      return !!unread && (unread.total > 0 || unread.highlight > 0);
    };
    return orderedRooms.filter((rId) => hasUnread(rId) || rId === selectedRoomId);
  }, [orderedRooms, defaultCategoryClosed, roomToUnread, selectedRoomId]);

  const getItemKey = useCallback((index: number) => sortedRooms[index] ?? index, [sortedRooms]);

  const virtualizer = useVirtualizer({
    count: sortedRooms.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 38,
    overscan: 10,
    getItemKey,
  });

  const handleCategoryClick = useCategoryHandler(setClosedCategories, (categoryId) =>
    closedCategories.has(categoryId)
  );

  const handleExploreClick = () => {
    if (isMobile) {
      navigate(getExplorePath());
      return;
    }

    if (clientConfig.featuredCommunities?.openAsDefault) {
      navigate(getExploreFeaturedPath());
      return;
    }
    const userId = mx.getUserId();
    const userServer = userId ? getMxIdServer(userId) : undefined;
    if (userServer) {
      navigate(getExploreServerPath(userServer));
      return;
    }
    navigate(getExplorePath());
  };

  return (
    <PageNavShell
      header={<HomeHeader hideText={hideText} />}
      curWidth={curWidth}
      setCurWidth={setCurWidth}
      roomSidebarWidth={roomSidebarWidth}
      setRoomSidebarWidth={setRoomSidebarWidth}
      setIsResizingSidebar={setIsResizingSidebar}
      isMobile={isMobile}
      oldSidebar={oldSidebar}
    >
      {noRoomToDisplay ? (
        <HomeEmpty />
      ) : (
        <PageNavContent scrollRef={scrollRef}>
          <Box direction="Column" gap="300">
            <NavCategory>
              <NavItem variant="Background" radii="400" aria-selected={createRoomSelected}>
                <NavButton onClick={() => openShallowRoute(getCreateRoomPath())}>
                  <NavItemContent>
                    <Box as="span" grow="Yes" alignItems="Center" justifyContent="Start" gap="200">
                      <Avatar
                        size={hideText ? undefined : '200'}
                        radii="400"
                        style={hideText ? { width: '100%', padding: '0' } : undefined}
                      >
                        {menuIcon(Plus)}
                      </Avatar>
                      {!hideText && (
                        <Box as="span" grow="Yes">
                          <Text as="span" size="Inherit" truncate>
                            Create Room
                          </Text>
                        </Box>
                      )}
                    </Box>
                  </NavItemContent>
                </NavButton>
              </NavItem>
              <UseStateProvider initial={false}>
                {(open, setOpen) => (
                  <>
                    <NavItem variant="Background" radii="400">
                      <NavButton onClick={() => setOpen(true)}>
                        <NavItemContent>
                          <Box
                            as="span"
                            grow="Yes"
                            alignItems="Center"
                            justifyContent="Start"
                            gap="200"
                          >
                            <Avatar
                              size={hideText ? undefined : '200'}
                              radii="400"
                              style={hideText ? { width: '100%', padding: '0' } : undefined}
                            >
                              {menuIcon(Link)}
                            </Avatar>
                            {!hideText && (
                              <Box as="span" grow="Yes">
                                <Text as="span" size="Inherit" truncate>
                                  Join with Address
                                </Text>
                              </Box>
                            )}
                          </Box>
                        </NavItemContent>
                      </NavButton>
                    </NavItem>
                    {open && (
                      <JoinAddressPrompt
                        onCancel={() => setOpen(false)}
                        onOpen={(roomIdOrAlias, viaServers, eventId) => {
                          setOpen(false);
                          const path = getHomeRoomPath(roomIdOrAlias, eventId);
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
                  </>
                )}
              </UseStateProvider>
              <NavItem variant="Background" radii="400">
                <NavButton onClick={handleExploreClick}>
                  <NavItemContent>
                    <Box as="span" grow="Yes" alignItems="Center" justifyContent="Start" gap="200">
                      <Avatar
                        size={hideText ? undefined : '200'}
                        radii="400"
                        style={hideText ? { width: '100%' } : undefined}
                      >
                        {menuIcon(UsersThree, {
                          weight: 'regular',
                        })}
                      </Avatar>
                      {!hideText && (
                        <Box as="span" grow="Yes">
                          <Text as="span" size="Inherit" truncate>
                            Explore Spaces
                          </Text>
                        </Box>
                      )}
                    </Box>
                  </NavItemContent>
                </NavButton>
              </NavItem>
              <NavItem variant="Background" radii="400" aria-selected={searchSelected}>
                <NavLink to={getHomeSearchPath()}>
                  <NavItemContent>
                    <Box as="span" grow="Yes" alignItems="Center" justifyContent="Start" gap="200">
                      <Avatar
                        size={hideText ? undefined : '200'}
                        radii="400"
                        style={hideText ? { width: '100%' } : undefined}
                      >
                        {menuIcon(MagnifyingGlass, {
                          weight: searchSelected ? 'fill' : 'regular',
                        })}
                      </Avatar>
                      {!hideText && (
                        <Box as="span" grow="Yes">
                          <Text as="span" size="Inherit" truncate>
                            Message Search
                          </Text>
                        </Box>
                      )}
                    </Box>
                  </NavItemContent>
                </NavLink>
              </NavItem>
            </NavCategory>
            <NavCategory>
              <NavCategoryHeader>
                <RoomNavCategoryButton
                  closed={closedCategories.has(DEFAULT_CATEGORY_ID)}
                  data-category-id={DEFAULT_CATEGORY_ID}
                  onClick={handleCategoryClick}
                >
                  {!hideText && 'Rooms'}
                </RoomNavCategoryButton>
              </NavCategoryHeader>
              <div
                style={{
                  position: 'relative',
                  height: virtualizer.getTotalSize(),
                  overflow: 'visible',
                }}
              >
                {virtualizer.getVirtualItems().map((vItem) => {
                  const roomId = sortedRooms[vItem.index];
                  if (!roomId) return null;
                  const room = mx.getRoom(roomId);
                  if (!room) return null;
                  const selected = selectedRoomId === roomId;
                  const canonicalName = getCanonicalAliasOrRoomId(mx, roomId);

                  return (
                    <VirtualTile
                      virtualItem={vItem}
                      key={vItem.key}
                      ref={virtualizer.measureElement}
                    >
                      <div
                        style={
                          hideText
                            ? {
                                padding: '0',
                                width: '100%',
                                aspectRatio: 1,
                                display: 'flex',
                                flexDirection: 'column',
                              }
                            : {}
                        }
                      >
                        <RoomNavItem
                          room={room}
                          selected={selected}
                          showAvatar={showIcons()}
                          hideText={hideText}
                          linkPath={
                            room.getType() === CustomRoomType.Forum
                              ? getHomeForumPath(canonicalName)
                              : getHomeRoomPath(canonicalName)
                          }
                          notificationMode={getRoomNotificationMode(
                            notificationPreferences,
                            room.roomId
                          )}
                          joinCallOnSingleClick={joinCallOnSingleClick}
                        />
                      </div>
                    </VirtualTile>
                  );
                })}
              </div>
            </NavCategory>
            {!isMobile && <div style={{ height: toRem(40) }} />}
          </Box>
        </PageNavContent>
      )}
    </PageNavShell>
  );
}
