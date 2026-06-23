import type { MouseEventHandler } from 'react';
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RectCords } from 'folds';
import {
  Avatar,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  PopOut,
  Text,
  config,
  toRem,
} from 'folds';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAtom, useAtomValue } from 'jotai';
import FocusTrap from 'focus-trap-react';
import { factoryRoomIdByAtoZ, factoryRoomIdByPriority } from '$utils/sort';
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
  getExplorePath,
  getHomeCreatePath,
  getHomeRoomPath,
  getHomeSearchPath,
  withSearchParam,
} from '$pages/pathUtils';
import { getCanonicalAliasOrRoomId } from '$utils/matrix';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { useHomeCreateSelected, useHomeSearchSelected } from '$hooks/router/useHomeSelected';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { VirtualTile } from '$components/virtualizer';
import { RoomNavCategoryButton, RoomNavItem } from '$features/room-nav';
import { makeNavCategoryId } from '$state/closedNavCategories';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { mDirectAtom } from '$state/mDirectList';
import { useCategoryHandler } from '$hooks/useCategoryHandler';
import { useNavToActivePathMapper } from '$hooks/useNavToActivePathMapper';
import { PageNav, PageNavHeader, PageNavContent } from '$components/page';
import { useRoomsUnread } from '$state/hooks/unread';
import { markAsRead } from '$utils/notifications';
import { useClosedNavCategoriesAtom } from '$state/hooks/closedNavCategories';
import { stopPropagation } from '$utils/keyboard';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom, ShowRoomIcon } from '$state/settings';
import {
  getRoomNotificationMode,
  useRoomsNotificationPreferencesContext,
} from '$hooks/useRoomsNotificationPreferences';
import {
  ArrowsClockwise,
  Checks,
  composerIcon,
  DotsThreeOutlineVerticalIcon,
  dropzoneIcon,
  Globe,
  Hash,
  House,
  Link,
  MagnifyingGlass,
  menuIcon,
  Plus,
} from '$components/icons/phosphor';
import { UseStateProvider } from '$components/UseStateProvider';
import { JoinAddressPrompt } from '$components/join-address-prompt';
import { useHomeRooms } from './useHomeRooms';
import { SidebarResizer } from '$pages/client/sidebar/SidebarResizer';
import { isPhoneLayoutDevice } from '$utils/user-agent';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { usePullToRefresh } from '$hooks/usePullToRefresh';
import { getSlidingSyncManager } from '$client/initMatrix';
import { LIST_JOINED } from '$client/slidingSync';
import { getNextSlidingSyncListWindowEnd } from '$client/slidingSyncListPaging';
import { allRoomsAtom } from '$state/room-list/roomList';
import { markStartupRoomListReady } from '$utils/perfTelemetry';
import {
  ensureManualRefreshSpinStyle,
  getManualRefreshSpinStyle,
  triggerManualRefresh,
} from '$utils/manualRefresh';

type HomeMenuProps = {
  isRefreshing: boolean;
  isShowingAllRoomsInHome: boolean;
  onRefresh: () => void | Promise<void>;
  requestClose: () => void;
  setIsShowingAllRoomsInHome: (show: boolean) => void;
};
const HomeMenu = forwardRef<HTMLDivElement, HomeMenuProps>(
  (
    { isRefreshing, isShowingAllRoomsInHome, onRefresh, requestClose, setIsShowingAllRoomsInHome },
    ref
  ) => {
    const orphanRooms = useHomeRooms(isShowingAllRoomsInHome);
    const [hideReads] = useSetting(settingsAtom, 'hideReads');
    const unread = useRoomsUnread(orphanRooms, roomToUnreadAtom);
    const mx = useMatrixClient();

    const handleMarkAsRead = () => {
      if (!unread) return;
      orphanRooms.forEach((rId) => markAsRead(mx, rId, hideReads));
      requestClose();
    };

    return (
      <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <MenuItem
            onClick={handleMarkAsRead}
            size="300"
            after={menuIcon(Checks)}
            radii="300"
            disabled={!unread}
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Mark as Read
            </Text>
          </MenuItem>
          <MenuItem
            onClick={() => {
              void onRefresh();
            }}
            size="300"
            after={menuIcon(ArrowsClockwise, {
              style: getManualRefreshSpinStyle(isRefreshing),
            })}
            radii="300"
            disabled={isRefreshing}
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Refresh
            </Text>
          </MenuItem>
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
        </Box>
      </Menu>
    );
  }
);

