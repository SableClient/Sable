import { CacheSnapshot } from 'virtua';

export type RoomScrollCache = {
  /** VList item-size snapshot — restored via VList `cache=` prop on remount. */
  cache: CacheSnapshot;
  /** Pixel scroll offset at the time the room was left. */
  scrollOffset: number;
  /** Whether the view was pinned to the bottom (live) when the room was left. */
  atBottom: boolean;
};

/** Session-scoped, per-room scroll cache. Not persisted across page reloads. */
const scrollCacheMap = new Map<string, RoomScrollCache>();

const cacheKey = (userId: string, roomId: string): string => `${userId}:${roomId}`;

export const roomScrollCache = {
  save(userId: string, roomId: string, data: RoomScrollCache): void {
    scrollCacheMap.set(cacheKey(userId, roomId), data);
  },
  load(userId: string, roomId: string): RoomScrollCache | undefined {
    return scrollCacheMap.get(cacheKey(userId, roomId));
  },
};
