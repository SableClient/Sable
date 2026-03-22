import {
  MouseEventHandler,
  ReactElement,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAtom, useAtomValue } from 'jotai';
import {
  Avatar,
  Box,
  Button,
  Icon,
  IconButton,
  Icons,
  Line,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Spinner,
  Text,
  color,
  config,
  toRem,
} from 'folds';
import { useVirtualizer, VirtualItem } from '@tanstack/react-virtual';
import FocusTrap from 'focus-trap-react';
import { useNavigate } from 'react-router-dom';
import { JoinRule, Room, RoomJoinRulesEventContent } from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { mDirectAtom } from '$state/mDirectList';
import { NavCategory, NavCategoryHeader, NavItem, NavItemContent, NavLink } from '$components/nav';
import { getSpaceLobbyPath, getSpaceRoomPath, getSpaceSearchPath } from '$pages/pathUtils';
import { getCanonicalAliasOrRoomId, isRoomAlias } from '$utils/matrix';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { useSpaceLobbySelected, useSpaceSearchSelected } from '$hooks/router/useSelectedSpace';
import { useSpace } from '$hooks/useSpace';
import { VirtualTile } from '$components/virtualizer';
import { spaceRoomsAtom } from '$state/spaceRooms';
import { RoomNavCategoryButton, RoomNavItem } from '$features/room-nav';
import { SpaceNavItem } from '$features/space-nav';
import { makeNavCategoryId, getNavCategoryIdParts } from '$state/closedNavCategories';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { useCategoryHandler } from '$hooks/useCategoryHandler';
import { useNavToActivePathMapper } from '$hooks/useNavToActivePathMapper';
import { useRoomName } from '$hooks/useRoomMeta';
import { HierarchyItem, useSpaceJoinedHierarchy } from '$hooks/useSpaceHierarchy';
import { allRoomsAtom } from '$state/room-list/roomList';
import { PageNav, PageNavContent, PageNavHeader } from '$components/page';
import { usePowerLevels } from '$hooks/usePowerLevels';
import { useRecursiveChildScopeFactory, useSpaceChildren } from '$state/hooks/roomList';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { roomToChildrenAtom } from '$state/room/roomToChildren';
import { markAsRead } from '$utils/notifications';
import { useRoomsUnread } from '$state/hooks/unread';
import { UseStateProvider } from '$components/UseStateProvider';
import { LeaveSpacePrompt } from '$components/leave-space-prompt';
import { copyToClipboard } from '$utils/dom';
import { useClosedNavCategoriesAtom } from '$state/hooks/closedNavCategories';
import { useStateEvent } from '$hooks/useStateEvent';
import { Membership, StateEvent } from '$types/matrix/room';
import { stopPropagation } from '$utils/keyboard';
import { getMatrixToRoom } from '$plugins/matrix-to';
import { getViaServers } from '$plugins/via-servers';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import {
  getRoomNotificationMode,
  useRoomsNotificationPreferencesContext,
} from '$hooks/useRoomsNotificationPreferences';
import { useOpenSpaceSettings } from '$state/hooks/spaceSettings';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { ContainerColor } from '$styles/ContainerColor.css';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { BreakWord } from '$styles/Text.css';
import { InviteUserPrompt } from '$components/invite-user-prompt';
import { mobileOrTablet } from '$utils/user-agent';
import { lastVisitedRoomIdAtom } from '$state/room/lastRoom';
import { SwipeableOverlayWrapper } from '$components/SwipeableOverlayWrapper';
import { useCallEmbed } from '$hooks/useCallEmbed';
import { createDebugLogger } from '$utils/debugLogger';

const debugLog = createDebugLogger('Space');

type SpaceMenuProps = {
  room: Room;
  requestClose: () => void;
};