type HomeHeaderProps = {
  hideText?: boolean;
  isRefreshing: boolean;
  isShowingAllRoomsInHome: boolean;
  onRefresh: () => void | Promise<void>;
  setIsShowingAllRoomsInHome: (show: boolean) => void;
};

function HomeHeader({
  hideText,
  isRefreshing,
  isShowingAllRoomsInHome,
  onRefresh,
  setIsShowingAllRoomsInHome,
}: HomeHeaderProps) {
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const cords = evt.currentTarget.getBoundingClientRect();
    setMenuAnchor((currentState) => {
      if (currentState) return undefined;
      return cords;
    });
  };

  return (
    <>
      <PageNavHeader size="600">
        {hideText ? (
          <Box alignItems="Center" grow="Yes" justifyContent="Center">
            <IconButton aria-pressed={!!menuAnchor} variant="Background" onClick={handleOpenMenu}>
              {composerIcon(House, { weight: menuAnchor ? 'fill' : 'regular' })}
            </IconButton>
          </Box>
        ) : (
          <Box grow="Yes" gap="300">
            <Box grow="Yes" alignItems="Center">
              <Text size="H4" truncate>
                Home
              </Text>
            </Box>
            <Box shrink="No">
              <IconButton aria-pressed={!!menuAnchor} variant="Background" onClick={handleOpenMenu}>
                {composerIcon(DotsThreeOutlineVerticalIcon, {
                  weight: menuAnchor ? 'fill' : 'regular',
                })}
              </IconButton>
            </Box>
          </Box>
        )}
      </PageNavHeader>
      <PopOut
        anchor={menuAnchor}
        position="Bottom"
        align="End"
        offset={6}
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
            <HomeMenu
              isRefreshing={isRefreshing}
              isShowingAllRoomsInHome={isShowingAllRoomsInHome}
              onRefresh={onRefresh}
              requestClose={() => setMenuAnchor(undefined)}
              setIsShowingAllRoomsInHome={setIsShowingAllRoomsInHome}
            />
          </FocusTrap>
        }
      />
    </>
  );
}

