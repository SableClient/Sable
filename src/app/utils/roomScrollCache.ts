import { CacheSnapshot } from 'virtua';

export type RoomScrollFingerprint = {
  eventCount: number;
  headEventIds: string[];
  tailEventIds: string[];
  readUptoEventId?: string;
  layoutKey: string;
};

export type RoomScrollPosition =
  | {
      kind: 'live';
    }
  | {
      kind: 'anchor';
      eventId: string;
      offset: number;
    };

export type RoomScrollCache = {
  /** VList item-size snapshot — restored via VList `cache=` prop on remount. */
  measurementCache?: CacheSnapshot;
  /** Logical restore position captured from the rendered timeline. */
  position: RoomScrollPosition;
  /** Timeline/layout fingerprint used to validate index-based measurements. */
  fingerprint: RoomScrollFingerprint;
};

/** Session-scoped, per-room scroll cache. Not persisted across page reloads. */
const scrollCacheMap = new Map<string, RoomScrollCache>();

const cacheKey = (userId: string, roomId: string): string => `${userId}:${roomId}`;

const fingerprintMatches = (
  saved: RoomScrollFingerprint,
  current: RoomScrollFingerprint
): boolean =>
  saved.layoutKey === current.layoutKey &&
  saved.readUptoEventId === current.readUptoEventId &&
  saved.eventCount === current.eventCount &&
  saved.headEventIds.length > 0 &&
  saved.tailEventIds.length > 0 &&
  saved.headEventIds.every((eventId, index) => current.headEventIds[index] === eventId) &&
  saved.tailEventIds.every((eventId, index) => current.tailEventIds[index] === eventId);

export const roomScrollCache = {
  save(userId: string, roomId: string, data: RoomScrollCache): void {
    scrollCacheMap.set(cacheKey(userId, roomId), data);
  },
  load(
    userId: string,
    roomId: string,
    currentFingerprint?: RoomScrollFingerprint
  ): RoomScrollCache | undefined {
    const cached = scrollCacheMap.get(cacheKey(userId, roomId));
    if (!cached) return undefined;
    if (!currentFingerprint) return cached;
    if (!fingerprintMatches(cached.fingerprint, currentFingerprint)) {
      return {
        ...cached,
        measurementCache: undefined,
      };
    }
    return cached;
  },
};
