import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Avatar, Box, Button, Text, toRem } from 'folds';
import {
  At,
  dropzoneIcon,
  menuIcon,
  getPhosphorSize,
  Plus,
  User,
} from '$components/icons/phosphor';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNavigate } from 'react-router';
import { RoomEvent } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { factoryRoomIdByActivity } from '$utils/sort';
import {
  NavButton,
  NavCategory,
  NavCategoryHeader,
  NavEmptyCenter,
  NavEmptyLayout,
  NavItem,
  NavItemContent,
} from '$components/nav';
import { getDirectCreatePath, getDirectForumPath, getDirectRoomPath } from '$pages/pathUtils';
import { getCanonicalAliasOrRoomId } from '$utils/matrix';
import { useSelectedOrLastRoom } from '$hooks/router/useSelectedRoom';
import { VirtualTile } from '$components/virtualizer';
import { RoomNavCategoryButton, RoomNavItem } from '$features/room-nav';
import { makeNavCategoryId } from '$state/closedNavCategories';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { useCategoryHandler } from '$hooks/useCategoryHandler';
import { useNavToActivePathMapper } from '$hooks/useNavToActivePathMapper';
import { PageNavContent, PageNavHeaderWithMenu } from '$components/page';
import { PageNavShell } from '$components/page/PageNavShell';
import { useClosedNavCategoriesAtom } from '$state/hooks/closedNavCategories';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import {
  getRoomNotificationMode,
  useRoomsNotificationPreferencesContext,
} from '$hooks/useRoomsNotificationPreferences';
import { useDirectCreateSelected } from '$hooks/router/useRouteSelected';
import { useDirectRooms } from './useDirectRooms';
import { useSidebarWidth } from '$hooks/useSidebarWidth';
import { useMenuAnchor } from '$hooks/useMenuAnchor';
import { NavMenu } from '$components/nav/NavMenu';
import { CustomRoomType } from '$types/matrix/room';

type DirectMenuProps = {
  requestClose: () => void;
};
const DirectMenu = forwardRef<HTMLDivElement, DirectMenuProps>(({ requestClose }, ref) => {
  const orphanRooms = useDirectRooms();

  return <NavMenu ref={ref} rooms={orphanRooms} requestClose={requestClose} />;
});
DirectMenu.displayName = 'DirectMenu';

function DirectHeader({ hideText }: { hideText?: boolean }) {
  const menu = useMenuAnchor<HTMLButtonElement>();

  return (
    <PageNavHeaderWithMenu
      hideText={hideText}
      title="Direct Messages"
      collapsedIcon={
        <User size={getPhosphorSize().toolbar} weight={menu.anchor ? 'fill' : 'regular'} />
      }
      menu={<DirectMenu requestClose={menu.close} />}
      anchor={menu.anchor}
      requestClose={menu.close}
      triggerProps={menu.triggerProps}
    />
  );
}

function DirectEmpty() {
  const navigate = useNavigate();

  return (
    <NavEmptyCenter>
      <NavEmptyLayout
        icon={dropzoneIcon(At)}
        title={
          <Text size="H5" align="Center">
            No Direct Messages
          </Text>
        }
        content={
          <Text size="T300" align="Center">
            You do not have any direct messages yet.
          </Text>
        }
        options={
          <Button variant="Secondary" size="300" onClick={() => navigate(getDirectCreatePath())}>
            <Text size="B300" truncate>
              Direct Message
            </Text>
          </Button>
        }
      />
    </NavEmptyCenter>
  );
}

