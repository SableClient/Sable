/* eslint-disable max-classes-per-file */
import {
  ClientEvent,
  Extension,
  ExtensionState,
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
  User,
} from '$types/matrix-sdk';
import { createLogger } from '$utils/debug';
import { createDebugLogger } from '$utils/debugLogger';

const log = createLogger('slidingSync');
const debugLog = createDebugLogger('slidingSync');

export const LIST_JOINED = 'joined';
export const LIST_INVITES = 'invites';
export const LIST_DMS = 'dms';
export const LIST_SEARCH = 'search';
// Separate key for live room-name filtering; avoids conflicting with the spidering list.
export const LIST_ROOM_SEARCH = 'room_search';
// Dynamic list key used for space-scoped room views.
export const LIST_SPACE = 'space';
// One event of timeline per list room is enough to compute unread counts;
// the full history is loaded when the user opens the room.
const LIST_TIMELINE_LIMIT = 1;
const DEFAULT_LIST_PAGE_SIZE = 250;
const DEFAULT_POLL_TIMEOUT_MS = 20000;
const DEFAULT_MAX_ROOMS = 5000;

// Sort order for MSC4186 (Simplified Sliding Sync): most recently active first,
// then alphabetical as a tiebreaker. by_notification_level is MSC3575-only and
// not supported by Synapse's native MSC4186 implementation.
const LIST_SORT_ORDER = ['by_recency', 'by_name'];

// Subscription key for the room the user is actively viewing.
// Encrypted rooms get [*,*] required_state; unencrypted rooms also request lazy members.
const UNENCRYPTED_SUBSCRIPTION_KEY = 'unencrypted';
// Adaptive timeline limits for the room the user is actively viewing.
// Lower limits reduce initial bandwidth on constrained devices/connections;
// the user can always paginate further once the room is open.
// These values must be high enough to ensure proper timeline initialization and pagination tokens.
const ACTIVE_ROOM_TIMELINE_LIMIT_LOW = 50;
const ACTIVE_ROOM_TIMELINE_LIMIT_MEDIUM = 100;
const ACTIVE_ROOM_TIMELINE_LIMIT_HIGH = 150;

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

// Minimal required_state for list entries; enough to render the room list sidebar,
// compute unread state, and build the space hierarchy without fetching full room history.
// Notes:
//   - RoomName/RoomCanonicalAlias are omitted: sliding sync returns the room name as a
//     top-level field in every list response, so fetching them as state events is redundant.
//   - MSC3575_STATE_KEY_LAZY is omitted: lazy-loading members is only needed when the
//     user is actively viewing a room; loading them for every list entry wastes bandwidth.
//   - SpaceChild with wildcard is required: the roomToParents atom reads m.space.child
//     state events (one per child, keyed by child room ID) to build the space hierarchy.
//     Without these events the SDK has no parent→child mapping, so all rooms appear as
//     orphans in the Home view and spaces appear empty.
//   - im.ponies.room_emotes with wildcard is required: custom emoji/sticker packs are
//     stored as im.ponies.room_emotes state events (one per pack, keyed by pack state key).
//     getGlobalImagePacks reads these from pack rooms listed in im.ponies.emote_rooms
//     account data; imagePackRooms also reads them from parent spaces. Without these
//     events all list-entry rooms would show no emoji or sticker packs.
//   - m.room.topic is required: topics are displayed for joined child rooms in space
//     lobby (RoomItem → LocalRoomSummaryLoader → useLocalRoomSummary) and in the
//     invite list. Without this event the topic always shows as blank for non-active
//     rooms.
//   - m.room.canonical_alias is required: getCanonicalAlias() is used in several places
//     for non-active rooms — notification serverName extraction, mention autocomplete
//     alias display, and getCanonicalAliasOrRoomId for navigation. Without it, aliases
//     fall back silently to room IDs.
const buildListRequiredState = (): MSC3575RoomSubscription['required_state'] => [
  [EventType.RoomJoinRules, ''],
  [EventType.RoomAvatar, ''],
  [EventType.RoomTombstone, ''],
  [EventType.RoomEncryption, ''],
  [EventType.RoomCreate, ''],
  [EventType.RoomTopic, ''],
  [EventType.RoomCanonicalAlias, ''],
  [EventType.RoomMember, MSC3575_STATE_KEY_ME],
  ['m.space.child', MSC3575_WILDCARD],
  ['im.ponies.room_emotes', MSC3575_WILDCARD],
];

