import type {
  MatrixClient,
  MatrixEvent,
  MSC3575List,
  MSC3575RoomData,
  MSC3575RoomSubscription,
  MSC3575SlidingSyncResponse,
} from '$types/matrix-sdk';
import {
  KnownMembership,
  MSC3575_WILDCARD,
  RoomMemberEvent,
  SlidingSync,
  SlidingSyncEvent,
  SlidingSyncState,
  MSC3575_STATE_KEY_LAZY,
  MSC3575_STATE_KEY_ME,
  EventType,
  EventEmitterEvents,
  ClientEvent,
} from '$types/matrix-sdk';
import { createLogger } from '$utils/debug';
import { createDebugLogger } from '$utils/debugLogger';
import { CustomStateEvent } from '$types/matrix/room';
import * as Sentry from '@sentry/react';
import { SlidingSyncSidebarCache } from './slidingSyncSidebarCache';

const log = createLogger('slidingSync');
const debugLog = createDebugLogger('slidingSync');

export const LIST_JOINED = 'joined';
export const LIST_INVITES = 'invites';
export const LIST_UPDATES = 'updates';
export const LIST_SEARCH = 'search';
export const LIST_ROOM_SEARCH = 'room_search';
export const LIST_SPACE = 'space';
const LIST_TIMELINE_LIMIT = 1;
const LIST_PAGE_SIZE = 30;
const STEADY_STATE_DETAILED_ROOMS = 3;
const JOINED_ROOMS_HYDRATION_TIMEOUT_MS = 2000;
const DEFAULT_POLL_TIMEOUT_MS = 45000;

const LIST_SORT_ORDER = ['by_recency', 'by_name'];

const ACTIVE_ROOM_SUBSCRIPTION_KEY = 'active_room';
const SIDEBAR_ROOM_SUBSCRIPTION_KEY = 'sidebar_room';
const SPACE_SUBSCRIPTION_KEY = 'space';
const IMAGE_PACK_SUBSCRIPTION_KEY = 'image_packs';
const ACTIVE_ROOM_TIMELINE_LIMIT = 30;

export type PartialSlidingSyncRequest = {
  filters?: MSC3575List['filters'];
  sort?: string[];
  ranges?: [number, number][];
};

type SlidingSyncOptions = {
  timelineLimit?: number;
  pollTimeoutMs?: number;
  initialRoomIds?: Iterable<string>;
};

export type SlidingSyncListDiagnostics = {
  key: string;
  knownCount: number;
  rangeEnd: number;
  requestedRangeEnd: number;
};

export type SlidingSyncDiagnostics = {
  baseUrl: string;
  timelineLimit: number;
  lists: SlidingSyncListDiagnostics[];
};

const clampPositive = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return fallback;
  return Math.round(value);
};

const buildListRequiredState = (): MSC3575RoomSubscription['required_state'] => [
  // first sync limited solely to what's needed to render rooms
  [EventType.RoomAvatar, ''],
  [EventType.RoomTombstone, ''],
  [EventType.RoomEncryption, ''],
  [EventType.RoomCreate, ''],
  [EventType.RoomName, ''],
  [EventType.RoomCanonicalAlias, ''],
  [EventType.RoomJoinRules, ''],
  [EventType.RoomMember, MSC3575_STATE_KEY_ME],
];

const SPACE_REQUIRED_STATE: MSC3575RoomSubscription['required_state'] = [
  [EventType.RoomCreate, ''],
  [EventType.RoomName, ''],
  [EventType.RoomAvatar, ''],
  [EventType.RoomCanonicalAlias, ''],
  [EventType.RoomJoinRules, ''],
  [EventType.RoomEncryption, ''],
  [EventType.RoomTombstone, ''],
  [CustomStateEvent.RoomBanner, ''],
  ['m.space.child', MSC3575_WILDCARD],
  ['m.space.parent', MSC3575_WILDCARD],
];

const ACTIVE_ROOM_REQUIRED_STATE: MSC3575RoomSubscription['required_state'] = [
  // active room subscription includes all room data
  [EventType.RoomPowerLevels, ''],
  [EventType.RoomName, ''],
  [EventType.RoomTopic, ''],
  [EventType.RoomAvatar, ''],
  [EventType.RoomCanonicalAlias, ''],
  [EventType.RoomJoinRules, ''],
  [EventType.RoomHistoryVisibility, ''],
  [EventType.RoomGuestAccess, ''],
  [EventType.RoomEncryption, ''],
  [EventType.RoomTombstone, ''],
  [EventType.RoomCreate, ''],
  [EventType.RoomPinnedEvents, ''],
  [EventType.RoomServerAcl, ''],
  [EventType.RoomThirdPartyInvite, MSC3575_WILDCARD],
  [EventType.RoomMember, MSC3575_STATE_KEY_ME],
  [EventType.RoomMember, MSC3575_STATE_KEY_LAZY],
  ['m.space.child', MSC3575_WILDCARD],
  ['m.space.parent', MSC3575_WILDCARD],
  [EventType.GroupCallPrefix, ''],
  [EventType.GroupCallMemberPrefix, MSC3575_WILDCARD],
  ...Object.values(CustomStateEvent).map((type) => [type, MSC3575_WILDCARD] as [string, string]),
];

const buildEncryptedSubscription = (timelineLimit: number): MSC3575RoomSubscription => ({
  timeline_limit: timelineLimit,
  required_state: ACTIVE_ROOM_REQUIRED_STATE,
});

