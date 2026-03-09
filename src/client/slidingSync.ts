import {
  MatrixClient,
  MSC3575List,
  MSC3575RoomSubscription,
  MSC3575_WILDCARD,
  SlidingSync,
  SlidingSyncEvent,
  SlidingSyncState,
  MSC3575_STATE_KEY_LAZY,
  MSC3575_STATE_KEY_ME,
  EventType,
} from '$types/matrix-sdk';
import { createLogger } from '$utils/debug';

const log = createLogger('slidingSync');

const LIST_JOINED = 'joined';
const LIST_INVITES = 'invites';
const LIST_SPACES = 'spaces';
const LIST_SEARCH = 'search';
// One event of timeline per list room is enough to compute unread counts;
// the full history is loaded when the user opens the room.
const LIST_TIMELINE_LIMIT = 1;
const DEFAULT_LIST_PAGE_SIZE = 250;
const DEFAULT_POLL_TIMEOUT_MS = 20000;
const DEFAULT_MAX_ROOMS = 5000;

// Sort order matching Element Web: most urgent rooms (highlights/notifications) first,
// then most recently active, then alphabetical as a tiebreaker.
const LIST_SORT_ORDER = ['by_notification_level', 'by_recency', 'by_name'];

// Subscription key for the room the user is actively viewing.
// Encrypted rooms get [*,*] required_state; unencrypted rooms also request lazy members.
const UNENCRYPTED_SUBSCRIPTION_KEY = 'unencrypted';
// Adaptive timeline limits for the room the user is actively viewing.
// Lower limits reduce initial bandwidth on constrained devices/connections;
// the user can always paginate further once the room is open.
const ACTIVE_ROOM_TIMELINE_LIMIT_LOW = 20;
const ACTIVE_ROOM_TIMELINE_LIMIT_MEDIUM = 35;
const ACTIVE_ROOM_TIMELINE_LIMIT_HIGH = 50;

export type PartialSlidingSyncRequest = {
  filters?: MSC3575List['filters'];
  sort?: string[];
  ranges?: [number, number][];
};

export type SlidingSyncConfig = {
  enabled?: boolean;
  proxyBaseUrl?: string;
  bootstrapClassicOnColdCache?: boolean;
  listPageSize?: number;
  timelineLimit?: number;
  pollTimeoutMs?: number;
  maxRooms?: number;
  includeInviteList?: boolean;
  probeTimeoutMs?: number;
};

export type SlidingSyncListDiagnostics = {
  key: string;
  knownCount: number;
  rangeEnd: number;
};

export type SlidingSyncDiagnostics = {
  proxyBaseUrl: string;
  timelineLimit: number;
  adaptiveTimeline: boolean;
  listPageSize: number;
  lists: SlidingSyncListDiagnostics[];
};

const clampPositive = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return fallback;
  return Math.round(value);
};

type AdaptiveSignals = {
  saveData: boolean;
  effectiveType: string | null;
  deviceMemoryGb: number | null;
  mobile: boolean;
  missingSignals: number;
};

const readAdaptiveSignals = (): AdaptiveSignals => {
  const navigatorLike = typeof navigator !== 'undefined' ? navigator : undefined;
  const connection = (navigatorLike as any)?.connection;
  const effectiveType = connection?.effectiveType;
  const deviceMemory = (navigatorLike as any)?.deviceMemory;
  const uaMobile = (navigatorLike as any)?.userAgentData?.mobile;
  const fallbackMobileUA = navigatorLike?.userAgent ?? '';
  const mobileByUA =
    typeof uaMobile === 'boolean'
      ? uaMobile
      : /Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(fallbackMobileUA);
  const saveData = connection?.saveData === true;
  const normalizedEffectiveType = typeof effectiveType === 'string' ? effectiveType : null;
  const normalizedDeviceMemory = typeof deviceMemory === 'number' ? deviceMemory : null;
  const missingSignals =
    Number(normalizedEffectiveType === null) + Number(normalizedDeviceMemory === null);
  return {
    saveData,
    effectiveType: normalizedEffectiveType,
    deviceMemoryGb: normalizedDeviceMemory,
    mobile: mobileByUA,
    missingSignals,
  };
};

