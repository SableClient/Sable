import type { MatrixClient, MSC3575RoomData, SlidingSync } from '$types/matrix-sdk';
import {
  EventType,
  KnownMembership,
  MatrixEvent,
  SlidingSyncEvent,
  UNSTABLE_ELEMENT_FUNCTIONAL_USERS,
} from '$types/matrix-sdk';
import { CustomAccountDataEvent } from '$types/matrix/accountData';
import { CustomStateEvent } from '$types/matrix/room';

const CACHE_VERSION = 1;
export const SIDEBAR_CACHE_KEY_PREFIX = 'sable.slidingSyncSidebarCache.';
const CACHE_WRITE_DELAY_MS = 500;
const MAX_CACHED_ROOMS = 2000;
const HYDRATION_BATCH_SIZE = 50;

type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

type StateEvent = MSC3575RoomData['required_state'][number];

type SidebarCacheData = {
  version: number;
  rooms: Record<string, MSC3575RoomData>;
  accountData: Record<string, Record<string, unknown>>;
};

const CACHED_ACCOUNT_DATA_TYPES = new Set<string>([
  EventType.Direct,
  CustomAccountDataEvent.CinnySpaces,
]);

const CACHED_STATE_TYPES = new Set<string>([
  EventType.RoomCreate,
  EventType.RoomName,
  EventType.RoomTopic,
  EventType.RoomAvatar,
  EventType.RoomCanonicalAlias,
  EventType.RoomJoinRules,
  EventType.RoomHistoryVisibility,
  EventType.RoomGuestAccess,
  EventType.RoomEncryption,
  EventType.RoomTombstone,
  EventType.RoomPowerLevels,
  EventType.RoomPinnedEvents,
  EventType.RoomServerAcl,
  EventType.SpaceChild,
  EventType.SpaceParent,
  UNSTABLE_ELEMENT_FUNCTIONAL_USERS.name,
  CustomStateEvent.PowerLevelTags,
  CustomStateEvent.RoomWidget,
  CustomStateEvent.RoomAbbreviations,
  CustomStateEvent.RoomBanner,
]);

const emptyCache = (): SidebarCacheData => ({
  version: CACHE_VERSION,
  rooms: {},
  accountData: {},
});

const stateEventKey = (event: StateEvent): string => `${event.type}\u0000${event.state_key}`;

const mergeStateEvents = (
  previous: StateEvent[] | undefined,
  incoming: StateEvent[] | undefined,
  userId: string
): StateEvent[] => {
  const merged = new Map<string, StateEvent>();
  previous?.forEach((event) => merged.set(stateEventKey(event), event));
  incoming?.forEach((event) => {
    const cacheMember =
      event.type === (EventType.RoomMember as string) && event.state_key === userId;
    if (cacheMember || CACHED_STATE_TYPES.has(event.type)) {
      merged.set(stateEventKey(event), event);
    }
  });
  return [...merged.values()];
};

const selfMembership = (events: StateEvent[] | undefined, userId: string): string | undefined => {
  const event = events?.find(
    (e) => e.type === (EventType.RoomMember as string) && e.state_key === userId
  );
  const content = event?.content;
  return content && typeof content === 'object'
    ? (content as { membership?: string }).membership
    : undefined;
};

// The SDK derives an invite from invite_state and ignores required_state, so a
// server that keeps sending invite_state after a join (Continuwuity) would
// resurrect a stale invite. required_state membership is authoritative here.
const resolveInviteState = (
  requiredState: StateEvent[] | undefined,
  inviteState: StateEvent[] | undefined,
  userId: string
): StateEvent[] | undefined =>
  selfMembership(requiredState, userId) === KnownMembership.Join ? undefined : inviteState;

const mergeRoomData = (
  previous: MSC3575RoomData | undefined,
  incoming: MSC3575RoomData,
  userId: string
): MSC3575RoomData => {
  const required_state = mergeStateEvents(
    previous?.required_state,
    incoming.required_state,
    userId
  );
  const invite_state = incoming.invite_state
    ? mergeStateEvents(previous?.invite_state, incoming.invite_state, userId)
    : previous?.invite_state;

  return {
    ...previous,
    ...incoming,
    name: incoming.name ?? previous?.name ?? '',
    heroes: incoming.heroes ?? previous?.heroes,
    notification_count: incoming.notification_count ?? previous?.notification_count,
    highlight_count: incoming.highlight_count ?? previous?.highlight_count,
    joined_count: incoming.joined_count ?? previous?.joined_count,
    invited_count: incoming.invited_count ?? previous?.invited_count,
    is_dm: incoming.is_dm ?? previous?.is_dm,
    bump_stamp: incoming.bump_stamp ?? previous?.bump_stamp,
    required_state,
    invite_state: resolveInviteState(required_state, invite_state, userId),
    timeline: [],
    initial: true,
    limited: false,
    num_live: 0,
    prev_batch: undefined,
  };
};

const parseCache = (value: string | null): SidebarCacheData => {
  if (!value) return emptyCache();
  try {
    const parsed = JSON.parse(value) as Partial<SidebarCacheData>;
    if (parsed.version !== CACHE_VERSION || !parsed.rooms || !parsed.accountData) {
      return emptyCache();
    }
    return parsed as SidebarCacheData;
  } catch {
    return emptyCache();
  }
};