function HomeEmpty() {
  const navigate = useNavigate();

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
            <Button onClick={() => navigate(getHomeCreatePath())} variant="Secondary" size="300">
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isShowingAllRoomsInHome, setIsShowingAllRoomsInHome] = useState(false);
  const rooms = useHomeRooms(isShowingAllRoomsInHome);
  const notificationPreferences = useRoomsNotificationPreferencesContext();
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const navigate = useNavigate();

  const [roomSidebarWidth, setRoomSidebarWidth] = useSetting(settingsAtom, 'roomSidebarWidth');
  const [curWidth, setCurWidth] = useState(roomSidebarWidth);
  useEffect(() => {
    setCurWidth(roomSidebarWidth);
  }, [roomSidebarWidth]);

  const [showRoomIconGeneral] = useSetting(settingsAtom, 'showRoomIcon');
  const [showRoomIconArray] = useSetting(settingsAtom, 'perRoomShowRoomIcon');
  const showRoomIcon =
    showRoomIconArray.find((item) => item.roomId === 'Home')?.display ?? showRoomIconGeneral;
  const showIcons = () => {
    if (showRoomIcon === ShowRoomIcon.Always) return true;
    if (showRoomIcon === ShowRoomIcon.Never) return false;
    if (showRoomIcon === ShowRoomIcon.Strict) return false;
    return curWidth < 144;
  };

  const [joinCallOnSingleClick] = useSetting(settingsAtom, 'joinCallOnSingleClick');

  const selectedRoomId = useSelectedRoom();
  const createRoomSelected = useHomeCreateSelected();
  const searchSelected = useHomeSearchSelected();
  const noRoomToDisplay = rooms.length === 0;
  const [closedCategories, setClosedCategories] = useAtom(useClosedNavCategoriesAtom());
  const allRoomCount = useAtomValue(allRoomsAtom).length;
  const requestedEmptyListExpansionRef = useRef(false);

  const sortedRooms = useMemo(() => {
    const items = Array.from(rooms).toSorted(
      closedCategories.has(DEFAULT_CATEGORY_ID)
        ? factoryRoomIdByPriority(mx, roomToUnread, mDirects)
        : factoryRoomIdByAtoZ(mx)
    );
    const hasUnread = (roomId: string) => {
      const unread = roomToUnread.get(roomId);
      return !!unread && (unread.total > 0 || unread.highlight > 0);
    };
    if (closedCategories.has(DEFAULT_CATEGORY_ID)) {
      return items.filter((rId) => hasUnread(rId) || rId === selectedRoomId);
    }
    return items;
  }, [mx, rooms, closedCategories, roomToUnread, mDirects, selectedRoomId]);

  const virtualizer = useVirtualizer({
    count: sortedRooms.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 38,
    overscan: 10,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualIndex = virtualItems.at(-1)?.index ?? -1;

  useEffect(() => {
    const manager = getSlidingSyncManager(mx);
    const diagnostics = manager?.getListDiagnostics(LIST_JOINED);
    if (!manager || !diagnostics) return;
    const allowEmptyExpansion = sortedRooms.length === 0 && !requestedEmptyListExpansionRef.current;
    const nextEnd = getNextSlidingSyncListWindowEnd({
      diagnostics,
      itemCount: sortedRooms.length,
      lastVirtualIndex,
      allowEmptyExpansion,
    });
    if (nextEnd === undefined) return;
    if (allowEmptyExpansion) requestedEmptyListExpansionRef.current = true;
    manager.requestListWindow(LIST_JOINED, nextEnd);
  }, [mx, sortedRooms.length, allRoomCount, lastVirtualIndex]);

  useEffect(() => {
    if (sortedRooms.length > 0 || allRoomCount === 0) {
      markStartupRoomListReady('home', sortedRooms.length);
    }
  }, [sortedRooms.length, allRoomCount]);

  const handleCategoryClick = useCategoryHandler(setClosedCategories, (categoryId) =>
    closedCategories.has(categoryId)
  );

  const screenSize = useScreenSizeContext();
  const isMobile = isPhoneLayoutDevice() || screenSize === ScreenSize.Mobile;
  const hideText = curWidth <= 80 && !isMobile;
  const [isRefreshing, setIsRefreshing] = useState(false);
  useEffect(() => {
    ensureManualRefreshSpinStyle();
  }, []);
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await triggerManualRefresh(mx);
    } finally {
      setIsRefreshing(false);
    }
  }, [mx, isRefreshing]);

  usePullToRefresh(scrollRef, mx);

  return (
    <Box
      shrink="No"
      style={{
        position: 'relative',
        width: isMobile ? '100%' : toRem(curWidth),
      }}
    >
      <PageNav>
        <HomeHeader
          hideText={hideText}
          isRefreshing={isRefreshing}
          isShowingAllRoomsInHome={isShowingAllRoomsInHome}
          onRefresh={handleRefresh}
          setIsShowingAllRoomsInHome={setIsShowingAllRoomsInHome}
        />
        {noRoomToDisplay ? (
          <HomeEmpty />
        ) : (
          <PageNavContent scrollRef={scrollRef}>
            <Box direction="Column" gap="300">
              <NavCategory>
                <NavItem variant="Background" radii="400" aria-selected={createRoomSelected}>
                  <NavButton onClick={() => navigate(getHomeCreatePath())}>
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
                <NavItem variant="Background" radii="400" aria-selected={searchSelected}>
                  <NavLink to={getHomeSearchPath()}>
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
                  {virtualItems.map((vItem) => {
                    const roomId = sortedRooms[vItem.index];
                    if (!roomId) return null;
                    const room = mx.getRoom(roomId);
                    if (!room) return null;
                    const selected = selectedRoomId === roomId;

                    return (
                      <VirtualTile
                        virtualItem={vItem}
                        key={vItem.index}
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
                            useDirectAvatarFallback={mDirects.has(roomId)}
                            isStrict={showRoomIcon === ShowRoomIcon.Strict}
                            hideText={hideText}
                            linkPath={getHomeRoomPath(getCanonicalAliasOrRoomId(mx, roomId))}
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
            </Box>
          </PageNavContent>
        )}
      </PageNav>
      {!isMobile && (
        <SidebarResizer
          setCurWidth={setCurWidth}
          sidebarWidth={roomSidebarWidth}
          setSidebarWidth={setRoomSidebarWidth}
          instep={80}
          outstep={190}
          minValue={50}
          maxValue={500}
        />
      )}
    </Box>
  );
}
