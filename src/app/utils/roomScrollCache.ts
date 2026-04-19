import { CacheSnapshot } from 'virtua';

export type RoomScrollCache = {
  /** VList item-size snapshot — restored via VList `cache=` prop on remount. */
  cache: CacheSnapshot;
  /** Pixel scroll offset at the time the room was left. */
  scrollOffset: number;
  /** Whether the view was pinned to the bottom (live) when the room was left. */
  atBottom: boolean;
  /**
   * Raw event IDs from the loaded head of the timeline when the snapshot was
   * captured. Virtua's cache is index-based, so head changes invalidate it.
   */
  headEventIds: string[];
};

/** Session-scoped, per-room scroll cache. Not persisted across page reloads. */
const scrollCacheMap = new Map<string, RoomScrollCache>();

const cacheKey = (userId: string, roomId: string): string => `${userId}:${roomId}`;
const headMatches = (saved: string[], current: string[]): boolean =>
  saved.length > 0 &&
  current.length >= saved.length &&
  saved.every((eventId, index) => current[index] === eventId);

export const roomScrollCache = {
  save(userId: string, roomId: string, data: RoomScrollCache): void {
    scrollCacheMap.set(cacheKey(userId, roomId), data);
  },
  load(
    userId: string,
    roomId: string,
    currentHeadEventIds?: string[]
  ): RoomScrollCache | undefined {
    const cached = scrollCacheMap.get(cacheKey(userId, roomId));
    if (!cached) return undefined;
    if (!currentHeadEventIds) return cached;
    if (!headMatches(cached.headEventIds, currentHeadEventIds)) return undefined;
    return cached;
  },
};
