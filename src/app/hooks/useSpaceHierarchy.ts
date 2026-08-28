import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MatrixEvent, Room, IHierarchyRoom } from '$types/matrix-sdk';
import { MatrixError, EventType } from '$types/matrix-sdk';
import type { QueryFunction } from '@tanstack/react-query';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { MSpaceChildContent } from '$types/matrix/room';

import { roomToParentsAtom } from '$state/room/roomToParents';
import { getAllParents, getStateEvents, isValidChild } from '$utils/room/hierarchy';
import { isRoomId } from '$utils/matrix';
import type { SortFunc } from '$utils/sort';
import { byOrderKey, byTsOldToNew, factoryRoomIdByActivity } from '$utils/sort';
import { useMatrixClient } from './useMatrixClient';
import { makeLobbyCategoryId } from '../state/closedLobbyCategories';
import { useStateEventCallback } from './useStateEventCallback';
import { ErrorCode } from '../cs-errorcode';

export type HierarchyItemSpace = {
  roomId: string;
  content: MSpaceChildContent;
  ts: number;
  space: true;
  parentId?: string;
  depth: number;
};

export type HierarchyItemRoom = {
  roomId: string;
  content: MSpaceChildContent;
  ts: number;
  parentId: string;
  depth: number;
};

export type HierarchyItem = HierarchyItemSpace | HierarchyItemRoom;

export const getSpaceHierarchyItemKey = (spaceId: string, item: HierarchyItem): string =>
  `${spaceId}:${item.parentId ?? ''}:${item.roomId}:${item.depth}`;

type GetRoomCallback = (roomId: string) => Room | undefined;

const hierarchyItemSort: SortFunc<HierarchyItem> = (a, b) => {
  const orderCmp = byOrderKey(a.content.order, b.content.order);
  if (orderCmp !== 0) return orderCmp;
  return byTsOldToNew(a.ts, b.ts);
};

const childEventSort: SortFunc<MatrixEvent> = (a, b) => {
  const orderCmp = byOrderKey(
    a.getContent<MSpaceChildContent>().order,
    b.getContent<MSpaceChildContent>().order
  );
  if (orderCmp !== 0) return orderCmp;
  return byTsOldToNew(a.getTs(), b.getTs());
};

const getHierarchySpaces = (
  rootSpaceId: string,
  getRoom: GetRoomCallback,
  excludeRoom: (parentId: string, roomId: string, depth: number) => boolean,
  spaceRooms: Set<string>
): HierarchyItemSpace[] => {
  const rootSpaceItem: HierarchyItemSpace = {
    roomId: rootSpaceId,
    content: { via: [] },
    ts: 0,
    space: true,
    depth: 0,
  };
  const spaceItems: HierarchyItemSpace[] = [];

  const findAndCollectHierarchySpaces = (
    spaceItem: HierarchyItemSpace,
    parentSpaceId: string,
    visited: Set<string> = new Set()
  ) => {
    const spaceItemId = makeLobbyCategoryId(parentSpaceId, spaceItem.roomId);

    // Prevent infinite recursion
    if (visited.has(spaceItemId)) return;
    visited.add(spaceItemId);

    const space = getRoom(spaceItem.roomId);
    spaceItems.push(spaceItem);

    if (!space) return;
    const childEvents = getStateEvents(space, EventType.SpaceChild)
      .filter((childEvent) => {
        if (!isValidChild(childEvent)) return false;
        const childId = childEvent.getStateKey();
        if (!childId || !isRoomId(childId)) return false;
        if (excludeRoom(spaceItem.roomId, childId, spaceItem.depth)) return false;

        // because we can not find if a childId is space without joining
        // or requesting room summary, we will look it into spaceRooms local
        // cache which we maintain as we load summary in UI.
        return getRoom(childId)?.isSpaceRoom() || spaceRooms.has(childId);
      })
      .toSorted(childEventSort);

    childEvents.forEach((childEvent) => {
      const childId = childEvent.getStateKey();
      if (!childId || !isRoomId(childId)) return;

      const childItem: HierarchyItemSpace = {
        roomId: childId,
        content: childEvent.getContent<MSpaceChildContent>(),
        ts: childEvent.getTs(),
        space: true,
        parentId: spaceItem.roomId,
        depth: spaceItem.depth + 1,
      };
      findAndCollectHierarchySpaces(childItem, spaceItem.roomId, visited);
    });
  };
  findAndCollectHierarchySpaces(rootSpaceItem, rootSpaceId);

  return spaceItems;
};