// Resolve the timeline limit for the active-room subscription based on device/network.
// The list subscription always uses LIST_TIMELINE_LIMIT=1 regardless of conditions.
const resolveAdaptiveRoomTimelineLimit = (
  configuredLimit: number | undefined,
  signals: AdaptiveSignals
): number => {
  if (typeof configuredLimit === 'number' && configuredLimit > 0) {
    return clampPositive(configuredLimit, ACTIVE_ROOM_TIMELINE_LIMIT_HIGH);
  }
  if (signals.saveData || signals.effectiveType === 'slow-2g' || signals.effectiveType === '2g') {
    return ACTIVE_ROOM_TIMELINE_LIMIT_LOW;
  }
  if (
    signals.effectiveType === '3g' ||
    (signals.deviceMemoryGb !== null && signals.deviceMemoryGb <= 4)
  ) {
    return ACTIVE_ROOM_TIMELINE_LIMIT_MEDIUM;
  }
  if (signals.mobile && signals.missingSignals > 0) {
    return ACTIVE_ROOM_TIMELINE_LIMIT_MEDIUM;
  }
  return ACTIVE_ROOM_TIMELINE_LIMIT_HIGH;
};

// Minimal required_state for list entries; enough to render the room list sidebar
// and compute unread state without fetching full room history.
// Notes:
//   - RoomName/RoomCanonicalAlias are omitted: sliding sync returns the room name as a
//     top-level field in every list response, so fetching them as state events is redundant.
//   - MSC3575_STATE_KEY_LAZY is omitted: lazy-loading members is only needed when the
//     user is actively viewing a room; loading them for every list entry wastes bandwidth.
const buildListRequiredState = (): MSC3575RoomSubscription['required_state'] => [
  [EventType.RoomJoinRules, ''],
  [EventType.RoomAvatar, ''],
  [EventType.RoomTombstone, ''],
  [EventType.RoomEncryption, ''],
  [EventType.RoomCreate, ''],
  [EventType.RoomMember, MSC3575_STATE_KEY_ME],
];

// For an active encrypted room: fetch everything so the client can decrypt all events.
const buildEncryptedSubscription = (timelineLimit: number): MSC3575RoomSubscription => ({
  timeline_limit: timelineLimit,
  required_state: [[MSC3575_WILDCARD, MSC3575_WILDCARD]],
  include_old_rooms: {
    timeline_limit: 0,
    required_state: [
      [EventType.RoomCreate, ''],
      [EventType.RoomTombstone, ''],
      [EventType.SpaceChild, MSC3575_WILDCARD],
      [EventType.SpaceParent, MSC3575_WILDCARD],
      [EventType.RoomMember, MSC3575_STATE_KEY_ME],
    ],
  },
});

// For an active unencrypted room: fetch everything, plus explicit lazy+ME members so
// the member list and display names are always available.
const buildUnencryptedSubscription = (timelineLimit: number): MSC3575RoomSubscription => ({
  timeline_limit: timelineLimit,
  required_state: [
    [MSC3575_WILDCARD, MSC3575_WILDCARD],
    [EventType.RoomMember, MSC3575_STATE_KEY_ME],
    [EventType.RoomMember, MSC3575_STATE_KEY_LAZY],
  ],
  include_old_rooms: {
    timeline_limit: 0,
    required_state: [
      [EventType.RoomCreate, ''],
      [EventType.RoomTombstone, ''],
      [EventType.SpaceChild, MSC3575_WILDCARD],
      [EventType.SpaceParent, MSC3575_WILDCARD],
      [EventType.RoomMember, MSC3575_STATE_KEY_ME],
    ],
  },
});

