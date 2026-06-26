import { atom, useAtom, useAtomValue } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MatrixEvent, Room, IHierarchyRoom } from '$types/matrix-sdk';
import { MatrixError, EventType } from '$types/matrix-sdk';
import type { QueryFunction } from '@tanstack/react-query';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { MSpaceChildContent } from '$types/matrix/room';

import { roomToParentsAtom } from '$state/room/roomToParents';
import { getAllParents, getStateEvents, isValidChild } from '$utils/room';
import { isRoomId } from '$utils/matrix';
import type { SortFunc } from '$utils/sort';
import { byOrderKey, byTsOldToNew, factoryRoomIdByActivity } from '$utils/sort';
import { useMatrixClient } from './useMatrixClient';
import { makeLobbyCategoryId } from '$state/closedLobbyCategories';
import { useStateEventCallback } from './useStateEventCallback';
import { ErrorCode } from '$app/cs-errorcode';

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

type GetRoomCallback = (roomId: string) => Room | undefined;

const hierarchyItemTs: SortFunc<HierarchyItem> = (a, b) => byTsOldToNew(a.ts, b.ts);
const hierarchyItemByOrder: SortFunc<HierarchyItem> = (a, b) =>
  byOrderKey(a.content.order, b.content.order);

const childEventTs: SortFunc<MatrixEvent> = (a, b) => byTsOldToNew(a.getTs(), b.getTs());
const childEventByOrder: SortFunc<MatrixEvent> = (a, b) =>
  byOrderKey(a.getContent<MSpaceChildContent>().order, b.getContent<MSpaceChildContent>().order);

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
      .toSorted(childEventTs)
      .toSorted(childEventByOrder);

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
      rooms: childItems.toSorted(hierarchyItemTs).toSorted(hierarchyItemByOrder),
    };
  });

  return hierarchy;
};

export const useSpaceHierarchy = (
  spaceId: string,
  spaceRooms: Set<string>,
  getRoom: (roomId: string) => Room | undefined,
  excludeRoom: (parentId: string, roomId: string, depth: number) => boolean,
  closedCategory: (spaceId: string) => boolean
): SpaceHierarchy[] => {
  const mx = useMatrixClient();
  const roomToParents = useAtomValue(roomToParentsAtom);

  const [hierarchyAtom] = useState(() =>
    atom(getSpaceHierarchy(spaceId, spaceRooms, getRoom, excludeRoom, closedCategory))
  );
  const [hierarchy, setHierarchy] = useAtom(hierarchyAtom);

  useEffect(() => {
    setHierarchy(getSpaceHierarchy(spaceId, spaceRooms, getRoom, excludeRoom, closedCategory));
  }, [mx, spaceId, spaceRooms, setHierarchy, getRoom, closedCategory, excludeRoom]);

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() !== (EventType.SpaceChild as string)) return;
        const eventRoomId = mEvent.getRoomId();
        if (!eventRoomId) return;

        if (spaceId === eventRoomId || getAllParents(roomToParents, eventRoomId).has(spaceId)) {
          setHierarchy(
            getSpaceHierarchy(spaceId, spaceRooms, getRoom, excludeRoom, closedCategory)
          );
        }
      },
      [spaceId, roomToParents, setHierarchy, spaceRooms, getRoom, closedCategory, excludeRoom]
    )
  );

  return hierarchy;
};

export const getSpaceJoinedHierarchy = (
  rootSpaceId: string,
  getRoom: GetRoomCallback,
  excludeRoom: (parentId: string, roomId: string, depth: number) => boolean,
  excludeBranchRoom: (parentId: string, roomId: string, depth: number) => boolean,
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
  const getContainsRoom = (spaceId: string, depth: number, visited: Set<string> = new Set()) => {
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
      if (excludeBranchRoom(spaceId, childId, depth)) return false;
      const room = getRoom(childId);
      if (!room) return false;

      if (!room.isSpaceRoom()) return true;
      return getContainsRoom(childId, depth + 1, visited);
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

    if (!getContainsRoom(spaceItem.roomId, spaceItem.depth)) return [];

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
  excludeBranchRoom: (parentId: string, roomId: string, depth: number) => boolean,
  sortByActivity: (spaceId: string) => boolean
): HierarchyItem[] => {
  const mx = useMatrixClient();
  const roomToParents = useAtomValue(roomToParentsAtom);

  const sortRoomItems = useCallback(
    (sId: string, items: HierarchyItem[]) => {
      if (sortByActivity(sId)) {
        items.sort((a, b) => factoryRoomIdByActivity(mx)(a.roomId, b.roomId));
        return items;
      }
      return items.toSorted(hierarchyItemTs).toSorted(hierarchyItemByOrder);
    },
    [mx, sortByActivity]
  );

  const [hierarchyAtom] = useState(() =>
    atom(getSpaceJoinedHierarchy(spaceId, getRoom, excludeRoom, excludeBranchRoom, sortRoomItems))
  );
  const [hierarchy, setHierarchy] = useAtom(hierarchyAtom);

  useEffect(() => {
    setHierarchy(
      getSpaceJoinedHierarchy(spaceId, getRoom, excludeRoom, excludeBranchRoom, sortRoomItems)
    );
  }, [mx, spaceId, setHierarchy, getRoom, excludeRoom, excludeBranchRoom, sortRoomItems]);

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() !== (EventType.SpaceChild as string)) return;
        const eventRoomId = mEvent.getRoomId();
        if (!eventRoomId) return;

        if (spaceId === eventRoomId || getAllParents(roomToParents, eventRoomId).has(spaceId)) {
          setHierarchy(
            getSpaceJoinedHierarchy(spaceId, getRoom, excludeRoom, excludeBranchRoom, sortRoomItems)
          );
        }
      },
      [spaceId, roomToParents, setHierarchy, getRoom, excludeRoom, excludeBranchRoom, sortRoomItems]
    )
  );

  return hierarchy;
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
    enabled: enable,
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