const DEFAULT_CATEGORY_ID = makeNavCategoryId('direct', 'direct');
export function Direct() {
  const mx = useMatrixClient();
  useNavToActivePathMapper('direct');
  const scrollRef = useRef<HTMLDivElement>(null);
  const directs = useDirectRooms();
  const notificationPreferences = useRoomsNotificationPreferencesContext();
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const navigate = useNavigate();
  const [customDMCards] = useSetting(settingsAtom, 'customDMCards');
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

  const [joinCallOnSingleClick] = useSetting(settingsAtom, 'joinCallOnSingleClick');

  const createDirectSelected = useDirectCreateSelected();

  const selectedRoomId = useSelectedOrLastRoom();
  const noRoomToDisplay = directs.length === 0;
  const [closedCategories, setClosedCategories] = useAtom(useClosedNavCategoriesAtom());

  // Track timeline activity to trigger re-sorting when messages arrive.
  // Without this, DMs only re-sort when you switch rooms because getLastActiveTimestamp()
  // is internal SDK state not tracked by React dependencies.
  const [activityCounter, setActivityCounter] = useState(0);
  const directsSetRef = useRef(directs);
  directsSetRef.current = directs;

  useEffect(() => {
    const handleTimeline = () => {
      // Increment counter to trigger re-sort when any timeline event happens
      setActivityCounter((prev) => prev + 1);
    };

    // Listen to timeline events only for direct message rooms
    directsSetRef.current.forEach((roomId) => {
      const room = mx.getRoom(roomId);
      room?.on(RoomEvent.Timeline, handleTimeline);
    });

    return () => {
      directsSetRef.current.forEach((roomId) => {
        const room = mx.getRoom(roomId);
        room?.off(RoomEvent.Timeline, handleTimeline);
      });
    };
  }, [mx, directs]);

  const sortedDirects = useMemo(() => {
    void activityCounter;
    const items = Array.from(directs).toSorted(factoryRoomIdByActivity(mx));
    const hasUnread = (roomId: string) => {
      const unread = roomToUnread.get(roomId);
      return !!unread && (unread.total > 0 || unread.highlight > 0);
    };
    if (closedCategories.has(DEFAULT_CATEGORY_ID)) {
      return items.filter((rId) => hasUnread(rId) || rId === selectedRoomId);
    }
    return items;
  }, [mx, directs, closedCategories, roomToUnread, selectedRoomId, activityCounter]);

  const getItemKey = useCallback((index: number) => sortedDirects[index] ?? index, [sortedDirects]);

  const virtualizer = useVirtualizer({
    count: sortedDirects.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 38,
    overscan: 10,
    getItemKey,
  });

  const handleCategoryClick = useCategoryHandler(setClosedCategories, (categoryId) =>
    closedCategories.has(categoryId)
  );

  return (
    <PageNavShell
      header={<DirectHeader hideText={hideText} />}
      curWidth={curWidth}
      setCurWidth={setCurWidth}
      roomSidebarWidth={roomSidebarWidth}
      setRoomSidebarWidth={setRoomSidebarWidth}
      setIsResizingSidebar={setIsResizingSidebar}
      isMobile={isMobile}
      oldSidebar={oldSidebar}
    >
      {noRoomToDisplay ? (
        <DirectEmpty />
      ) : (
        <PageNavContent scrollRef={scrollRef}>
          <Box direction="Column" gap="300">
            <NavCategory>
              <NavItem variant="Background" radii="400" aria-selected={createDirectSelected}>
                <NavButton onClick={() => navigate(getDirectCreatePath())}>
                  <NavItemContent>
                    <Box as="span" grow="Yes" alignItems="Center" gap="200" justifyContent="Center">
                      <Avatar size="200" radii="400">
                        {menuIcon(Plus)}
                      </Avatar>
                      {!hideText && (
                        <Box as="span" grow="Yes">
                          <Text as="span" size="Inherit" truncate>
                            Create Chat
                          </Text>
                        </Box>
                      )}
                    </Box>
                  </NavItemContent>
                </NavButton>
              </NavItem>
            </NavCategory>
            <NavCategory>
              <NavCategoryHeader>
                <RoomNavCategoryButton
                  closed={closedCategories.has(DEFAULT_CATEGORY_ID)}
                  data-category-id={DEFAULT_CATEGORY_ID}
                  onClick={handleCategoryClick}
                >
                  {!hideText && 'Chats'}
                </RoomNavCategoryButton>
              </NavCategoryHeader>
              <div
                style={{
                  position: 'relative',
                  height: virtualizer.getTotalSize(),
                  overflow: 'clip',
                }}
              >
                {virtualizer.getVirtualItems().map((vItem) => {
                  const roomId = sortedDirects[vItem.index];
                  if (!roomId) return null;
                  const room = mx.getRoom(roomId);
                  if (!room) return null;
                  const selected = selectedRoomId === roomId;

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
                          showAvatar
                          direct
                          customDMCards={customDMCards}
                          hideText={hideText}
                          linkPath={
                            room.getType() === CustomRoomType.Forum
                              ? getDirectForumPath(getCanonicalAliasOrRoomId(mx, roomId))
                              : getDirectRoomPath(getCanonicalAliasOrRoomId(mx, roomId))
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
            <div style={{ height: toRem(40) }} />
          </Box>
        </PageNavContent>
      )}
    </PageNavShell>
  );
}