// For an active encrypted room: fetch everything so the client can decrypt all events.
const buildEncryptedSubscription = (timelineLimit: number): MSC3575RoomSubscription => ({
  timeline_limit: timelineLimit,
  required_state: [[MSC3575_WILDCARD, MSC3575_WILDCARD]],
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
});

const buildLists = (pageSize: number, includeInviteList: boolean): Map<string, MSC3575List> => {
  const lists = new Map<string, MSC3575List>();
  const listRequiredState = buildListRequiredState();

  // Start with a reasonable initial range that will quickly expand to full list
  // Since timeline_limit=1, loading many rooms is very cheap
  // This prevents the white page issue from progressive loading delays
  const initialRange = Math.min(pageSize, 100);

  lists.set(LIST_JOINED, {
    ranges: [[0, Math.max(0, initialRange - 1)]],
    sort: LIST_SORT_ORDER,
    timeline_limit: LIST_TIMELINE_LIMIT,
    required_state: listRequiredState,
    slow_get_all_rooms: true,
    filters: { is_invite: false },
  });

  if (includeInviteList) {
    lists.set(LIST_INVITES, {
      ranges: [[0, Math.max(0, initialRange - 1)]],
      sort: LIST_SORT_ORDER,
      timeline_limit: LIST_TIMELINE_LIMIT,
      required_state: listRequiredState,
      slow_get_all_rooms: true,
      filters: { is_invite: true },
    });
  }

  lists.set(LIST_DMS, {
    ranges: [[0, Math.max(0, initialRange - 1)]],
    sort: LIST_SORT_ORDER,
    timeline_limit: LIST_TIMELINE_LIMIT,
    required_state: listRequiredState,
    slow_get_all_rooms: true,
    filters: { is_dm: true },
  });

  return lists;
};

const getListEndIndex = (list: MSC3575List | null): number => {
  if (!list?.ranges?.length) return -1;
  return list.ranges.reduce((max, range) => Math.max(max, range[1] ?? -1), -1);
};

// MSC4186 presence extension: requests `extensions.presence` in every sliding sync
// poll and feeds received `m.presence` events into the SDK's User objects so that
// components using `useUserPresence` see live updates (same path as regular /sync).
class ExtensionPresence implements Extension<{ enabled: boolean }, { events?: object[] }> {
  private enabled = true;

  public constructor(private readonly mx: MatrixClient) {}

  public setEnabled(value: boolean): void {
    this.enabled = value;
  }

  // eslint-disable-next-line class-methods-use-this
  public name(): string {
    return 'presence';
  }

  // eslint-disable-next-line class-methods-use-this
  public when(): ExtensionState {
    // Run after the main response body has been processed so room/member state is ready.
    return ExtensionState.PostProcess;
  }

  public async onRequest(): Promise<{ enabled: boolean }> {
    return { enabled: this.enabled };
  }