const SpaceMenu = forwardRef<HTMLDivElement, SpaceMenuProps>(({ room, requestClose }, ref) => {
  const mx = useMatrixClient();
  const [hideReads] = useSetting(settingsAtom, 'hideReads');
  const [developerTools] = useSetting(settingsAtom, 'developerTools');
  const roomToParents = useAtomValue(roomToParentsAtom);
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const canInvite = permissions.action('invite', mx.getSafeUserId());
  const openSpaceSettings = useOpenSpaceSettings();
  const { navigateRoom } = useRoomNavigate();

  const [invitePrompt, setInvitePrompt] = useState(false);

  const allChild = useSpaceChildren(
    allRoomsAtom,
    room.roomId,
    useRecursiveChildScopeFactory(mx, roomToParents)
  );
  const unread = useRoomsUnread(allChild, roomToUnreadAtom);

  const handleMarkAsRead = () => {
    allChild.forEach((childRoomId) => markAsRead(mx, childRoomId, hideReads));
    requestClose();
  };

  const handleCopyLink = () => {
    const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, room.roomId);
    const viaServers = isRoomAlias(roomIdOrAlias) ? undefined : getViaServers(room);
    copyToClipboard(getMatrixToRoom(roomIdOrAlias, viaServers));
    requestClose();
  };

  const handleInvite = () => {
    setInvitePrompt(true);
  };

  const handleRoomSettings = () => {
    openSpaceSettings(room.roomId);
    requestClose();
  };

  const handleOpenTimeline = () => {
    debugLog.info('ui', 'Space timeline opened', { roomId: room.roomId });
    navigateRoom(room.roomId);
    requestClose();
  };

  return (
    <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        {invitePrompt && room && (
          <InviteUserPrompt
            room={room}
            requestClose={() => {
              setInvitePrompt(false);
              requestClose();
            }}
          />
        )}
        <MenuItem
          onClick={handleMarkAsRead}
          size="300"
          after={<Icon size="100" src={Icons.CheckTwice} />}
          radii="300"
          disabled={!unread}
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Mark as Read
          </Text>
        </MenuItem>
      </Box>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem
          onClick={handleInvite}
          variant="Primary"
          fill="None"
          size="300"
          after={<Icon size="100" src={Icons.UserPlus} />}
          radii="300"
          aria-pressed={invitePrompt}
          disabled={!canInvite}
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Invite
          </Text>
        </MenuItem>
        <MenuItem
          onClick={handleCopyLink}
          size="300"
          after={<Icon size="100" src={Icons.Link} />}
          radii="300"
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Copy Link
          </Text>
        </MenuItem>
        <MenuItem
          onClick={handleRoomSettings}
          size="300"
          after={<Icon size="100" src={Icons.Setting} />}
          radii="300"
        >
          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
            Space Settings
          </Text>
        </MenuItem>
        {developerTools && (
          <MenuItem
            onClick={handleOpenTimeline}
            size="300"
            after={<Icon size="100" src={Icons.Terminal} />}
            radii="300"
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Event Timeline
            </Text>
          </MenuItem>
        )}
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
                after={<Icon size="100" src={Icons.ArrowGoLeft} />}
                radii="300"
                aria-pressed={promptLeave}
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  Leave Space
                </Text>
              </MenuItem>
              {promptLeave && (
                <LeaveSpacePrompt
                  roomId={room.roomId}
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
});

function SpaceHeader() {
  const space = useSpace();
  const spaceName = useRoomName(space);
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const joinRules = useStateEvent(
    space,
    StateEvent.RoomJoinRules
  )?.getContent<RoomJoinRulesEventContent>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const cords = evt.currentTarget.getBoundingClientRect();
    setMenuAnchor((currentState) => {
      if (currentState) return undefined;
      return cords;
    });
  };

  return (
    <>
      <PageNavHeader>
        <Box alignItems="Center" grow="Yes" gap="300">
          <Box grow="Yes" alignItems="Center" gap="100">
            <Text size="H4" truncate>
              {spaceName}
            </Text>
            {joinRules?.join_rule !== JoinRule.Public && <Icon src={Icons.Lock} size="50" />}
          </Box>
          <Box shrink="No">
            <IconButton aria-pressed={!!menuAnchor} variant="Background" onClick={handleOpenMenu}>
              <Icon src={Icons.VerticalDots} size="200" />
            </IconButton>
          </Box>
        </Box>
      </PageNavHeader>
      {menuAnchor && (
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
              <SpaceMenu room={space} requestClose={() => setMenuAnchor(undefined)} />
            </FocusTrap>
          }
        />
      )}
    </>
  );
}