const buildUnencryptedSubscription = (timelineLimit: number): MSC3575RoomSubscription => ({
  timeline_limit: timelineLimit,
  required_state: ACTIVE_ROOM_REQUIRED_STATE,
});

const buildImagePackSubscription = (): MSC3575RoomSubscription => ({
  timeline_limit: 0,
  required_state: [
    [CustomStateEvent.ImagePack, MSC3575_WILDCARD],
    [CustomStateEvent.PoniesRoomEmotes, MSC3575_WILDCARD],
  ],
});

const buildSpaceSubscription = (): MSC3575RoomSubscription => ({
  timeline_limit: 0,
  required_state: SPACE_REQUIRED_STATE,
});

const buildSidebarRoomSubscription = (): MSC3575RoomSubscription => ({
  timeline_limit: LIST_TIMELINE_LIMIT,
  required_state: buildListRequiredState(),
});

const buildLists = (): Map<string, MSC3575List> => {
  const lists = new Map<string, MSC3575List>();
  const listRequiredState = buildListRequiredState();

  lists.set(LIST_JOINED, {
    ranges: [[0, LIST_PAGE_SIZE - 1]],
    sort: LIST_SORT_ORDER,
    timeline_limit: LIST_TIMELINE_LIMIT,
    required_state: listRequiredState,
    filters: { is_invite: false },
  });

  lists.set(LIST_INVITES, {
    ranges: [[0, LIST_PAGE_SIZE - 1]],
    sort: LIST_SORT_ORDER,
    timeline_limit: LIST_TIMELINE_LIMIT,
    required_state: listRequiredState,
    filters: { is_invite: true },
  });

  lists.set(LIST_UPDATES, {
    ranges: [[0, LIST_PAGE_SIZE - 1]],
    sort: LIST_SORT_ORDER,
    timeline_limit: LIST_TIMELINE_LIMIT,
    required_state: [[EventType.RoomMember, MSC3575_STATE_KEY_ME]],
    filters: { is_invite: false },
  });

  return lists;
};

const getListEndIndex = (list: MSC3575List | null): number => {
  if (!list?.ranges?.length) return -1;
  return list.ranges.reduce((max, range) => Math.max(max, range[1] ?? -1), -1);
};

type RoomScopedExtension = {
  enabled?: boolean;
  lists?: string[];
  rooms?: string[];
};

export const scopeEphemeralExtensions = (
  extensions: object | undefined,
  roomIds: readonly string[]
): void => {
  if (!extensions) return;
  const extensionMap = extensions as Record<string, unknown>;

  ['typing', 'receipts'].forEach((name) => {
    const extension = extensionMap[name];
    if (!extension || typeof extension !== 'object') return;

    const scopedExtension = extension as RoomScopedExtension;
    scopedExtension.lists = [];
    scopedExtension.rooms = [...roomIds];
  });
};

export class SlidingSyncManager {
  private disposed = false;

  private readonly listKeys: string[];

  private readonly activeRoomSubscriptions = new Set<string>();

  private readonly sidebarRoomSubscriptions = new Set<string>();

  private readonly spaceSubscriptions = new Set<string>();

  private deferredSpaceSubscriptions = new Set<string>();

  private readonly imagePackRoomSubscriptions = new Set<string>();

  private roomSubscriptionSyncQueued = false;

  private readonly roomTimelineLimit: number;

  private readonly sidebarCache: SlidingSyncSidebarCache;

  private cacheHydrationPromise: Promise<boolean> = Promise.resolve(false);

  private cacheHydrationNewListener:
    | ((eventName: string | symbol, listener: (...args: unknown[]) => void) => void)
    | undefined;

  private cacheHydrationResolve: ((hydrated: boolean) => void) | undefined;

  private hydratingSidebarCache = false;

  private readonly onCacheRoomData: (roomId: string, data: MSC3575RoomData) => void;

  private readonly onCacheAccountData: (event: MatrixEvent) => void;

  private readonly onLifecycle: (
    state: SlidingSyncState,
    resp: MSC3575SlidingSyncResponse | null,
    err?: Error
  ) => void;

  private readonly onMembershipLeave: (
    event: unknown,
    member: { userId: string; roomId: string; membership?: string }
  ) => void;

  private listsFullyLoaded = false;

  private initialListHydrationCompleted = false;

  private sidebarCacheReconciled = false;

  private sidebarCacheReconciliationQueued = false;

  private joinedRoomIdsPromise: Promise<Set<string> | undefined> | undefined;

  private readonly serverMembershipRoomIds = new Set<string>();

  private initialSyncCompleted = false;

  private syncCount = 0;

  private responseProcessingStartedAt: number | undefined;

  private responseProcessing = false;

  private readonly responseSettledListeners = new Set<() => void>();

  private previousListCounts: Map<string, number> = new Map();

  private readonly requestedListRangeEnds = new Map<string, number>();

  private readonly confirmedListRangeEnds = new Map<string, number>();

  /**
   * One-shot RoomData listeners keyed by roomId, used to measure the latency
   * between subscribeToRoom() and the first data arriving for that room.
   * Cleaned up automatically after first fire or on unsubscribe/dispose.
   */
  private readonly pendingRoomDataListeners = new Map<
    string,
    (roomId: string, data: MSC3575RoomData) => void
  >();