export type SpaceHierarchy = {
  space: HierarchyItemSpace;
  rooms?: HierarchyItemRoom[];
};
const getSpaceHierarchy = (
  rootSpaceId: string,
  spaceRooms: Set<string>,
  getRoom: (roomId: string) => Room | undefined,
  excludeRoom: (parentId: string, roomId: string, depth: number) => boolean,
  closedCategory: (spaceId: string) => boolean
): SpaceHierarchy[] => {
  const spaceItems: HierarchyItemSpace[] = getHierarchySpaces(
    rootSpaceId,
    getRoom,
    excludeRoom,
    spaceRooms
  );

  const hierarchy: SpaceHierarchy[] = spaceItems.map((spaceItem) => {
    const space = getRoom(spaceItem.roomId);
    if (!space || closedCategory(spaceItem.roomId)) {
      return {
        space: spaceItem,
      };
    }
    const childEvents = getStateEvents(space, EventType.SpaceChild);
    const childItems: HierarchyItemRoom[] = [];
    childEvents.forEach((childEvent) => {
      if (!isValidChild(childEvent)) return;
      const childId = childEvent.getStateKey();
      if (!childId || !isRoomId(childId)) return;
      if (getRoom(childId)?.isSpaceRoom() || spaceRooms.has(childId)) return;

      const childItem: HierarchyItemRoom = {
        roomId: childId,
        content: childEvent.getContent<MSpaceChildContent>(),
        ts: childEvent.getTs(),
        parentId: spaceItem.roomId,
        depth: spaceItem.depth,
      };
      childItems.push(childItem);
    });

    return {
      space: spaceItem,
      rooms: childItems.toSorted(hierarchyItemSort),
    };
  });

  return hierarchy;
};

/**
 * Shared reactive wrapper: compute a hierarchy value and re-compute when a
 * SpaceChild event fires on the space or any of its descendants.
 *
 * The {@link useMemo} factory receives the spaceId as its single argument so
 * callers can pass their own parameterized closure (e.g.
 * {@link getSpaceHierarchy} or {@link getSpaceJoinedHierarchy}).
 */
const useReactiveHierarchy = <T>(
  spaceId: string,
  factory: (spaceId: string) => T,
  deps: unknown[]
): T => {
  const mx = useMatrixClient();
  const roomToParents = useAtomValue(roomToParentsAtom);

  const [hierarchyKey, setHierarchyKey] = useState(0);

  const hierarchy = useMemo(() => {
    void hierarchyKey;
    return factory(spaceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, ...deps, hierarchyKey]);

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() !== (EventType.SpaceChild as string)) return;
        const eventRoomId = mEvent.getRoomId();
        if (!eventRoomId) return;

        if (spaceId === eventRoomId || getAllParents(roomToParents, eventRoomId).has(spaceId)) {
          setHierarchyKey((k) => k + 1);
        }
      },
      [spaceId, roomToParents, setHierarchyKey]
    )
  );

  return hierarchy;
};

export const useSpaceHierarchy = (
  spaceId: string,
  spaceRooms: Set<string>,
  getRoom: (roomId: string) => Room | undefined,
  excludeRoom: (parentId: string, roomId: string, depth: number) => boolean,
  closedCategory: (spaceId: string) => boolean
): SpaceHierarchy[] =>
  useReactiveHierarchy(
    spaceId,
    (sid) => getSpaceHierarchy(sid, spaceRooms, getRoom, excludeRoom, closedCategory),
    [spaceRooms, getRoom, closedCategory, excludeRoom]
  );