const hydrateRoomBatch = async (
  slidingSync: SlidingSync,
  rooms: [string, MSC3575RoomData][],
  startIndex = 0
): Promise<void> => {
  const batch = rooms.slice(startIndex, startIndex + HYDRATION_BATCH_SIZE);
  await Promise.all(
    batch.map(([roomId, roomData]) =>
      slidingSync.emitPromised(SlidingSyncEvent.RoomData, roomId, roomData)
    )
  );
  if (startIndex + HYDRATION_BATCH_SIZE < rooms.length) {
    await hydrateRoomBatch(slidingSync, rooms, startIndex + HYDRATION_BATCH_SIZE);
  }
};

export class SlidingSyncSidebarCache {
  public static clear(userId: string): void {
    try {
      globalThis.localStorage?.removeItem(
        `${SIDEBAR_CACHE_KEY_PREFIX}${encodeURIComponent(userId)}`
      );
    } catch {
      // Storage can be disabled for this origin.
    }
  }

  private readonly storageKey: string;

  private data: SidebarCacheData;

  private writeTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

  private idleWriteHandle: number | undefined;

  public constructor(private readonly userId: string) {
    this.storageKey = `${SIDEBAR_CACHE_KEY_PREFIX}${encodeURIComponent(userId)}`;
    let stored: string | null = null;
    try {
      stored = globalThis.localStorage?.getItem(this.storageKey) ?? null;
    } catch {
      // Storage can be disabled for this origin.
    }
    this.data = parseCache(stored);
  }

  public cacheRoom(roomId: string, roomData: MSC3575RoomData): void {
    this.data.rooms[roomId] = mergeRoomData(this.data.rooms[roomId], roomData, this.userId);
    this.scheduleWrite();
  }

  public removeRoom(roomId: string): void {
    if (!this.data.rooms[roomId]) return;
    delete this.data.rooms[roomId];
    this.scheduleWrite();
  }

  public reconcileRooms(validRoomIds: ReadonlySet<string>): string[] {
    const removedRoomIds = Object.keys(this.data.rooms).filter(
      (roomId) => !validRoomIds.has(roomId)
    );
    if (removedRoomIds.length === 0) return removedRoomIds;

    removedRoomIds.forEach((roomId) => delete this.data.rooms[roomId]);
    this.scheduleWrite();
    return removedRoomIds;
  }

  // Backstop for rooms the server confirms joined but whose required_state still
  // reads invite (e.g. joined on another client), which resolveInviteState misses.
  public clearInviteStateForRooms(roomIds: readonly string[]): void {
    let changed = false;
    for (const roomId of roomIds) {
      const room = this.data.rooms[roomId];
      if (room?.invite_state !== undefined) {
        room.invite_state = undefined;
        changed = true;
      }
    }
    if (changed) this.scheduleWrite();
  }

  // Heal a cache that persisted invite_state for a room required_state already
  // shows as joined, so recovery happens offline on hydration.
  private sanitizeInviteState(): void {
    let changed = false;
    for (const room of Object.values(this.data.rooms)) {
      if (room.invite_state === undefined) continue;
      if (resolveInviteState(room.required_state, room.invite_state, this.userId) === undefined) {
        room.invite_state = undefined;
        changed = true;
      }
    }
    if (changed) this.scheduleWrite();
  }

  public cacheAccountData(event: MatrixEvent): void {
    if (!CACHED_ACCOUNT_DATA_TYPES.has(event.getType())) return;
    this.data.accountData[event.getType()] = event.getContent<Record<string, unknown>>();
    this.scheduleWrite();
  }

  public async hydrate(mx: MatrixClient, slidingSync: SlidingSync): Promise<boolean> {
    this.sanitizeInviteState();
    const rooms = Object.entries(this.data.rooms);
    const accountData = Object.entries(this.data.accountData);
    if (rooms.length === 0 && accountData.length === 0) return false;

    if (accountData.length > 0) {
      mx.store.storeAccountDataEvents(
        accountData.map(([type, content]) => new MatrixEvent({ type, content }))
      );
    }

    await hydrateRoomBatch(slidingSync, rooms);
    return rooms.length > 0;
  }

  public dispose(): void {
    let shouldWrite = false;
    if (this.writeTimer !== undefined) {
      globalThis.clearTimeout(this.writeTimer);
      this.writeTimer = undefined;
      shouldWrite = true;
    }
    if (this.idleWriteHandle !== undefined) {
      (globalThis as IdleWindow).cancelIdleCallback?.(this.idleWriteHandle);
      this.idleWriteHandle = undefined;
      shouldWrite = true;
    }
    if (shouldWrite) this.write();
  }

  private scheduleWrite(): void {
    if (this.writeTimer !== undefined || this.idleWriteHandle !== undefined) return;
    this.writeTimer = globalThis.setTimeout(() => {
      this.writeTimer = undefined;
      const idleWindow = globalThis as IdleWindow;
      if (typeof idleWindow.requestIdleCallback === 'function') {
        this.idleWriteHandle = idleWindow.requestIdleCallback(
          () => {
            this.idleWriteHandle = undefined;
            this.write();
          },
          { timeout: 2000 }
        );
        return;
      }
      this.write();
    }, CACHE_WRITE_DELAY_MS);
  }

  private write(): void {
    let rooms = Object.entries(this.data.rooms)
      .toSorted(([, a], [, b]) => (b.bump_stamp ?? 0) - (a.bump_stamp ?? 0))
      .slice(0, MAX_CACHED_ROOMS);

    while (true) {
      const nextData = { ...this.data, rooms: Object.fromEntries(rooms) };
      try {
        globalThis.localStorage?.setItem(this.storageKey, JSON.stringify(nextData));
        this.data = nextData;
        return;
      } catch {
        if (rooms.length <= 1) return;
        rooms = rooms.slice(0, Math.floor(rooms.length / 2));
      }
    }
  }
}