/**
 * Fetches space hierarchy levels for multiple rooms one-at-a-time to avoid
 * triggering N parallel requests (and subsequent 429 rate limiting).
 *
 * @param roomIds - Ordered list of space room IDs to fetch hierarchy for.
 * @returns A Map from roomId to FetchSpaceHierarchyLevelData.
 */
export const useSequentialSpaceHierarchies = (
  roomIds: string[]
): Map<string, FetchSpaceHierarchyLevelData> => {
  const mx = useMatrixClient();
  // Pre-populate on first render so children immediately see fetching:true
  // and skip their own useFetchSpaceHierarchyLevel queries.
  const [results, setResults] = useState<Map<string, FetchSpaceHierarchyLevelData>>(() => {
    const m = new Map<string, FetchSpaceHierarchyLevelData>();
    roomIds.forEach((id) => m.set(id, { fetching: true, error: null, rooms: new Map() }));
    return m;
  });
  const fetchedRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<string[]>([]);
  const processingRef = useRef(false);

  // Stable join so the effect only re-runs when the room list actually changes.
  const roomIdsKey = roomIds.join(',');

  useEffect(() => {
    // Prune stale IDs so removed rooms can be re-fetched if they reappear,
    // and so we don't waste requests on rooms no longer in the hierarchy.
    const currentSet = new Set(roomIds);
    fetchedRef.current.forEach((id) => {
      if (!currentSet.has(id)) fetchedRef.current.delete(id);
    });
    pendingRef.current = pendingRef.current.filter((id) => currentSet.has(id));

    const newIds = roomIds.filter((id) => !fetchedRef.current.has(id));
    if (newIds.length === 0) return;

    newIds.forEach((id) => fetchedRef.current.add(id));
    pendingRef.current = [...pendingRef.current, ...newIds];

    // Eagerly mark all queued IDs as fetching so child components see a
    // non-undefined hierarchyData immediately and skip their own queries.
    setResults((prev) => {
      const next = new Map(prev);
      newIds.forEach((id) => {
        if (!next.has(id)) next.set(id, { fetching: true, error: null, rooms: new Map() });
      });
      return next;
    });

    let cancelled = false;

    const processQueue = async () => {
      // If another instance is running and hasn't been cancelled yet, the new
      // items we added to pendingRef will be picked up by that queue naturally.
      // Only skip if an active (non-cancelled) queue is already running.
      if (processingRef.current) return;
      processingRef.current = true;

      while (pendingRef.current.length > 0) {
        if (cancelled) break;
        const roomId = pendingRef.current.shift();
        if (!roomId) continue;

        if (!cancelled) {
          setResults((prev) => {
            const next = new Map(prev);
            next.set(roomId, { fetching: true, error: null, rooms: new Map() });
            return next;
          });
        }

        const roomsMap: Map<string, IHierarchyRoom> = new Map();
        let nextBatch: string | undefined;
        let pageCount = 0;
        let fetchError: Error | null = null;
        let retry = true;
        let retryCount = 0;
        const MAX_RETRIES = 5;

        while (retry && retryCount <= MAX_RETRIES) {
          if (cancelled) break;
          retry = false;
          try {
            do {
              if (cancelled) break;
              // eslint-disable-next-line no-await-in-loop
              const result = await mx.getRoomHierarchy(roomId, PER_PAGE_COUNT, 1, false, nextBatch);
              result.rooms.forEach((r) => roomsMap.set(r.room_id, r));
              nextBatch = result.next_batch;
              pageCount += 1;
            } while (nextBatch && pageCount <= MAX_AUTO_PAGE_COUNT);
          } catch (err) {
            if (
              err instanceof MatrixError &&
              err.errcode === (ErrorCode.M_LIMIT_EXCEEDED as string)
            ) {
              const { retry_after_ms: delay } = err.data;
              if (typeof delay === 'number') {
                // eslint-disable-next-line no-await-in-loop
                await new Promise<void>((resolve) => {
                  setTimeout(resolve, delay);
                });
                // Reset and retry this same roomId (up to MAX_RETRIES).
                roomsMap.clear();
                nextBatch = undefined;
                pageCount = 0;
                retryCount += 1;
                if (retryCount <= MAX_RETRIES) {
                  retry = true;
                } else {
                  fetchError = err instanceof Error ? err : new Error(String(err));
                }
              } else {
                fetchError = err instanceof Error ? err : new Error(String(err));
              }
            } else {
              fetchError = err instanceof Error ? err : new Error(String(err));
            }
          }
        }

        if (cancelled) {
          // Fetch was interrupted mid-flight; remove from fetchedRef so this
          // room is re-queued on the next effect run rather than stuck forever.
          fetchedRef.current.delete(roomId);
          break;
        }

        setResults((prev) => {
          const next = new Map(prev);
          next.set(roomId, {
            fetching: false,
            error: fetchError,
            rooms: roomsMap,
          });
          return next;
        });
      }

      // Only reset the flag if we weren't cancelled — if we were, the cleanup
      // already reset it so the next effect's processQueue can start fresh.
      if (!cancelled) processingRef.current = false;
    };

    processQueue();
    return () => {
      cancelled = true;
      // Reset so the next effect invocation can start a fresh queue for any
      // items that were added to pendingRef during this run.
      processingRef.current = false;
    };
    // roomIds identity changes every render; roomIdsKey is the stable
    // serialization used as the effect dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomIdsKey, mx]);

  return results;
};