const getSpaceJoinedHierarchy = (
  rootSpaceId: string,
  getRoom: GetRoomCallback,
  excludeRoom: (parentId: string, roomId: string, depth: number) => boolean,
  sortRoomItems: (parentId: string, items: HierarchyItem[]) => HierarchyItem[]
): HierarchyItem[] => {
  const spaceItems: HierarchyItemSpace[] = getHierarchySpaces(
    rootSpaceId,
    getRoom,
    excludeRoom,
    new Set()
  );

  /**
   * Recursively checks if the given space or any of its descendants contain non-space rooms.
   *
   * @param spaceId - The space ID to check.
   * @param visited - Set used to prevent recursion errors.
   * @returns True if the space or any descendant contains non-space rooms.
   */
  const getContainsRoom = (spaceId: string, visited: Set<string> = new Set()) => {
    // Prevent infinite recursion
    if (visited.has(spaceId)) return false;
    visited.add(spaceId);

    const space = getRoom(spaceId);
    if (!space) return false;

    const childEvents = getStateEvents(space, EventType.SpaceChild);

    return childEvents.some((childEvent): boolean => {
      if (!isValidChild(childEvent)) return false;
      const childId = childEvent.getStateKey();
      if (!childId || !isRoomId(childId)) return false;
      const room = getRoom(childId);
      if (!room) return false;

      if (!room.isSpaceRoom()) return true;
      return getContainsRoom(childId, visited);
    });
  };

  const hierarchy: HierarchyItem[] = spaceItems.flatMap((spaceItem) => {
    const space = getRoom(spaceItem.roomId);
    if (!space) {
      return [];
    }
    const joinedRoomEvents = getStateEvents(space, EventType.SpaceChild).filter((childEvent) => {
      if (!isValidChild(childEvent)) return false;
      const childId = childEvent.getStateKey();
      if (!childId || !isRoomId(childId)) return false;
      const room = getRoom(childId);
      if (!room || room.isSpaceRoom()) return false;

      return true;
    });

    if (!getContainsRoom(spaceItem.roomId)) return [];

    const childItems: HierarchyItemRoom[] = [];
    joinedRoomEvents.forEach((childEvent) => {
      const childId = childEvent.getStateKey();
      if (!childId) return;

      if (excludeRoom(space.roomId, childId, spaceItem.depth)) return;

      const childItem: HierarchyItemRoom = {
        roomId: childId,
        content: childEvent.getContent<MSpaceChildContent>(),
        ts: childEvent.getTs(),
        parentId: spaceItem.roomId,
        depth: spaceItem.depth,
      };
      childItems.push(childItem);
    });
    return ([spaceItem] as HierarchyItem[]).concat(sortRoomItems(spaceItem.roomId, childItems));
  });

  return hierarchy;
};

export const useSpaceJoinedHierarchy = (
  spaceId: string,
  getRoom: GetRoomCallback,
  excludeRoom: (parentId: string, roomId: string, depth: number) => boolean,
  sortByActivity: (spaceId: string) => boolean
): HierarchyItem[] => {
  const mx = useMatrixClient();

  const sortRoomItems = useCallback(
    (sId: string, items: HierarchyItem[]) => {
      if (sortByActivity(sId)) {
        return items.toSorted((a, b) => factoryRoomIdByActivity(mx)(a.roomId, b.roomId));
      }
      return items.toSorted(hierarchyItemSort);
    },
    [mx, sortByActivity]
  );

  return useReactiveHierarchy(
    spaceId,
    (sid) => getSpaceJoinedHierarchy(sid, getRoom, excludeRoom, sortRoomItems),
    [getRoom, excludeRoom, sortRoomItems]
  );
};

// we will paginate until 5000 items
const PER_PAGE_COUNT = 100;
const MAX_AUTO_PAGE_COUNT = 50;
export type FetchSpaceHierarchyLevelData = {
  fetching: boolean;
  error: Error | null;
  rooms: Map<string, IHierarchyRoom>;
};
export const useFetchSpaceHierarchyLevel = (
  roomId: string,
  enable: boolean
): FetchSpaceHierarchyLevelData => {
  const mx = useMatrixClient();
  const pageNoRef = useRef(0);

  const fetchLevel: QueryFunction<
    Awaited<ReturnType<typeof mx.getRoomHierarchy>>,
    string[],
    string | undefined
  > = useCallback(
    ({ pageParam }) => mx.getRoomHierarchy(roomId, PER_PAGE_COUNT, 1, false, pageParam),
    [roomId, mx]
  );

  const queryResponse = useInfiniteQuery({
    refetchOnMount: enable,
    queryKey: [roomId, 'hierarchy_level'],
    initialPageParam: undefined,
    queryFn: fetchLevel,
    getNextPageParam: (result) => {
      if (result.next_batch) return result.next_batch;
      return undefined;
    },
    retry: 5,
    retryDelay: (failureCount, error) => {
      if (
        error instanceof MatrixError &&
        error.errcode === (ErrorCode.M_LIMIT_EXCEEDED as string)
      ) {
        const { retry_after_ms: delay } = error.data;
        if (typeof delay === 'number') {
          return delay;
        }
      }

      return 500 * failureCount;
    },
  });

  const { data, isLoading, isFetchingNextPage, error, fetchNextPage, hasNextPage } = queryResponse;

  useEffect(() => {
    if (
      hasNextPage &&
      pageNoRef.current <= MAX_AUTO_PAGE_COUNT &&
      !error &&
      data &&
      data.pages.length > 0
    ) {
      pageNoRef.current += 1;
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, data, error]);

  const rooms: Map<string, IHierarchyRoom> = useMemo(() => {
    const roomsMap: Map<string, IHierarchyRoom> = new Map();
    if (!data) return roomsMap;

    const rms = data.pages.flatMap((result) => result.rooms);
    rms.forEach((r) => {
      roomsMap.set(r.room_id, r);
    });

    return roomsMap;
  }, [data]);

  const fetching = isLoading || isFetchingNextPage;

  return {
    fetching,
    error,
    rooms,
  };
};