  public async onResponse(data: { events?: object[] }): Promise<void> {
    if (!data?.events?.length) return;
    const mapper = this.mx.getEventMapper();
    data.events.forEach((rawEvent) => {
      const event = mapper(rawEvent as Parameters<typeof mapper>[0]);
      const userId = event.getSender() ?? (event.getContent().user_id as string | undefined);
      if (!userId) return;
      let user = this.mx.store.getUser(userId);
      if (user) {
        user.setPresenceEvent(event);
      } else {
        user = User.createUser(userId, this.mx);
        user.setPresenceEvent(event);
        this.mx.store.storeUser(user);
      }
      this.mx.emit(ClientEvent.Event, event);
    });
  }
}

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

  private presenceExtension!: ExtensionPresence;

  private listsFullyLoaded = false;

  private initialSyncCompleted = false;

  private syncCount = 0;

  private previousListCounts: Map<string, number> = new Map();

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

    const adaptiveTimeline = !(
      typeof config.timelineLimit === 'number' && config.timelineLimit > 0
    );
    const signals = readAdaptiveSignals();
    const roomTimelineLimit = resolveAdaptiveRoomTimelineLimit(config.timelineLimit, signals);
    this.adaptiveTimeline = adaptiveTimeline;
    this.roomTimelineLimit = roomTimelineLimit;
    this.configuredTimelineLimit = config.timelineLimit;

    const defaultSubscription = buildEncryptedSubscription(roomTimelineLimit);
    const lists = buildLists(listPageSize, includeInviteList);
    this.listKeys = Array.from(lists.keys());
    this.slidingSync = new SlidingSync(proxyBaseUrl, lists, defaultSubscription, mx, pollTimeoutMs);

    // Register the presence extension so m.presence events from the server are fed
    // into the SDK's User objects, keeping useUserPresence accurate during sliding sync.
    this.presenceExtension = new ExtensionPresence(mx);
    this.slidingSync.registerExtension(this.presenceExtension);

    // Register a custom subscription for unencrypted active rooms; encrypted rooms use
    // the default subscription (which already has [*,*]).
    this.slidingSync.addCustomSubscription(
      UNENCRYPTED_SUBSCRIPTION_KEY,
      buildUnencryptedSubscription(roomTimelineLimit)
    );

    this.onLifecycle = (state, resp, err) => {
      const syncStartTime = performance.now();
      this.syncCount += 1;

      debugLog.info('sync', `Sliding sync lifecycle: ${state} (cycle #${this.syncCount})`, {
        state,
        hasError: !!err,
        syncNumber: this.syncCount,
        isInitialSync: !this.initialSyncCompleted,
      });

      if (err) {
        debugLog.error('sync', 'Sliding sync error', {
          error: err,
          errorMessage: err.message,
          syncNumber: this.syncCount,
          state,
        });
      }

      if (this.disposed) {
        debugLog.warn('sync', 'Sync lifecycle called after disposal', { state });
        return;
      }

      if (err || !resp || state !== SlidingSyncState.Complete) return;

      // Track what changed in this sync cycle
      const changes: Record<string, any> = {};
      let totalRoomCount = 0;
      let hasChanges = false;

      this.listKeys.forEach((key) => {
        const listData = this.slidingSync.getListData(key);
        const currentCount = listData?.joinedCount ?? 0;
        const previousCount = this.previousListCounts.get(key) ?? 0;

        totalRoomCount += currentCount;

        if (currentCount !== previousCount) {
          changes[key] = {
            previous: previousCount,
            current: currentCount,
            delta: currentCount - previousCount,
          };
          this.previousListCounts.set(key, currentCount);
          hasChanges = true;
        }
      });

      if (hasChanges || !this.initialSyncCompleted) {
        debugLog.info('sync', 'Room counts changed in sync cycle', {
          syncNumber: this.syncCount,
          changes,
          totalRoomCount,
          isInitialSync: !this.initialSyncCompleted,
        });
      }

      // Mark initial sync as complete after first successful cycle
      if (!this.initialSyncCompleted) {
        this.initialSyncCompleted = true;
        debugLog.info('sync', 'Initial sync completed', {
          syncNumber: this.syncCount,
          totalRoomCount,
          listCounts: Object.fromEntries(
            this.listKeys.map((key) => [key, this.slidingSync.getListData(key)?.joinedCount ?? 0])
          ),
          timeElapsed: `${(performance.now() - syncStartTime).toFixed(2)}ms`,
        });
      }

      this.expandListsToKnownCount();

      const syncDuration = performance.now() - syncStartTime;
      if (syncDuration > 1000) {
        debugLog.warn('sync', 'Slow sync cycle detected', {
          syncNumber: this.syncCount,
          duration: `${syncDuration.toFixed(2)}ms`,
          totalRoomCount,
        });
      }
    };

    this.onConnectionChange = () => {
      const isOnline = navigator.onLine;
      const connectionInfo =
        typeof navigator !== 'undefined' ? (navigator as any).connection : undefined;
      const effectiveType = connectionInfo?.effectiveType;
      const downlink = connectionInfo?.downlink;

      debugLog.info('network', `Network connectivity changed: ${isOnline ? 'online' : 'offline'}`, {
        online: isOnline,
        effectiveType,
        downlink: downlink ? `${downlink} Mbps` : undefined,
      });

      if (!isOnline) {
        debugLog.warn('network', 'Device went offline - sync paused', {
          syncNumber: this.syncCount,
        });
      } else {
        debugLog.info('network', 'Device back online - sync will resume', {
          syncNumber: this.syncCount,
        });
      }

      if (this.disposed || !this.adaptiveTimeline) return;
      const nextLimit = resolveAdaptiveRoomTimelineLimit(
        this.configuredTimelineLimit,
        readAdaptiveSignals()
      );
      if (nextLimit === this.roomTimelineLimit) return;
      debugLog.info('sync', `Adaptive timeline limit updated to ${nextLimit}`, {
        limit: nextLimit,
        previousLimit: this.roomTimelineLimit,
        reason: 'connection change',
      });
      this.roomTimelineLimit = nextLimit;
      this.applyRoomTimelineLimit(nextLimit);
      log.log(
        `Sliding Sync adaptive room timeline updated to ${nextLimit} for ${this.mx.getUserId()}`
      );
    };
  }

  public attach(): void {
    debugLog.info('sync', 'Attaching sliding sync listeners', {
      proxyBaseUrl: this.proxyBaseUrl,
      listPageSize: this.listPageSize,
      roomTimelineLimit: this.roomTimelineLimit,
      adaptiveTimeline: this.adaptiveTimeline,
      maxRooms: this.maxRooms,
      lists: this.listKeys,
    });

    this.slidingSync.on(SlidingSyncEvent.Lifecycle, this.onLifecycle);
    const connection = (
      typeof navigator !== 'undefined' ? (navigator as any).connection : undefined
    ) as
      | {
          addEventListener?: (e: string, cb: () => void) => void;
          removeEventListener?: (e: string, cb: () => void) => void;
          onchange?: (() => void) | null;
        }
      | undefined;
    connection?.addEventListener?.('change', this.onConnectionChange);
    if (connection && connection.onchange === null) connection.onchange = this.onConnectionChange;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onConnectionChange);
      window.addEventListener('offline', this.onConnectionChange);
    }

    debugLog.info('sync', 'Sliding sync listeners attached successfully', {
      hasConnectionAPI: !!connection,
      hasWindowEvents: typeof window !== 'undefined',
    });
  }

  public dispose(): void {
    if (this.disposed) return;

    debugLog.info('sync', 'Disposing sliding sync', {
      syncCount: this.syncCount,
      initialSyncCompleted: this.initialSyncCompleted,
    });

    this.disposed = true;
    this.slidingSync.removeListener(SlidingSyncEvent.Lifecycle, this.onLifecycle);
    const connection = (
      typeof navigator !== 'undefined' ? (navigator as any).connection : undefined
    ) as
      | {
          addEventListener?: (e: string, cb: () => void) => void;
          removeEventListener?: (e: string, cb: () => void) => void;
          onchange?: (() => void) | null;
        }
      | undefined;
    connection?.removeEventListener?.('change', this.onConnectionChange);
    if (connection?.onchange === this.onConnectionChange) connection.onchange = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onConnectionChange);
      window.removeEventListener('offline', this.onConnectionChange);
    }

    debugLog.info('sync', 'Sliding sync disposed successfully', {
      totalSyncCycles: this.syncCount,
    });
  }

  private applyRoomTimelineLimit(timelineLimit: number): void {
    this.slidingSync.modifyRoomSubscriptionInfo(buildEncryptedSubscription(timelineLimit));
    this.slidingSync.addCustomSubscription(
      UNENCRYPTED_SUBSCRIPTION_KEY,
      buildUnencryptedSubscription(timelineLimit)
    );
  }

  public setPresenceEnabled(enabled: boolean): void {
    this.presenceExtension.setEnabled(enabled);
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
    // Stop expanding once we've loaded all rooms - prevents continuous updates
    if (this.listsFullyLoaded) return;

    let allListsComplete = true;
    let expandedAny = false;

    const expansionStartTime = performance.now();
    const expansionDetails: Record<string, any> = {};

    this.listKeys.forEach((key) => {
      const listData = this.slidingSync.getListData(key);
      const knownCount = listData?.joinedCount ?? 0;
      if (knownCount <= 0) {
        expansionDetails[key] = { status: 'empty', knownCount: 0 };
        return;
      }

      const existing = this.slidingSync.getListParams(key);
      const currentEnd = getListEndIndex(existing);

      // Calculate how many rooms we still need to load
      const maxEnd = Math.min(knownCount, this.maxRooms) - 1;

      if (currentEnd >= maxEnd) {
        // This list is fully loaded
        expansionDetails[key] = { status: 'complete', knownCount, currentEnd };
        return;
      }

      allListsComplete = false;

      // Progressive expansion: load in moderate chunks to balance speed with stability
      // Chunk size reduced to 100 to prevent timeline ordering issues when opening rooms
      // while lists are still expanding. Rooms should get at least one clean sync from
      // their list before the active subscription requests a high timeline limit.
      const chunkSize = 100;
      const desiredEnd = Math.min(currentEnd + chunkSize, maxEnd);

      if (desiredEnd === currentEnd) {
        expansionDetails[key] = {
          status: 'complete',
          knownCount,
          currentEnd,
          desiredEnd,
        };
        return;
      }

      this.slidingSync.setListRanges(key, [[0, desiredEnd]]);
      expandedAny = true;

      expansionDetails[key] = {
        status: 'expanding',
        knownCount,
        previousEnd: currentEnd,
        newEnd: desiredEnd,
        roomsToLoad: desiredEnd - currentEnd,
      };

      debugLog.info('sync', `Expanding list "${key}" to full range`, {
        list: key,
        knownCount,
        previousEnd: currentEnd,
        newEnd: desiredEnd,
        roomsToLoad: desiredEnd - currentEnd,
      });

      if (knownCount > this.maxRooms) {
        log.warn(
          `Sliding Sync list "${key}" capped at ${this.maxRooms}/${knownCount} rooms for ${this.mx.getUserId()}`
        );
        debugLog.warn('sync', `List "${key}" exceeds maxRooms limit`, {
          list: key,
          knownCount,
          maxRooms: this.maxRooms,
          cappedCount: this.maxRooms,
        });
      }
    });

    const expansionDuration = performance.now() - expansionStartTime;
    const hasExpansions = Object.values(expansionDetails).some((d) => d.status === 'expanding');

    // Mark as fully loaded once all lists are complete
    if (allListsComplete) {
      this.listsFullyLoaded = true;
      log.log(`Sliding Sync all lists fully loaded for ${this.mx.getUserId()}`);
    } else if (expandedAny) {
      log.log(`Sliding Sync lists expanding... for ${this.mx.getUserId()}`);
    }

    if (hasExpansions) {
      debugLog.info('sync', 'List expansion completed', {
        syncNumber: this.syncCount,
        lists: expansionDetails,
        timeElapsed: `${expansionDuration.toFixed(2)}ms`,
      });
    }

    if (expansionDuration > 500) {
      debugLog.warn('sync', 'Slow list expansion detected', {
        duration: `${expansionDuration.toFixed(2)}ms`,
        expandedLists: Object.keys(expansionDetails).filter(
          (key) => expansionDetails[key].status === 'expanding'
        ),
      });
    }
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
        sort: LIST_SORT_ORDER,
        timeline_limit: LIST_TIMELINE_LIMIT,
        required_state: buildListRequiredState(),
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
    } catch (error) {
      // ignore — the list will be re-sent on the next sync cycle
      debugLog.warn('sync', `Failed to update list "${listKey}"`, {
        list: listKey,
        error: error instanceof Error ? error.message : String(error),
        updateType: updateArgs.ranges && Object.keys(updateArgs).length === 1 ? 'ranges' : 'full',
      });
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
    await new Promise<void>((res) => {
      setTimeout(res, gapBetweenRequestsMs);
    });
    if (this.disposed) return;

    // Use a single expanding range [[0, endIndex]] rather than a two-range sliding
    // window. Synapse's extension handler asserts len(actual_list.ops) == 1, which
    // fails when the response contains multiple ops (one per range). A single range
    // always produces a single SYNC op, avoiding the assertion.
    let endIndex = batchSize - 1;
    let hasMore = true;
    let firstTime = true;

    const spideringRequiredState: MSC3575List['required_state'] = [
      [EventType.RoomJoinRules, ''],
      [EventType.RoomAvatar, ''],
      [EventType.RoomTombstone, ''],
      [EventType.RoomEncryption, ''],
      [EventType.RoomCreate, ''],
      [EventType.RoomTopic, ''],
      [EventType.RoomCanonicalAlias, ''],
      [EventType.RoomMember, MSC3575_STATE_KEY_ME],
      ['m.space.child', MSC3575_WILDCARD],
      ['im.ponies.room_emotes', MSC3575_WILDCARD],
    ];

    while (hasMore) {
      if (this.disposed) return;
      const ranges: [number, number][] = [[0, endIndex]];
      try {
        if (firstTime) {
          // Full setList on first call to register the list with all params.
          this.slidingSync.setList(LIST_SEARCH, {
            ranges,
            sort: ['by_recency'],
            timeline_limit: 0,
            required_state: spideringRequiredState,
          });
        } else {
          // Cheaper range-only update for subsequent pages; sticky params are preserved.
          this.slidingSync.setListRanges(LIST_SEARCH, ranges);
        }
      } catch {
        // Swallow errors — the next iteration will retry with updated ranges.
      } finally {
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((res) => {
          setTimeout(res, gapBetweenRequestsMs);
        });
      }

      if (this.disposed) return;
      const listData = this.slidingSync.getListData(LIST_SEARCH);
      hasMore = endIndex + 1 < (listData?.joinedCount ?? 0);
      endIndex += batchSize;
      firstTime = false;
    }
    log.log(`Sliding Sync spidering complete for ${this.mx.getUserId()}`);
  }

  /**
   * Enable or disable server-side room name filtering.
   * When `query` is a non-empty string, registers (or updates) a dedicated
   * `room_search` list that uses the MSC4186 `room_name_like` filter so the
   * server returns only rooms whose name matches the query. When `query` is
   * null or empty the list is reset to an unfiltered minimal range — callers
   * should hide/ignore the list results in that case.
   * This is a no-op after dispose().
   */
  public setRoomNameSearch(query: string | null): void {
    if (this.disposed) return;
    const trimmed = query?.trim() ?? '';
    const filters: MSC3575List['filters'] = trimmed ? { room_name_like: trimmed } : {};
    this.ensureListRegistered(LIST_ROOM_SEARCH, {
      filters,
      ranges: [[0, 19]],
      sort: LIST_SORT_ORDER,
    });
  }

  /**
   * Activate or clear a space-scoped room list.
   * When `spaceId` is provided, registers (or updates) a dedicated `space`
   * list filtered to rooms that are children of that space, returning the
   * first page sorted by recency. This supplements the main `joined` list
   * rather than replacing it, so background sync of all rooms is unaffected.
   * Pass `null` to deactivate the space list (collapses range to 0–0).
   * This is a no-op after dispose().
   */
  public setSpaceScope(spaceId: string | null): void {
    if (this.disposed) return;
    const filters: MSC3575List['filters'] = spaceId
      ? { is_invite: false, spaces: [spaceId] }
      : { is_invite: false };
    this.ensureListRegistered(LIST_SPACE, {
      filters,
      ranges: spaceId ? [[0, Math.min(this.listPageSize - 1, 499)]] : [[0, 0]],
      sort: LIST_SORT_ORDER,
    });
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