const buildLists = (pageSize: number, includeInviteList: boolean): Map<string, MSC3575List> => {
  const lists = new Map<string, MSC3575List>();
  const listRequiredState = buildListRequiredState();

  // Dedicated spaces list: sorted alpha, no timeline needed, space-child/parent relations
  // included so the spaces sidebar tree can be built from this list alone.
  lists.set(LIST_SPACES, {
    ranges: [[0, 20]],
    sort: ['by_name'],
    timeline_limit: 0,
    required_state: [
      [EventType.RoomJoinRules, ''],
      [EventType.RoomAvatar, ''],
      [EventType.RoomTombstone, ''],
      [EventType.RoomEncryption, ''],
      [EventType.RoomCreate, ''],
      [EventType.SpaceChild, MSC3575_WILDCARD],
      [EventType.SpaceParent, MSC3575_WILDCARD],
      [EventType.RoomMember, MSC3575_STATE_KEY_ME],
    ],
    slow_get_all_rooms: true,
    filters: {
      room_types: ['m.space'],
    },
    include_old_rooms: {
      timeline_limit: 0,
      required_state: [
        [EventType.RoomCreate, ''],
        [EventType.RoomTombstone, ''],
        [EventType.SpaceChild, MSC3575_WILDCARD],
        [EventType.SpaceParent, MSC3575_WILDCARD],
        [EventType.RoomMember, MSC3575_STATE_KEY_ME],
      ],
    },
  });

  const listIncludeOldRooms: MSC3575List['include_old_rooms'] = {
    timeline_limit: 0,
    required_state: [
      [EventType.RoomCreate, ''],
      [EventType.RoomTombstone, ''],
      [EventType.SpaceChild, MSC3575_WILDCARD],
      [EventType.SpaceParent, MSC3575_WILDCARD],
      [EventType.RoomMember, MSC3575_STATE_KEY_ME],
    ],
  };

  lists.set(LIST_JOINED, {
    ranges: [[0, Math.max(0, pageSize - 1)]],
    sort: LIST_SORT_ORDER,
    timeline_limit: LIST_TIMELINE_LIMIT,
    required_state: listRequiredState,
    filters: {
      is_invite: false,
      not_room_types: ['m.space'],
    },
    include_old_rooms: listIncludeOldRooms,
  });

  if (includeInviteList) {
    lists.set(LIST_INVITES, {
      ranges: [[0, Math.max(0, pageSize - 1)]],
      sort: LIST_SORT_ORDER,
      timeline_limit: LIST_TIMELINE_LIMIT,
      required_state: listRequiredState,
      filters: {
        is_invite: true,
      },
      include_old_rooms: listIncludeOldRooms,
    });
  }

  return lists;
};

const getListEndIndex = (list: MSC3575List | null): number => {
  if (!list?.ranges?.length) return -1;
  return list.ranges.reduce((max, range) => Math.max(max, range[1] ?? -1), -1);
};

export class SlidingSyncManager {
  private disposed = false;

  private readonly maxRooms: number;

  private readonly listKeys: string[];

  private readonly activeRoomSubscriptions = new Set<string>();

  private readonly listPageSize: number;

  private roomTimelineLimit: number;

  private readonly adaptiveTimeline: boolean;

  private readonly configuredTimelineLimit?: number;

  private readonly onConnectionChange: () => void;

  private readonly onLifecycle: (state: SlidingSyncState, resp: unknown, err?: Error) => void;

  public readonly slidingSync: SlidingSync;

  public readonly probeTimeoutMs: number;