type SpaceTombstoneProps = { roomId: string; replacementRoomId: string };
export function SpaceTombstone({ roomId, replacementRoomId }: SpaceTombstoneProps) {
  const mx = useMatrixClient();
  const { navigateSpace } = useRoomNavigate();

  const [joinState, handleJoin] = useAsyncCallback(
    useCallback(() => {
      const currentRoom = mx.getRoom(roomId);
      const via = currentRoom ? getViaServers(currentRoom) : [];
      return mx.joinRoom(replacementRoomId, {
        viaServers: via,
      });
    }, [mx, roomId, replacementRoomId])
  );
  const replacementRoom = mx.getRoom(replacementRoomId);

  const handleOpen = () => {
    if (replacementRoom) navigateSpace(replacementRoom.roomId);
    if (joinState.status === AsyncStatus.Success) navigateSpace(joinState.data.roomId);
  };

  return (
    <Box
      style={{
        padding: config.space.S200,
        borderRadius: config.radii.R400,
        borderWidth: config.borderWidth.B300,
      }}
      className={ContainerColor({ variant: 'Surface' })}
      direction="Column"
      gap="300"
    >
      <Box direction="Column" grow="Yes" gap="100">
        <Text size="L400">Space Upgraded</Text>
        <Text size="T200">This space has been replaced and is no longer active.</Text>
        {joinState.status === AsyncStatus.Error && (
          <Text className={BreakWord} style={{ color: color.Critical.Main }} size="T200">
            {(joinState.error as any)?.message ?? 'Failed to join replacement space!'}
          </Text>
        )}
      </Box>
      <Box direction="Column" shrink="No">
        {replacementRoom?.getMyMembership() === Membership.Join ||
        joinState.status === AsyncStatus.Success ? (
          <Button onClick={handleOpen} size="300" variant="Success" fill="Solid" radii="300">
            <Text size="B300">Open New Space</Text>
          </Button>
        ) : (
          <Button
            onClick={handleJoin}
            size="300"
            variant="Primary"
            fill="Solid"
            radii="300"
            before={
              joinState.status === AsyncStatus.Loading && (
                <Spinner size="100" variant="Primary" fill="Solid" />
              )
            }
            disabled={joinState.status === AsyncStatus.Loading}
          >
            <Text size="B300">Join New Space</Text>
          </Button>
        )}
      </Box>
    </Box>
  );
}