  private readonly roomSubscriptionStatusListeners = new Map<
    string,
    Set<(loading: boolean) => void>
  >();

  private readonly roomDataAwaitingSyncCompletion = new Set<string>();

  /** Wall-clock time recorded in attach() — used to compute true initial-sync latency. */
  private attachTime: number | null = null;

  /** Span covering the period from attach() to the first successful complete cycle. */
  private initialSyncSpan: ReturnType<typeof Sentry.startInactiveSpan> | null = null;

  public readonly slidingSync: SlidingSync;

  public constructor(
    private readonly mx: MatrixClient,
    private readonly baseUrl: string,
    options: SlidingSyncOptions = {}
  ) {
    const pollTimeoutMs = clampPositive(options.pollTimeoutMs, DEFAULT_POLL_TIMEOUT_MS);

    const roomTimelineLimit = clampPositive(options.timelineLimit, ACTIVE_ROOM_TIMELINE_LIMIT);
    this.roomTimelineLimit = roomTimelineLimit;
    this.sidebarCache = new SlidingSyncSidebarCache(mx.getSafeUserId());

    const defaultSubscription = buildEncryptedSubscription(roomTimelineLimit);
    const lists = buildLists();
    this.listKeys = Array.from(lists.keys());
    lists.forEach((list, key) => {
      this.requestedListRangeEnds.set(key, getListEndIndex(list));
    });
    this.slidingSync = new SlidingSync(baseUrl, lists, defaultSubscription, mx, pollTimeoutMs);

    this.slidingSync.addCustomSubscription(
      ACTIVE_ROOM_SUBSCRIPTION_KEY,
      buildUnencryptedSubscription(roomTimelineLimit)
    );
    this.slidingSync.addCustomSubscription(
      SIDEBAR_ROOM_SUBSCRIPTION_KEY,
      buildSidebarRoomSubscription()
    );
    this.slidingSync.addCustomSubscription(
      IMAGE_PACK_SUBSCRIPTION_KEY,
      buildImagePackSubscription()
    );
    this.slidingSync.addCustomSubscription(SPACE_SUBSCRIPTION_KEY, buildSpaceSubscription());

    this.onLifecycle = (state, resp, err) => {
      debugLog.info('sync', `Sliding sync lifecycle: ${state}`, {
        state,
        hasError: !!err,
        isInitialSync: !this.initialSyncCompleted,
      });

      if (err) {
        debugLog.error('sync', 'Sliding sync error', {
          error: err,
          errorMessage: err.message,
          syncNumber: this.syncCount,
          state,
        });
        Sentry.metrics.count('sable.sync.error', 1, {
          attributes: { transport: 'sliding', state },
        });
      }

      if (this.disposed) {
        debugLog.warn('sync', 'Sync lifecycle called after disposal', {
          state,
        });
        return;
      }

      if (state === SlidingSyncState.RequestFinished) {
        if (!err && resp) {
          this.responseProcessing = true;
          this.responseProcessingStartedAt = performance.now();
        }
        return;
      }

      if (err || !resp || state !== SlidingSyncState.Complete) return;

      this.recordServerMembershipRooms(resp);

      this.roomDataAwaitingSyncCompletion.forEach((roomId) =>
        this.notifyRoomSubscriptionStatus(roomId, false)
      );
      this.roomDataAwaitingSyncCompletion.clear();

      this.syncCount += 1;
      Sentry.metrics.count('sable.sync.cycle', 1, {
        attributes: { transport: 'sliding' },
      });

      this.requestedListRangeEnds.forEach((rangeEnd, key) => {
        this.confirmedListRangeEnds.set(key, rangeEnd);
      });

      const changes: Record<string, { previous: number; current: number; delta: number }> = {};
      let totalRoomCount = 0;
      let hasChanges = false;

      this.listKeys.forEach((key) => {
        const listData = this.slidingSync.getListData(key);
        const currentCount = listData?.joinedCount ?? 0;
        const previousCount = this.previousListCounts.get(key) ?? 0;

        if (key !== LIST_UPDATES) totalRoomCount += currentCount;

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

      const syncDuration =
        this.responseProcessingStartedAt === undefined
          ? 0
          : performance.now() - this.responseProcessingStartedAt;
      this.responseProcessingStartedAt = undefined;

      if (!this.initialSyncCompleted) {
        this.initialSyncCompleted = true;
        const initialElapsed =
          this.attachTime != null ? performance.now() - this.attachTime : syncDuration;
        debugLog.info('sync', 'Initial sync completed', {
          syncNumber: this.syncCount,
          totalRoomCount,
          listCounts: Object.fromEntries(
            this.listKeys.map((key) => [key, this.slidingSync.getListData(key)?.joinedCount ?? 0])
          ),
          timeElapsed: `${initialElapsed.toFixed(2)}ms`,
        });
        Sentry.metrics.distribution('sable.sync.initial_ms', initialElapsed, {
          attributes: { transport: 'sliding' },
        });
        this.initialSyncSpan?.setAttributes({
          'sync.cycles_to_ready': this.syncCount,
          'sync.rooms_at_ready': totalRoomCount,
        });
        this.initialSyncSpan?.end();
        this.initialSyncSpan = null;
      }

      this.expandListsByPage();

      Sentry.metrics.distribution('sable.sync.processing_ms', syncDuration, {
        attributes: { transport: 'sliding' },
      });
      if (syncDuration > 1000) {
        debugLog.warn('sync', 'Slow sync cycle detected', {
          syncNumber: this.syncCount,
          duration: `${syncDuration.toFixed(2)}ms`,
          totalRoomCount,
        });
      }

      globalThis.queueMicrotask(() => {
        if (this.disposed) return;
        this.responseProcessing = false;
        this.responseSettledListeners.forEach((listener) => listener());
      });
    };

    this.onMembershipLeave = (_event, member) => {
      if (member.userId !== this.mx.getUserId()) return;
      if (member.membership !== KnownMembership.Leave && member.membership !== KnownMembership.Ban)
        return;
      this.sidebarCache.removeRoom(member.roomId);
      const removedSpaceSubscription = this.spaceSubscriptions.delete(member.roomId);
      const removedSidebarSubscription = this.sidebarRoomSubscriptions.delete(member.roomId);
      if (this.activeRoomSubscriptions.has(member.roomId)) {
        this.unsubscribeFromRoom(member.roomId);
      } else if (removedSpaceSubscription || removedSidebarSubscription) {
        this.queueRoomSubscriptionSync();
      }
    };

    this.onCacheRoomData = (roomId, data) => {
      this.sidebarCache.cacheRoom(roomId, data);

      if (!this.initialListHydrationCompleted || this.hydratingSidebarCache) return;

      let subscriptionsChanged = false;
      const completedSidebarHydration = this.sidebarRoomSubscriptions.delete(roomId);
      if (completedSidebarHydration) subscriptionsChanged = true;

      if (
        data.initial === true &&
        !completedSidebarHydration &&
        !this.activeRoomSubscriptions.has(roomId)
      ) {
        this.sidebarRoomSubscriptions.add(roomId);
        subscriptionsChanged = true;
      }

      if (subscriptionsChanged) this.queueRoomSubscriptionSync();
    };
    this.onCacheAccountData = (event) => this.sidebarCache.cacheAccountData(event);

    for (const roomId of options.initialRoomIds ?? []) {
      this.subscribeToRoom(roomId);
    }
  }

  public attach(): void {
    debugLog.info('sync', 'Attaching sliding sync listeners', {
      baseUrl: this.baseUrl,
      roomTimelineLimit: this.roomTimelineLimit,
      lists: this.listKeys,
    });

    this.attachTime = performance.now();
    this.initialSyncSpan = Sentry.startInactiveSpan({
      name: 'sync.initial',
      op: 'matrix.sync',
      attributes: {
        'sync.transport': 'sliding',
        'sync.base_url': this.baseUrl,
      },
    });

    this.slidingSync.on(SlidingSyncEvent.Lifecycle, this.onLifecycle);
    this.slidingSync.on(SlidingSyncEvent.RoomData, this.onCacheRoomData);
    this.mx.on(RoomMemberEvent.Membership, this.onMembershipLeave);
    this.mx.on(ClientEvent.AccountData, this.onCacheAccountData);

    debugLog.info('sync', 'Sliding sync listeners attached successfully');
  }

  public dispose(): void {
    if (this.disposed) return;

    debugLog.info('sync', 'Disposing sliding sync', {
      syncCount: this.syncCount,
      initialSyncCompleted: this.initialSyncCompleted,
    });

    this.pendingRoomDataListeners.clear();
    this.responseProcessing = false;
    this.responseSettledListeners.clear();
    this.roomDataAwaitingSyncCompletion.clear();
    this.roomSubscriptionStatusListeners.forEach((listeners) =>
      listeners.forEach((listener) => listener(false))
    );
    this.roomSubscriptionStatusListeners.clear();

    this.disposed = true;
    this.slidingSync.stop();
    this.slidingSync.removeListener(SlidingSyncEvent.Lifecycle, this.onLifecycle);
    this.slidingSync.removeListener(SlidingSyncEvent.RoomData, this.onCacheRoomData);
    if (this.cacheHydrationNewListener) {
      this.slidingSync.removeListener(
        EventEmitterEvents.NewListener,
        this.cacheHydrationNewListener as never
      );
      this.cacheHydrationNewListener = undefined;
    }
    this.cacheHydrationResolve?.(false);
    this.cacheHydrationResolve = undefined;
    this.mx.removeListener(RoomMemberEvent.Membership, this.onMembershipLeave);
    this.mx.removeListener(ClientEvent.AccountData, this.onCacheAccountData);
    this.sidebarCache.dispose();

    debugLog.info('sync', 'Sliding sync disposed successfully', {
      totalSyncCycles: this.syncCount,
    });
  }

  private recordServerMembershipRooms(response: MSC3575SlidingSyncResponse): void {
    const userId = this.mx.getSafeUserId();
    Object.entries(response.rooms ?? {}).forEach(([roomId, roomData]) => {
      const membershipEvent = [
        ...(roomData.required_state ?? []),
        ...(roomData.invite_state ?? []),
      ].find(
        (event) => event.type === (EventType.RoomMember as string) && event.state_key === userId
      );
      const content = membershipEvent?.content;
      const membership =
        content && typeof content === 'object'
          ? (content as { membership?: unknown }).membership
          : undefined;

      if (membership === KnownMembership.Leave || membership === KnownMembership.Ban) {
        this.serverMembershipRoomIds.delete(roomId);
      } else {
        this.serverMembershipRoomIds.add(roomId);
      }
    });
  }

  private reconcileSidebarCacheMembership(): void {
    if (this.sidebarCacheReconciled || this.sidebarCacheReconciliationQueued) return;
    this.sidebarCacheReconciliationQueued = true;

    void this.cacheHydrationPromise.then(async () => {
      if (this.disposed || this.sidebarCacheReconciled) return;

      const joinedRoomIds = await this.getJoinedRoomIds();
      if (!joinedRoomIds) {
        debugLog.warn('sync', 'Skipped sidebar cache reconciliation: joined rooms unavailable');
        return;
      }

      if (this.disposed || this.sidebarCacheReconciled) return;
      this.sidebarCacheReconciled = true;

      const validRoomIds = new Set([...this.serverMembershipRoomIds, ...joinedRoomIds]);

      const removedRoomIds = this.sidebarCache.reconcileRooms(validRoomIds);
      removedRoomIds.forEach((roomId) => {
        this.mx.getRoom(roomId)?.updateMyMembership(KnownMembership.Leave);
        this.unsubscribeFromRoom(roomId);
      });

      if (removedRoomIds.length > 0) {
        debugLog.info('sync', 'Removed stale rooms from the sliding sync sidebar cache', {
          removedRoomCount: removedRoomIds.length,
          joinedRoomCount: joinedRoomIds.size,
          observedRoomCount: this.serverMembershipRoomIds.size,
        });
      }
    });
  }

  public getDiagnostics(): SlidingSyncDiagnostics {
    return {
      baseUrl: this.baseUrl,
      timelineLimit: this.roomTimelineLimit,
      lists: this.listKeys.map((key) => {
        const listData = this.slidingSync.getListData(key);
        const params = this.slidingSync.getListParams(key);
        return {
          key,
          knownCount: listData?.joinedCount ?? 0,
          rangeEnd: this.confirmedListRangeEnds.get(key) ?? -1,
          requestedRangeEnd: getListEndIndex(params),
        };
      }),
    };
  }

  public prepareSidebarCacheHydration(): void {
    if (this.disposed || this.cacheHydrationNewListener) return;

    // Start the joined-rooms fetch now so it's ready before hydration prunes.
    if (this.sidebarCache.size > 0) void this.getJoinedRoomIds();

    this.cacheHydrationPromise = new Promise<boolean>((resolve) => {
      this.cacheHydrationResolve = resolve;
    });

    this.cacheHydrationNewListener = (eventName) => {
      if (eventName !== SlidingSyncEvent.RoomData) return;
      const listener = this.cacheHydrationNewListener;
      if (listener) {
        this.slidingSync.removeListener(EventEmitterEvents.NewListener, listener as never);
      }
      this.cacheHydrationNewListener = undefined;

      globalThis.queueMicrotask(() => {
        this.hydratingSidebarCache = true;
        void this.pruneStaleCachedRoomsBeforeHydration()
          .then(() => this.sidebarCache.hydrate(this.mx, this.slidingSync))
          .then((hydrated) => this.cacheHydrationResolve?.(hydrated))
          .catch(() => this.cacheHydrationResolve?.(false))
          .finally(() => {
            this.hydratingSidebarCache = false;
            this.cacheHydrationResolve = undefined;
          });
      });
    };

    this.slidingSync.on(EventEmitterEvents.NewListener, this.cacheHydrationNewListener as never);
  }

  private getJoinedRoomIds(): Promise<Set<string> | undefined> {
    if (!this.joinedRoomIdsPromise) {
      this.joinedRoomIdsPromise = this.mx
        .getJoinedRooms()
        .then((response) => new Set(response.joined_rooms))
        .catch((error) => {
          debugLog.warn('sync', 'Failed to fetch joined rooms for sidebar cache', {
            error: error instanceof Error ? error.message : String(error),
          });
          return undefined;
        });
    }
    return this.joinedRoomIdsPromise;
  }

  // Prune left-elsewhere rooms before hydration so stale spaces never render.
  // No-op if joined rooms are slow/unavailable; reconciliation cleans up later.
  private async pruneStaleCachedRoomsBeforeHydration(): Promise<void> {
    if (this.sidebarCache.size === 0) return;
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const timeout = new Promise<undefined>((resolve) => {
      timer = globalThis.setTimeout(() => resolve(undefined), JOINED_ROOMS_HYDRATION_TIMEOUT_MS);
    });
    const joinedRoomIds = await Promise.race([this.getJoinedRoomIds(), timeout]);
    globalThis.clearTimeout(timer);
    if (!joinedRoomIds || this.disposed) return;
    this.sidebarCache.pruneToJoined(joinedRoomIds);
  }

  public waitForSidebarCacheHydration(): Promise<boolean> {
    return this.cacheHydrationPromise;
  }

  private expandListsByPage(): void {
    if (!this.initialSyncCompleted) return;
    if (this.initialListHydrationCompleted) return;

    let allListsComplete = true;
    let expandedAny = false;

    const expansionStartTime = performance.now();
    const expansionDetails: Record<
      string,
      {
        status: string;
        knownCount: number;
        currentEnd?: number;
        desiredEnd?: number;
        previousEnd?: number;
        newEnd?: number;
        roomsToLoad?: number;
      }
    > = {};

    this.listKeys.forEach((key) => {
      const listData = this.slidingSync.getListData(key);
      const knownCount = listData?.joinedCount ?? 0;
      if (knownCount <= 0) {
        expansionDetails[key] = { status: 'empty', knownCount: 0 };
        return;
      }

      const existing = this.slidingSync.getListParams(key);
      const requestedEnd = getListEndIndex(existing);
      const currentEnd = this.confirmedListRangeEnds.get(key) ?? -1;

      const maxEnd = knownCount - 1;

      if (requestedEnd > currentEnd) {
        allListsComplete = false;
        expansionDetails[key] = {
          status: 'awaiting-response',
          knownCount,
          currentEnd,
          desiredEnd: requestedEnd,
        };
        return;
      }

      if (currentEnd >= maxEnd) {
        expansionDetails[key] = { status: 'complete', knownCount, currentEnd };
        return;
      }

      allListsComplete = false;

      const desiredEnd = Math.min(maxEnd, currentEnd + LIST_PAGE_SIZE);

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
      this.requestedListRangeEnds.set(key, desiredEnd);
      expandedAny = true;

      expansionDetails[key] = {
        status: 'expanding',
        knownCount,
        previousEnd: currentEnd,
        newEnd: desiredEnd,
        roomsToLoad: desiredEnd - currentEnd,
      };

      debugLog.info('sync', `Expanding list "${key}" by page`, {
        list: key,
        knownCount,
        previousEnd: currentEnd,
        newEnd: desiredEnd,
        roomsToLoad: desiredEnd - currentEnd,
      });
    });

    const expansionDuration = performance.now() - expansionStartTime;
    const hasExpansions = Object.values(expansionDetails).some((d) => d.status === 'expanding');
    if (allListsComplete) {
      if (!this.listsFullyLoaded) {
        this.listsFullyLoaded = true;
        this.initialListHydrationCompleted = true;
        this.reconcileSidebarCacheMembership();
        globalThis.setTimeout(() => this.flushDeferredSubscriptions(), 0);
        this.applySteadyStateListRanges();
        log.log(`Sliding Sync all lists fully loaded for ${this.mx.getUserId()}`);
        const totalRooms =
          (this.slidingSync.getListData(LIST_JOINED)?.joinedCount ?? 0) +
          (this.slidingSync.getListData(LIST_INVITES)?.joinedCount ?? 0);
        const listsLoadedMs =
          this.attachTime != null ? Math.round(performance.now() - this.attachTime) : 0;
        Sentry.metrics.distribution('sable.sync.lists_loaded_ms', listsLoadedMs, {
          attributes: { transport: 'sliding' },
        });
        Sentry.metrics.gauge('sable.sync.total_rooms', totalRooms, {
          attributes: { transport: 'sliding' },
        });
      }
    } else if (expandedAny) {
      this.listsFullyLoaded = false;
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
          (key) => expansionDetails[key]?.status === 'expanding'
        ),
      });
    }
  }

  private applySteadyStateListRanges(): void {
    const joinedList = this.slidingSync.getListParams(LIST_JOINED);
    const currentEnd = getListEndIndex(joinedList);
    const steadyStateEnd = Math.min(currentEnd, STEADY_STATE_DETAILED_ROOMS - 1);
    if (steadyStateEnd < 0 || steadyStateEnd === currentEnd) return;

    const joinedCount = this.slidingSync.getListData(LIST_JOINED)?.joinedCount ?? 0;
    const updatesCount = this.slidingSync.getListData(LIST_UPDATES)?.joinedCount ?? 0;
    const updatesConfirmedEnd = this.confirmedListRangeEnds.get(LIST_UPDATES) ?? -1;
    if (updatesCount !== joinedCount || updatesConfirmedEnd < joinedCount - 1) {
      debugLog.warn('sync', 'Kept detailed joined list fully covered: updates list unavailable', {
        joinedCount,
        updatesCount,
        updatesConfirmedEnd,
      });
      return;
    }

    this.slidingSync.setListRanges(LIST_JOINED, [[0, steadyStateEnd]]);
    this.requestedListRangeEnds.set(LIST_JOINED, steadyStateEnd);
    debugLog.info('sync', 'Reduced detailed joined list to steady-state window', {
      previousEnd: currentEnd,
      newEnd: steadyStateEnd,
      retainedDetailedRooms: steadyStateEnd + 1,
      updatesCoverageEnd: updatesConfirmedEnd,
    });
  }

  public ensureListRegistered(listKey: string, updateArgs: PartialSlidingSyncRequest): MSC3575List {
    let list = this.slidingSync.getListParams(listKey);
    if (!list) {
      list = {
        ranges: [[0, LIST_PAGE_SIZE - 1]],
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
      debugLog.warn('sync', `Failed to update list "${listKey}"`, {
        list: listKey,
        error: error instanceof Error ? error.message : String(error),
        updateType: updateArgs.ranges && Object.keys(updateArgs).length === 1 ? 'ranges' : 'full',
      });
    }
    return this.slidingSync.getListParams(listKey) ?? list;
  }

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

  public setSpaceScope(spaceId: string | null): void {
    if (this.disposed) return;
    const filters: MSC3575List['filters'] = spaceId
      ? { is_invite: false, spaces: [spaceId] }
      : { is_invite: false };
    this.ensureListRegistered(LIST_SPACE, {
      filters,
      ranges: spaceId ? [[0, LIST_PAGE_SIZE - 1]] : [[0, 0]],
      sort: LIST_SORT_ORDER,
    });
  }

  public isRoomActive(roomId: string): boolean {
    return this.activeRoomSubscriptions.has(roomId);
  }

  public isResponseProcessing(): boolean {
    return this.responseProcessing;
  }

  public subscribeToResponseSettled(listener: () => void): () => void {
    this.responseSettledListeners.add(listener);
    return () => this.responseSettledListeners.delete(listener);
  }

  public reconcileRoomMembership(
    roomId: string,
    membership: KnownMembership.Join | KnownMembership.Leave
  ): void {
    this.mx.getRoom(roomId)?.updateMyMembership(membership);

    if (membership === KnownMembership.Leave) {
      this.sidebarCache.removeRoom(roomId);
      const removedSpaceSubscription = this.spaceSubscriptions.delete(roomId);
      const removedSidebarSubscription = this.sidebarRoomSubscriptions.delete(roomId);
      if (this.activeRoomSubscriptions.has(roomId)) {
        this.unsubscribeFromRoom(roomId);
      } else if (removedSpaceSubscription || removedSidebarSubscription) {
        this.queueRoomSubscriptionSync();
      }
    }
  }

  private flushDeferredSubscriptions(): void {
    if (this.disposed || !this.listsFullyLoaded) return;

    const spaces = this.deferredSpaceSubscriptions;
    this.deferredSpaceSubscriptions = new Set();
    this.setSpaceSubscriptions(spaces);
  }

  private queueRoomSubscriptionSync(): void {
    if (this.disposed || this.roomSubscriptionSyncQueued) return;
    this.roomSubscriptionSyncQueued = true;
    globalThis.queueMicrotask(() => {
      this.roomSubscriptionSyncQueued = false;
      if (!this.disposed) this.syncRoomSubscriptions();
    });
  }

  private syncRoomSubscriptions(): void {
    const desiredSubscriptions = new Set([
      ...this.activeRoomSubscriptions,
      ...this.sidebarRoomSubscriptions,
      ...this.spaceSubscriptions,
      ...this.imagePackRoomSubscriptions,
    ]);

    desiredSubscriptions.forEach((roomId) => {
      if (this.activeRoomSubscriptions.has(roomId)) {
        this.slidingSync.useCustomSubscription(roomId, ACTIVE_ROOM_SUBSCRIPTION_KEY);
      } else if (this.sidebarRoomSubscriptions.has(roomId)) {
        this.slidingSync.useCustomSubscription(roomId, SIDEBAR_ROOM_SUBSCRIPTION_KEY);
      } else if (this.spaceSubscriptions.has(roomId)) {
        this.slidingSync.useCustomSubscription(roomId, SPACE_SUBSCRIPTION_KEY);
      } else {
        this.slidingSync.useCustomSubscription(roomId, IMAGE_PACK_SUBSCRIPTION_KEY);
      }
    });

    this.slidingSync.modifyRoomSubscriptions(desiredSubscriptions);
  }

  private pauseUnconfirmedListExpansion(): void {
    this.listKeys.forEach((key) => {
      const confirmedEnd = this.confirmedListRangeEnds.get(key) ?? -1;
      if (confirmedEnd < 0) return;

      const requestedEnd = getListEndIndex(this.slidingSync.getListParams(key));
      if (requestedEnd <= confirmedEnd) return;

      this.slidingSync.setListRanges(key, [[0, confirmedEnd]]);
      this.requestedListRangeEnds.set(key, confirmedEnd);
    });
  }

  public setImagePackSubscriptions(roomIds: Iterable<string>): void {
    if (this.disposed) return;
    const next = new Set(roomIds);
    const unchanged =
      next.size === this.imagePackRoomSubscriptions.size &&
      [...next].every((roomId) => this.imagePackRoomSubscriptions.has(roomId));
    if (unchanged) return;

    this.imagePackRoomSubscriptions.clear();
    next.forEach((roomId) => this.imagePackRoomSubscriptions.add(roomId));
    this.syncRoomSubscriptions();
  }

  /* Listen for raw sliding-sync data for one room */
  public onRoomData(roomId: string, listener: () => void): () => void {
    const handler = (dataRoomId: string) => {
      // Let matrix-js-sdk finish applying the room data before reading state events
      if (dataRoomId === roomId) globalThis.setTimeout(listener, 0);
    };
    this.slidingSync.on(SlidingSyncEvent.RoomData, handler);
    return () => this.slidingSync.removeListener(SlidingSyncEvent.RoomData, handler);
  }

  public onRoomSubscriptionStatus(
    roomId: string,
    listener: (loading: boolean) => void
  ): () => void {
    const listeners = this.roomSubscriptionStatusListeners.get(roomId) ?? new Set();
    listeners.add(listener);
    this.roomSubscriptionStatusListeners.set(roomId, listeners);
    listener(this.isRoomSubscriptionLoading(roomId));

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.roomSubscriptionStatusListeners.delete(roomId);
    };
  }

  public isRoomSubscriptionLoading(roomId: string): boolean {
    return (
      this.pendingRoomDataListeners.has(roomId) || this.roomDataAwaitingSyncCompletion.has(roomId)
    );
  }

  private notifyRoomSubscriptionStatus(roomId: string, loading: boolean): void {
    this.roomSubscriptionStatusListeners.get(roomId)?.forEach((listener) => listener(loading));
  }

  private addActiveRoomSubscription(roomId: string): boolean {
    if (this.activeRoomSubscriptions.has(roomId)) return false;
    const room = this.mx.getRoom(roomId);
    const isEncrypted = this.mx.isRoomEncrypted(roomId);
    this.activeRoomSubscriptions.add(roomId);
    this.pauseUnconfirmedListExpansion();
    log.log(`Sliding Sync active room subscription added: ${roomId}`);
    debugLog.info('sync', 'Room subscription requested (sliding)', {
      encrypted: isEncrypted,
      unknownRoom: !room,
      activeSubscriptions: this.activeRoomSubscriptions.size,
      syncCycle: this.syncCount,
    });
    Sentry.addBreadcrumb({
      category: 'sync.sliding',
      message: 'Subscribed to room (active)',
      level: 'info',
      data: {
        encrypted: isEncrypted,
        activeSubscriptions: this.activeRoomSubscriptions.size,
      },
    });
    const existingListener = this.pendingRoomDataListeners.get(roomId);
    if (existingListener) {
      this.slidingSync.removeListener(SlidingSyncEvent.RoomData, existingListener);
    }
    const subscribeMs = performance.now();
    const onFirstRoomData = (dataRoomId: string) => {
      if (dataRoomId !== roomId) return;
      if (this.hydratingSidebarCache) return;
      const latencyMs = Math.round(performance.now() - subscribeMs);
      const subscribedRoom = this.mx.getRoom(roomId);
      const eventCount = subscribedRoom?.getLiveTimeline().getEvents().length ?? 0;
      debugLog.info('sync', 'Room subscription: first data received (sliding)', {
        latencyMs,
        syncCycle: this.syncCount,
        eventCount,
      });
      Sentry.metrics.distribution('sable.sync.room_sub_latency_ms', latencyMs, {
        attributes: { transport: 'sliding' },
      });
      Sentry.metrics.distribution('sable.sync.room_sub_event_count', eventCount, {
        attributes: { transport: 'sliding' },
      });
      Sentry.addBreadcrumb({
        category: 'sync.sliding',
        message: `Room subscription data arrived (${eventCount} events, ${latencyMs}ms)`,
        level: 'info',
        data: { latencyMs, eventCount, syncCycle: this.syncCount },
      });
      this.slidingSync.removeListener(SlidingSyncEvent.RoomData, onFirstRoomData);
      this.pendingRoomDataListeners.delete(roomId);
      this.roomDataAwaitingSyncCompletion.add(roomId);
    };
    this.pendingRoomDataListeners.set(roomId, onFirstRoomData);
    this.slidingSync.on(SlidingSyncEvent.RoomData, onFirstRoomData);
    this.notifyRoomSubscriptionStatus(roomId, true);
    return true;
  }

  private removeActiveRoomSubscription(roomId: string): boolean {
    if (!this.activeRoomSubscriptions.has(roomId)) return false;
    const pendingListener = this.pendingRoomDataListeners.get(roomId);
    if (pendingListener) {
      this.slidingSync.removeListener(SlidingSyncEvent.RoomData, pendingListener);
      this.pendingRoomDataListeners.delete(roomId);
    }
    this.roomDataAwaitingSyncCompletion.delete(roomId);
    this.notifyRoomSubscriptionStatus(roomId, false);
    this.activeRoomSubscriptions.delete(roomId);
    log.log(`Sliding Sync active room subscription removed: ${roomId}`);
    debugLog.info('sync', 'Room subscription removed (sliding)', {
      remainingSubscriptions: this.activeRoomSubscriptions.size,
      syncCycle: this.syncCount,
    });
    return true;
  }

  private reportActiveSubscriptionCount(): void {
    Sentry.metrics.gauge('sable.sync.active_subscriptions', this.activeRoomSubscriptions.size, {
      attributes: { transport: 'sliding' },
    });
  }

  public setActiveRoomSubscriptions(roomIds: Iterable<string>): void {
    if (this.disposed) return;
    const next = new Set(roomIds);
    let changed = false;

    this.activeRoomSubscriptions.forEach((roomId) => {
      if (!next.has(roomId)) changed = this.removeActiveRoomSubscription(roomId) || changed;
    });
    next.forEach((roomId) => {
      if (!this.activeRoomSubscriptions.has(roomId)) {
        changed = this.addActiveRoomSubscription(roomId) || changed;
      }
    });

    if (!changed) return;
    this.syncRoomSubscriptions();
    this.reportActiveSubscriptionCount();
  }

  public getActiveRoomSubscriptionIds(): string[] {
    return [...this.activeRoomSubscriptions];
  }

  public subscribeToRoom(roomId: string): void {
    if (this.disposed || !this.addActiveRoomSubscription(roomId)) return;
    this.syncRoomSubscriptions();
    this.reportActiveSubscriptionCount();
  }

  public unsubscribeFromRoom(roomId: string): void {
    if (this.disposed || !this.removeActiveRoomSubscription(roomId)) return;
    this.syncRoomSubscriptions();
    this.reportActiveSubscriptionCount();
  }

  public setSpaceSubscriptions(roomIds: Iterable<string>): void {
    if (this.disposed) return;
    const next = new Set(roomIds);
    if (!this.listsFullyLoaded) {
      this.deferredSpaceSubscriptions = next;
      return;
    }
    const unchanged =
      next.size === this.spaceSubscriptions.size &&
      [...next].every((roomId) => this.spaceSubscriptions.has(roomId));
    if (unchanged) return;

    this.spaceSubscriptions.clear();
    next.forEach((roomId) => this.spaceSubscriptions.add(roomId));
    this.syncRoomSubscriptions();
    this.expandListsByPage();
  }
}