  public constructor(
    private readonly mx: MatrixClient,
    private readonly proxyBaseUrl: string,
    config: SlidingSyncConfig
  ) {
    const listPageSize = clampPositive(config.listPageSize, DEFAULT_LIST_PAGE_SIZE);
    const pollTimeoutMs = clampPositive(config.pollTimeoutMs, DEFAULT_POLL_TIMEOUT_MS);
    this.probeTimeoutMs = clampPositive(config.probeTimeoutMs, 5000);
    this.maxRooms = clampPositive(config.maxRooms, DEFAULT_MAX_ROOMS);
    this.listPageSize = listPageSize;
    const includeInviteList = config.includeInviteList !== false;

    const adaptiveTimeline = !(typeof config.timelineLimit === 'number' && config.timelineLimit > 0);
    const signals = readAdaptiveSignals();
    const roomTimelineLimit = resolveAdaptiveRoomTimelineLimit(config.timelineLimit, signals);
    this.adaptiveTimeline = adaptiveTimeline;
    this.roomTimelineLimit = roomTimelineLimit;
    this.configuredTimelineLimit = config.timelineLimit;

    const defaultSubscription = buildEncryptedSubscription(roomTimelineLimit);
    const lists = buildLists(listPageSize, includeInviteList);
    this.listKeys = Array.from(lists.keys());
    this.slidingSync = new SlidingSync(proxyBaseUrl, lists, defaultSubscription, mx, pollTimeoutMs);

    // Register a custom subscription for unencrypted active rooms; encrypted rooms use
    // the default subscription (which already has [*,*]).
    this.slidingSync.addCustomSubscription(
      UNENCRYPTED_SUBSCRIPTION_KEY,
      buildUnencryptedSubscription(roomTimelineLimit)
    );

    this.onLifecycle = (state, resp, err) => {
      if (this.disposed || err || !resp || state !== SlidingSyncState.Complete) return;
      this.expandListsToKnownCount();
    };

    this.onConnectionChange = () => {
      if (this.disposed || !this.adaptiveTimeline) return;
      const nextLimit = resolveAdaptiveRoomTimelineLimit(
        this.configuredTimelineLimit,
        readAdaptiveSignals()
      );
      if (nextLimit === this.roomTimelineLimit) return;
      this.roomTimelineLimit = nextLimit;
      this.applyRoomTimelineLimit(nextLimit);
      log.log(`Sliding Sync adaptive room timeline updated to ${nextLimit} for ${this.mx.getUserId()}`);
    };
  }