export function Space() {
  const mx = useMatrixClient();
  const space = useSpace();
  useNavToActivePathMapper(space.roomId);
  const spaceIdOrAlias = getCanonicalAliasOrRoomId(mx, space.roomId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mDirects = useAtomValue(mDirectAtom);
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const roomToParents = useAtomValue(roomToParentsAtom);
  const roomToChildren = useAtomValue(roomToChildrenAtom);
  const allRooms = useAtomValue(allRoomsAtom);
  const [spaceRooms] = useAtom(spaceRoomsAtom);
  const allJoinedRooms = useMemo(() => new Set(allRooms), [allRooms]);
  const notificationPreferences = useRoomsNotificationPreferencesContext();

  const tombstoneEvent = useStateEvent(space, StateEvent.RoomTombstone);
  const selectedRoomId = useSelectedRoom();
  const lobbySelected = useSpaceLobbySelected(spaceIdOrAlias);
  const searchSelected = useSpaceSearchSelected(spaceIdOrAlias);
  const callEmbed = useCallEmbed();

  const [closedCategories, setClosedCategories] = useAtom(useClosedNavCategoriesAtom());

  const getRoom = useCallback(
    (rId: string): Room | undefined => {
      if (allJoinedRooms.has(rId)) {
        return mx.getRoom(rId) ?? undefined;
      }
      return undefined;
    },
    [mx, allJoinedRooms]
  );

  const closedCategoriesCache = useRef(new Map());
  const ancestorsCollapsedCache = useRef(new Map());
  useEffect(() => {
    closedCategoriesCache.current.clear();
    ancestorsCollapsedCache.current.clear();
  }, [closedCategories, roomToParents, getRoom]);

  /**
   * Recursively checks if a given parentId (or all its ancestors) is in a closed category.
   *
   * @param spaceId - The root space ID.
   * @param parentId - The parent space ID to start the check from.
   * @param previousId - The last ID checked, only used to ignore root collapse state.
   * @param visited - Set used to prevent recursion errors.
   * @returns True if parentId or all ancestors is in a closed category.
   */
  const getInClosedCategories = useCallback(
    (
      spaceId: string,
      parentId: string,
      previousId?: string,
      visited: Set<string> = new Set()
    ): boolean => {
      // Ignore root space being collapsed if in a subspace,
      // this is due to many spaces dumping all rooms in the top-level space.
      if (parentId === spaceId && previousId) {
        if (spaceRooms.has(previousId) || getRoom(previousId)?.isSpaceRoom()) {
          return false;
        }
      }

      const categoryId = makeNavCategoryId(spaceId, parentId);

      // Prevent infinite recursion
      if (visited.has(categoryId)) return false;
      visited.add(categoryId);

      if (closedCategoriesCache.current.has(categoryId)) {
        return closedCategoriesCache.current.get(categoryId);
      }

      if (closedCategories.has(categoryId)) {
        closedCategoriesCache.current.set(categoryId, true);
        return true;
      }

      const parentParentIds = roomToParents.get(parentId);
      if (!parentParentIds || parentParentIds.size === 0) {
        closedCategoriesCache.current.set(categoryId, false);
        return false;
      }

      // As a subspace can be in multiple spaces,
      // only return true if all parent spaces are closed.
      const allClosed = !Array.from(parentParentIds).some(
        (id) => !getInClosedCategories(spaceId, id, parentId, visited)
      );
      visited.delete(categoryId);
      closedCategoriesCache.current.set(categoryId, allClosed);
      return allClosed;
    },
    [closedCategories, getRoom, roomToParents, spaceRooms]
  );

  /**
   * Recursively checks if the given room or any of its descendants should be visible.
   *
   * @param roomId - The room ID to check.
   * @param visited - Set used to prevent recursion errors.
   * @returns True if the room or any descendant should be visible.
   */
  const getContainsShowRoom = useCallback(
    (roomId: string, visited: Set<string> = new Set()): boolean => {
      if (roomToUnread.has(roomId) || roomId === selectedRoomId) {
        return true;
      }

      // Prevent infinite recursion
      if (visited.has(roomId)) return false;
      visited.add(roomId);

      const childIds = roomToChildren.get(roomId);
      if (!childIds || childIds.size === 0) {
        return false;
      }

      return Array.from(childIds).some((id) => getContainsShowRoom(id, visited));
    },
    [roomToUnread, selectedRoomId, roomToChildren]
  );

  /**
   * Determines whether all parent categories are collapsed.
   *
   * @param spaceId - The root space ID.
   * @param roomId - The room ID to start the check from.
   * @returns True if every parent category is collapsed; false otherwise.
   */
  const getAllAncestorsCollapsed = (spaceId: string, roomId: string): boolean => {
    const categoryId = makeNavCategoryId(spaceId, roomId);
    if (ancestorsCollapsedCache.current.has(categoryId)) {
      return ancestorsCollapsedCache.current.get(categoryId);
    }

    const parentIds = roomToParents.get(roomId);
    if (!parentIds || parentIds.size === 0) {
      ancestorsCollapsedCache.current.set(categoryId, false);
      return false;
    }

    const allCollapsed = !Array.from(parentIds).some(
      (id) => !getInClosedCategories(spaceId, id, roomId)
    );
    ancestorsCollapsedCache.current.set(categoryId, allCollapsed);
    return allCollapsed;
  };

  /**
   * Determines the depth limit for the joined space hierarchy and the SpaceNavItems to start appearing
   */
  const [subspaceHierarchyLimit] = useSetting(settingsAtom, 'subspaceHierarchyLimit');
  /**
   * Creates an SVG used for connecting spaces to their subrooms.
   * @param virtualizedItems - The virtualized item list that will be used to render elements in the nav
   * @returns React SVG Element that can be overlayed on top of the nav category for rooms.
   */
  const getConnectorSVG = (
    hierarchy: HierarchyItem[],
    virtualizedItems: VirtualItem[]
  ): ReactElement => {
    const DEPTH_START = 2;
    const PADDING_LEFT_DEPTH_OFFSET = 15.75;
    const PADDING_LEFT_DEPTH_OFFSET_START = -15.75;
    const RADIUS = 5;

    let connectorStack: { aX: number; aY: number }[] = [];
    // Holder for the paths
    const pathHolder: ReactElement[] = [];
    virtualizedItems.forEach((vItem) => {
      const { roomId, depth } = hierarchy[vItem.index] ?? {};
      const room = getRoom(roomId);
      // We will render spaces at a level above their normal depth, since we want their children to be "under" them
      const renderDepth = room?.isSpaceRoom() ? depth : depth + 1;
      // for the root items, we are not doing anything with it.
      if (renderDepth < DEPTH_START) {
        return;
      }
      // for nearly root level text/call rooms, we will not be drawing any arcs.
      if (renderDepth === DEPTH_START - 1 && !room?.isSpaceRoom() && connectorStack.length === 0) {
        return;
      }

      // for the sub-root items, we will not draw any arcs from root to it.
      // however, we should capture the aX and aY to draw starter arcs for next depths.
      if (renderDepth === DEPTH_START) {
        connectorStack = [
          {
            aX: PADDING_LEFT_DEPTH_OFFSET * DEPTH_START + PADDING_LEFT_DEPTH_OFFSET_START,
            aY: vItem.end,
          },
        ];
        return;
      }
      // adjust the stack to be at the correct depth, which is the "parent" of the current item.
      while (connectorStack.length + DEPTH_START > renderDepth && connectorStack.length !== 0) {
        connectorStack.pop();
      }

      // Fixes crash in case the top level virtual item is unrendered.
      if (connectorStack.length === 0) {
        connectorStack = [{ aX: Math.round(renderDepth * PADDING_LEFT_DEPTH_OFFSET), aY: 0 }];
      }

      const lastConnector = connectorStack[connectorStack.length - 1];

      // aX: numeric x where the vertical connector starts
      // aY: end of parent (already numeric)
      const { aX, aY } = lastConnector;

      // bX: point where the vertical connector ends
      const bX = Math.round(
        (renderDepth - 0.5) * PADDING_LEFT_DEPTH_OFFSET + PADDING_LEFT_DEPTH_OFFSET_START
      );
      // bY: center of current item
      const bY = vItem.end - vItem.size / 2;

      const pathString =
        `M ${aX} ${aY} ` +
        `L ${aX} ${bY - RADIUS} ` +
        `A ${RADIUS} ${RADIUS} 0 0 0 ${aX + RADIUS} ${bY} ` +
        `L ${bX} ${bY}`;

      pathHolder.push(
        <path
          d={pathString}
          fill="none"
          stroke={color.Surface.ContainerLine}
          strokeWidth="2"
          display="block"
        />
      );

      // add this item to the connector stack, in case the next item's depth is higher.
      connectorStack.push({
        aX: Math.round(renderDepth * PADDING_LEFT_DEPTH_OFFSET) + PADDING_LEFT_DEPTH_OFFSET_START,
        aY: vItem.end,
      });
    });
    return (
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        {pathHolder}
      </svg>
    );
  };

  const hierarchy = useSpaceJoinedHierarchy(
    space.roomId,
    getRoom,
    useCallback(
      (parentId, roomId, depth) => {
        if (depth >= subspaceHierarchyLimit) {
          // we will exclude items above this depth
          return true;
        }
        if (!getInClosedCategories(space.roomId, parentId, roomId)) {
          return false;
        }
        const unread = roomToUnread.get(roomId);
        const containsShowRoom = getContainsShowRoom(roomId);
        const hasUnread = !!unread && (unread.total > 0 || unread.highlight > 0);
        const showRoomAnyway =
          hasUnread || roomId === selectedRoomId || callEmbed?.roomId === roomId;
        return containsShowRoom || !showRoomAnyway;
      },
      [
        getContainsShowRoom,
        getInClosedCategories,
        space.roomId,
        callEmbed,
        subspaceHierarchyLimit,
        roomToUnread,
        selectedRoomId,
      ]
    ),
    useCallback(
      (sId) => getInClosedCategories(space.roomId, sId),
      [getInClosedCategories, space.roomId]
    )
  );

  const virtualizer = useVirtualizer({
    count: hierarchy.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 10,
  });

  const virtualizedItems = virtualizer.getVirtualItems();

  const handleCategoryClick = useCategoryHandler(setClosedCategories, (categoryId) => {
    const collapsed = closedCategories.has(categoryId);
    const [spaceId, roomId] = getNavCategoryIdParts(categoryId);

    // Only prevent collapsing if all parents are collapsed
    const toggleable = !getAllAncestorsCollapsed(spaceId, roomId);

    if (toggleable) {
      return collapsed;
    }
    return !collapsed;
  });

  const getToLink = (roomId: string) =>
    getSpaceRoomPath(spaceIdOrAlias, getCanonicalAliasOrRoomId(mx, roomId));

  const getCategoryPadding = (depth: number): string | undefined => {
    if (depth === 0) return undefined;
    if (depth === 1) return config.space.S400;
    return config.space.S0;
  };

  const navigate = useNavigate();
  const lastRoomId = useAtomValue(lastVisitedRoomIdAtom);

  const handleSwipeToRoom = useCallback(() => {
    if (mobileOrTablet() && lastRoomId) {
      const roomAliasOrId = getCanonicalAliasOrRoomId(mx, lastRoomId);
      navigate(getSpaceRoomPath(spaceIdOrAlias, roomAliasOrId));
    }
  }, [lastRoomId, spaceIdOrAlias, mx, navigate]);

  return (
    <PageNav>
      <SwipeableOverlayWrapper direction="left" onClose={handleSwipeToRoom}>
        <SpaceHeader />
        <PageNavContent scrollRef={scrollRef}>
          <Box direction="Column" gap="300">
            {tombstoneEvent && (
              <SpaceTombstone
                roomId={space.roomId}
                replacementRoomId={tombstoneEvent.getContent().replacement_room}
              />
            )}
            <NavCategory>
              <NavItem variant="Background" radii="400" aria-selected={lobbySelected}>
                <NavLink to={getSpaceLobbyPath(getCanonicalAliasOrRoomId(mx, space.roomId))}>
                  <NavItemContent>
                    <Box as="span" grow="Yes" alignItems="Center" gap="200">
                      <Avatar size="200" radii="400">
                        <Icon src={Icons.Flag} size="100" filled={lobbySelected} />
                      </Avatar>
                      <Box as="span" grow="Yes">
                        <Text as="span" size="Inherit" truncate>
                          Lobby
                        </Text>
                      </Box>
                    </Box>
                  </NavItemContent>
                </NavLink>
              </NavItem>
              <NavItem variant="Background" radii="400" aria-selected={searchSelected}>
                <NavLink to={getSpaceSearchPath(getCanonicalAliasOrRoomId(mx, space.roomId))}>
                  <NavItemContent>
                    <Box as="span" grow="Yes" alignItems="Center" gap="200">
                      <Avatar size="200" radii="400">
                        <Icon src={Icons.Search} size="100" filled={searchSelected} />
                      </Avatar>
                      <Box as="span" grow="Yes">
                        <Text as="span" size="Inherit" truncate>
                          Message Search
                        </Text>
                      </Box>
                    </Box>
                  </NavItemContent>
                </NavLink>
              </NavItem>
            </NavCategory>
            <NavCategory
              style={{
                height: virtualizer.getTotalSize(),
                position: 'relative',
              }}
            >
              {virtualizedItems.map((vItem) => {
                const { roomId, depth } = hierarchy[vItem.index] ?? {};
                const room = mx.getRoom(roomId);
                const renderDepth = room?.isSpaceRoom() ? depth - 2 : depth - 1;
                if (!room) return null;
                if (depth === subspaceHierarchyLimit && room.isSpaceRoom()) {
                  return (
                    <VirtualTile
                      virtualItem={vItem}
                      key={vItem.index}
                      ref={virtualizer.measureElement}
                    >
                      <div style={{ paddingLeft: `calc(${renderDepth} * ${config.space.S400})` }}>
                        <SpaceNavItem
                          room={room}
                          selected={selectedRoomId === roomId}
                          linkPath={getSpaceLobbyPath(getCanonicalAliasOrRoomId(mx, roomId))}
                        />
                      </div>
                    </VirtualTile>
                  );
                }

                const paddingTop = getCategoryPadding(depth);
                const paddingLeft = `calc(${renderDepth} * ${config.space.S400})`;

                if (room.isSpaceRoom()) {
                  const categoryId = makeNavCategoryId(space.roomId, roomId);
                  const closedViaCategory = getInClosedCategories(space.roomId, roomId);

                  return (
                    <VirtualTile
                      virtualItem={vItem}
                      key={vItem.index}
                      ref={virtualizer.measureElement}
                    >
                      <div style={{ paddingTop, paddingLeft }}>
                        <NavCategoryHeader>
                          <RoomNavCategoryButton
                            data-category-id={categoryId}
                            onClick={handleCategoryClick}
                            closed={closedCategories.has(categoryId) || closedViaCategory}
                          >
                            {roomId === space.roomId ? 'Rooms' : room?.name}
                          </RoomNavCategoryButton>
                        </NavCategoryHeader>
                      </div>
                    </VirtualTile>
                  );
                }

                return (
                  <VirtualTile
                    virtualItem={vItem}
                    key={vItem.index}
                    ref={virtualizer.measureElement}
                  >
                    <div style={{ paddingLeft }}>
                      <RoomNavItem
                        room={room}
                        selected={selectedRoomId === roomId}
                        showAvatar={mDirects.has(roomId)}
                        direct={mDirects.has(roomId)}
                        linkPath={getToLink(roomId)}
                        notificationMode={getRoomNotificationMode(
                          notificationPreferences,
                          room.roomId
                        )}
                      />
                    </div>
                  </VirtualTile>
                );
              })}
              {getConnectorSVG(hierarchy, virtualizedItems)}
            </NavCategory>
          </Box>
        </PageNavContent>
      </SwipeableOverlayWrapper>
    </PageNav>
  );
}