  public attach(): void {
    this.slidingSync.on(SlidingSyncEvent.Lifecycle, this.onLifecycle);
    const connection = (typeof navigator !== 'undefined' ? (navigator as any).connection : undefined) as
      | { addEventListener?: (e: string, cb: () => void) => void; removeEventListener?: (e: string, cb: () => void) => void; onchange?: (() => void) | null }
      | undefined;
    connection?.addEventListener?.('change', this.onConnectionChange);
    if (connection && connection.onchange === null) connection.onchange = this.onConnectionChange;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onConnectionChange);
      window.addEventListener('offline', this.onConnectionChange);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.slidingSync.removeListener(SlidingSyncEvent.Lifecycle, this.onLifecycle);
    const connection = (typeof navigator !== 'undefined' ? (navigator as any).connection : undefined) as
      | { addEventListener?: (e: string, cb: () => void) => void; removeEventListener?: (e: string, cb: () => void) => void; onchange?: (() => void) | null }
      | undefined;
    connection?.removeEventListener?.('change', this.onConnectionChange);
    if (connection?.onchange === this.onConnectionChange) connection.onchange = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onConnectionChange);
      window.removeEventListener('offline', this.onConnectionChange);
    }
  }

  private applyRoomTimelineLimit(timelineLimit: number): void {
    this.slidingSync.modifyRoomSubscriptionInfo(buildEncryptedSubscription(timelineLimit));
    this.slidingSync.addCustomSubscription(
      UNENCRYPTED_SUBSCRIPTION_KEY,
      buildUnencryptedSubscription(timelineLimit)
    );
  }

  public getDiagnostics(): SlidingSyncDiagnostics {
    return {
      proxyBaseUrl: this.proxyBaseUrl,
      timelineLimit: this.roomTimelineLimit,
      adaptiveTimeline: this.adaptiveTimeline,
      listPageSize: this.listPageSize,
      lists: this.listKeys.map((key) => {
        const listData = this.slidingSync.getListData(key);
        const params = this.slidingSync.getListParams(key);
        return {
          key,
          knownCount: listData?.joinedCount ?? 0,
          rangeEnd: getListEndIndex(params),
        };
      }),
    };
  }

  private expandListsToKnownCount(): void {
    this.listKeys.forEach((key) => {
      const listData = this.slidingSync.getListData(key);
      const knownCount = listData?.joinedCount ?? 0;
      if (knownCount <= 0) return;

      const desiredEnd = Math.min(knownCount, this.maxRooms) - 1;
      const existing = this.slidingSync.getListParams(key);
      const currentEnd = getListEndIndex(existing);
      if (desiredEnd === currentEnd) return;

      this.slidingSync.setListRanges(key, [[0, desiredEnd]]);
      if (knownCount > this.maxRooms) {
        log.warn(
          `Sliding Sync list "${key}" capped at ${this.maxRooms}/${knownCount} rooms for ${this.mx.getUserId()}`
        );
      }
    });
  }

  /**
   * Ensure a dynamic list is registered (or updated) on the sliding sync session.
   * If the list does not yet exist it is created with sensible defaults merged with
   * `updateArgs`. If it already exists and the merged result differs, only the ranges
   * are updated (cheaper — avoids resending sticky params) when `updateArgs` only
   * contains `ranges`; otherwise the full list is replaced.
   *
   * This mirrors Element Web's `SlidingSyncManager.ensureListRegistered`.
   */
  public ensureListRegistered(listKey: string, updateArgs: PartialSlidingSyncRequest): MSC3575List {
    let list = this.slidingSync.getListParams(listKey);
    if (!list) {
      list = {
        ranges: [[0, 20]],
        sort: ['by_notification_level', 'by_recency'],
        timeline_limit: LIST_TIMELINE_LIMIT,
        required_state: buildListRequiredState(),
        include_old_rooms: {
          timeline_limit: 0,
          required_state: [
            [EventType.RoomCreate, ''],
            [EventType.RoomTombstone, ''],
            [EventType.SpaceChild, MSC3575_WILDCARD],
            [EventType.SpaceParent, MSC3575_WILDCARD],
            [EventType.RoomMember, MSC3575_STATE_KEY_ME],
          ],
        },
        ...updateArgs,
      };
    } else {
      const updated = { ...list, ...updateArgs };
      if (JSON.stringify(list) === JSON.stringify(updated)) return list;
      list = updated;
    }

    try {
      if (updateArgs.ranges && Object.keys(updateArgs).length === 1) {
        this.slidingSync.setListRanges(listKey, updateArgs.ranges);
      } else {
        this.slidingSync.setList(listKey, list);
      }
    } catch {
      // ignore — the list will be re-sent on the next sync cycle
    }
    return this.slidingSync.getListParams(listKey) ?? list;
  }

  /**
   * Spider through all rooms by incrementally expanding the search list, matching
   * Element Web's `startSpidering` behaviour. Called once after `attach()` and runs
   * in the background; callers must not await it.
   *
   * The first request uses `setList` to register the list with its full config;
   * subsequent page advances use the cheaper `setListRanges` (sticky params are
   * not resent). A gap sleep is applied before the first request and after each
   * subsequent one to avoid hammering the proxy at startup.
   */
  public async startSpidering(batchSize: number, gapBetweenRequestsMs: number): Promise<void> {
    // Delay before the first request — startSpidering is called right after attach(),
    // so give the initial sync a moment to settle first.
    await new Promise<void>((res) => { setTimeout(res, gapBetweenRequestsMs); });
    if (this.disposed) return;

    let startIndex = batchSize;
    let hasMore = true;
    let firstTime = true;

    const spideringRequiredState: MSC3575List['required_state'] = [
      [EventType.RoomJoinRules, ''],
      [EventType.RoomAvatar, ''],
      [EventType.RoomTombstone, ''],
      [EventType.RoomEncryption, ''],
      [EventType.RoomCreate, ''],
      [EventType.RoomMember, MSC3575_STATE_KEY_ME],
    ];

    while (hasMore) {
      if (this.disposed) return;
      const endIndex = startIndex + batchSize - 1;
      const ranges: [number, number][] = [
        [0, batchSize - 1],
        [startIndex, endIndex],
      ];
      try {
        if (firstTime) {
          // Full setList on first call to register the list with all params.
          this.slidingSync.setList(LIST_SEARCH, {
            ranges,
            sort: ['by_recency'],
            timeline_limit: 0,
            required_state: spideringRequiredState,
            // include_old_rooms intentionally omitted to reduce spidering impact;
            // the direct room subscription will fill in any gaps when the user opens a room.
            filters: { not_room_types: ['m.space'] },
          });
        } else {
          // Cheaper range-only update for subsequent pages; sticky params are preserved.
          this.slidingSync.setListRanges(LIST_SEARCH, ranges);
        }
      } catch {
        // Swallow errors — the next iteration will retry with updated ranges.
      } finally {
        await new Promise<void>((res) => { setTimeout(res, gapBetweenRequestsMs); });
      }

      if (this.disposed) return;
      const listData = this.slidingSync.getListData(LIST_SEARCH);
      hasMore = endIndex + 1 < (listData?.joinedCount ?? 0);
      startIndex += batchSize;
      firstTime = false;
    }
    log.log(`Sliding Sync spidering complete for ${this.mx.getUserId()}`);
  }

  /**
   * Subscribe to a room with the appropriate active-room subscription.
   * Encrypted rooms use the default subscription ([*,*]); unencrypted rooms use a
   * custom subscription that also requests lazy members.
   * If the room is not yet known to the SDK (e.g. navigating directly to a room URL
   * before the list has synced it), we default to the encrypted subscription — it is
   * always safe to over-request state.
   * Safe to call when already subscribed — the SDK deduplicates.
   * This is a no-op after dispose().
   */
  public subscribeToRoom(roomId: string): void {
    if (this.disposed) return;
    const room = this.mx.getRoom(roomId);
    if (room && !this.mx.isRoomEncrypted(roomId)) {
      // Only use the unencrypted (lazy-load) subscription when we are certain
      // the room is unencrypted.  Unknown rooms fall through to the safer
      // encrypted default.
      this.slidingSync.useCustomSubscription(roomId, UNENCRYPTED_SUBSCRIPTION_KEY);
    }
    this.activeRoomSubscriptions.add(roomId);
    this.slidingSync.modifyRoomSubscriptions(new Set(this.activeRoomSubscriptions));
    log.log(`Sliding Sync active room subscription added: ${roomId}`);
  }

  /**
   * Remove the explicit room subscription for a room.
   * Rooms that are still in a list will continue to receive background updates.
   * This is a no-op after dispose().
   */
  public unsubscribeFromRoom(roomId: string): void {
    if (this.disposed) return;
    this.activeRoomSubscriptions.delete(roomId);
    this.slidingSync.modifyRoomSubscriptions(new Set(this.activeRoomSubscriptions));
    log.log(`Sliding Sync active room subscription removed: ${roomId}`);
  }

  public static async probe(
    mx: MatrixClient,
    proxyBaseUrl: string,
    probeTimeoutMs: number
  ): Promise<boolean> {
    try {
      const response = await mx.slidingSync(
        {
          lists: {
            probe: {
              ranges: [[0, 0]],
              timeline_limit: 1,
              required_state: [],
            },
          },
          timeout: 0,
          clientTimeout: probeTimeoutMs,
        },
        proxyBaseUrl
      );

      return typeof response.pos === 'string' && response.pos.length > 0;
    } catch {
      return false;
    }
  }
}
