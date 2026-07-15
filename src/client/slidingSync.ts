import type {
  MatrixClient,
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
} from '$types/matrix-sdk';
import { createLogger } from '$utils/debug';
import { createDebugLogger } from '$utils/debugLogger';
import { CustomStateEvent } from '$types/matrix/room';
import * as Sentry from '@sentry/react';

const log = createLogger('slidingSync');
const debugLog = createDebugLogger('slidingSync');

export const LIST_JOINED = 'joined';
export const LIST_INVITES = 'invites';
export const LIST_SEARCH = 'search';
export const LIST_ROOM_SEARCH = 'room_search';
export const LIST_SPACE = 'space';
const LIST_TIMELINE_LIMIT = 1;
const DEFAULT_LIST_PAGE_SIZE = 250;
const DEFAULT_POLL_TIMEOUT_MS = 20000;
const DEFAULT_MAX_ROOMS = 5000;

const LIST_SORT_ORDER = ['by_recency', 'by_name'];

const UNENCRYPTED_SUBSCRIPTION_KEY = 'unencrypted';
const ACTIVE_ROOM_TIMELINE_LIMIT = 50;

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
  listPageSize: number;
  lists: SlidingSyncListDiagnostics[];
};

const clampPositive = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return fallback;
  return Math.round(value);
};

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
  [EventType.GroupCallMemberPrefix, MSC3575_WILDCARD],
  [CustomStateEvent.ImagePack, MSC3575_WILDCARD],
  [CustomStateEvent.PoniesRoomEmotes, MSC3575_WILDCARD],
  [CustomStateEvent.RoomAbbreviations, ''],
  [CustomStateEvent.RoomBanner, ''],
];

const ACTIVE_ROOM_REQUIRED_STATE: MSC3575RoomSubscription['required_state'] = [
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
  required_state: [[MSC3575_WILDCARD, MSC3575_WILDCARD]],
});

const buildUnencryptedSubscription = (timelineLimit: number): MSC3575RoomSubscription => ({
  timeline_limit: timelineLimit,
  required_state: ACTIVE_ROOM_REQUIRED_STATE,
});

const buildLists = (pageSize: number, includeInviteList: boolean): Map<string, MSC3575List> => {
  const lists = new Map<string, MSC3575List>();
  const listRequiredState = buildListRequiredState();

  const initialRange = Math.min(pageSize, 100);

  lists.set(LIST_JOINED, {
    ranges: [[0, Math.max(0, initialRange - 1)]],
    sort: LIST_SORT_ORDER,
    timeline_limit: LIST_TIMELINE_LIMIT,
    required_state: listRequiredState,
    filters: { is_invite: false },
  });

  if (includeInviteList) {
    lists.set(LIST_INVITES, {
      ranges: [[0, Math.max(0, initialRange - 1)]],
      sort: LIST_SORT_ORDER,
      timeline_limit: LIST_TIMELINE_LIMIT,
      required_state: listRequiredState,
      filters: { is_invite: true },
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

  private readonly roomTimelineLimit: number;

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

  private initialSyncCompleted = false;

  private syncCount = 0;

  private previousListCounts: Map<string, number> = new Map();

  /**
   * One-shot RoomData listeners keyed by roomId, used to measure the latency
   * between subscribeToRoom() and the first data arriving for that room.
   * Cleaned up automatically after first fire or on unsubscribe/dispose.
   */
  private readonly pendingRoomDataListeners = new Map<
    string,
    (roomId: string, data: MSC3575RoomData) => void
  >();

  /** Wall-clock time recorded in attach() — used to compute true initial-sync latency. */
  private attachTime: number | null = null;

  /** Span covering the period from attach() to the first successful complete cycle. */
  private initialSyncSpan: ReturnType<typeof Sentry.startInactiveSpan> | null = null;

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

    const roomTimelineLimit = clampPositive(config.timelineLimit, ACTIVE_ROOM_TIMELINE_LIMIT);
    this.roomTimelineLimit = roomTimelineLimit;

    const defaultSubscription = buildEncryptedSubscription(roomTimelineLimit);
    const lists = buildLists(listPageSize, includeInviteList);
    this.listKeys = Array.from(lists.keys());
    this.slidingSync = new SlidingSync(proxyBaseUrl, lists, defaultSubscription, mx, pollTimeoutMs);

    this.slidingSync.addCustomSubscription(
      UNENCRYPTED_SUBSCRIPTION_KEY,
      buildUnencryptedSubscription(roomTimelineLimit)
    );

    this.onLifecycle = (state, resp, err) => {
      const syncStartTime = performance.now();
      this.syncCount += 1;
      Sentry.metrics.count('sable.sync.cycle', 1, {
        attributes: { transport: 'sliding', state },
      });

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
        Sentry.metrics.count('sable.sync.error', 1, {
          attributes: { transport: 'sliding', state },
        });
      }

      if (this.disposed) {
        debugLog.warn('sync', 'Sync lifecycle called after disposal', { state });
        return;
      }

      if (err || !resp || state !== SlidingSyncState.Complete) return;

      const changes: Record<string, { previous: number; current: number; delta: number }> = {};
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

      const syncDuration = performance.now() - syncStartTime;

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

      this.expandListsToKnownCount();

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
    };

    this.onMembershipLeave = (_event, member) => {
      if (member.userId !== this.mx.getUserId()) return;
      if (member.membership !== KnownMembership.Leave && member.membership !== KnownMembership.Ban)
        return;
      if (!this.activeRoomSubscriptions.has(member.roomId)) return;
      this.unsubscribeFromRoom(member.roomId);
    };
  }

  public attach(): void {
    debugLog.info('sync', 'Attaching sliding sync listeners', {
      proxyBaseUrl: this.proxyBaseUrl,
      listPageSize: this.listPageSize,
      roomTimelineLimit: this.roomTimelineLimit,
      maxRooms: this.maxRooms,
      lists: this.listKeys,
    });

    this.attachTime = performance.now();
    this.initialSyncSpan = Sentry.startInactiveSpan({
      name: 'sync.initial',
      op: 'matrix.sync',
      attributes: { 'sync.transport': 'sliding', 'sync.proxy': this.proxyBaseUrl },
    });

    this.slidingSync.on(SlidingSyncEvent.Lifecycle, this.onLifecycle);
    this.mx.on(RoomMemberEvent.Membership, this.onMembershipLeave);

    debugLog.info('sync', 'Sliding sync listeners attached successfully');
  }

  public dispose(): void {
    if (this.disposed) return;

    debugLog.info('sync', 'Disposing sliding sync', {
      syncCount: this.syncCount,
      initialSyncCompleted: this.initialSyncCompleted,
    });

    this.pendingRoomDataListeners.clear();

    this.disposed = true;
    this.slidingSync.stop();
    this.slidingSync.removeListener(SlidingSyncEvent.Lifecycle, this.onLifecycle);
    this.mx.removeListener(RoomMemberEvent.Membership, this.onMembershipLeave);

    debugLog.info('sync', 'Sliding sync disposed successfully', {
      totalSyncCycles: this.syncCount,
    });
  }

  public getDiagnostics(): SlidingSyncDiagnostics {
    return {
      proxyBaseUrl: this.proxyBaseUrl,
      timelineLimit: this.roomTimelineLimit,
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
    if (this.listsFullyLoaded) return;

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
      const currentEnd = getListEndIndex(existing);

      const maxEnd = Math.min(knownCount, this.maxRooms) - 1;

      if (currentEnd >= maxEnd) {
        expansionDetails[key] = { status: 'complete', knownCount, currentEnd };
        return;
      }

      allListsComplete = false;

      const desiredEnd = maxEnd;

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

    if (allListsComplete) {
      this.listsFullyLoaded = true;
      log.log(`Sliding Sync all lists fully loaded for ${this.mx.getUserId()}`);
      const totalRooms = this.listKeys.reduce(
        (sum, key) => sum + (this.slidingSync.getListData(key)?.joinedCount ?? 0),
        0
      );
      const listsLoadedMs =
        this.attachTime != null ? Math.round(performance.now() - this.attachTime) : 0;
      Sentry.metrics.distribution('sable.sync.lists_loaded_ms', listsLoadedMs, {
        attributes: { transport: 'sliding' },
      });
      Sentry.metrics.gauge('sable.sync.total_rooms', totalRooms, {
        attributes: { transport: 'sliding' },
      });
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
          (key) => expansionDetails[key]?.status === 'expanding'
        ),
      });
    }
  }

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
      ranges: spaceId ? [[0, Math.min(this.listPageSize - 1, 499)]] : [[0, 0]],
      sort: LIST_SORT_ORDER,
    });
  }

  public isRoomActive(roomId: string): boolean {
    return this.activeRoomSubscriptions.has(roomId);
  }

  public subscribeToRoom(roomId: string): void {
    if (this.disposed) return;
    const room = this.mx.getRoom(roomId);
    const isEncrypted = this.mx.isRoomEncrypted(roomId);
    if (room && !isEncrypted) {
      this.slidingSync.useCustomSubscription(roomId, UNENCRYPTED_SUBSCRIPTION_KEY);
    }
    this.activeRoomSubscriptions.add(roomId);
    this.slidingSync.modifyRoomSubscriptions(new Set(this.activeRoomSubscriptions));
    Sentry.metrics.gauge('sable.sync.active_subscriptions', this.activeRoomSubscriptions.size, {
      attributes: { transport: 'sliding' },
    });
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
    };
    this.pendingRoomDataListeners.set(roomId, onFirstRoomData);
    this.slidingSync.on(SlidingSyncEvent.RoomData, onFirstRoomData);
  }

  public unsubscribeFromRoom(roomId: string): void {
    if (this.disposed) return;
    const pendingListener = this.pendingRoomDataListeners.get(roomId);
    if (pendingListener) {
      this.slidingSync.removeListener(SlidingSyncEvent.RoomData, pendingListener);
      this.pendingRoomDataListeners.delete(roomId);
    }
    this.activeRoomSubscriptions.delete(roomId);
    this.slidingSync.modifyRoomSubscriptions(new Set(this.activeRoomSubscriptions));
    Sentry.metrics.gauge('sable.sync.active_subscriptions', this.activeRoomSubscriptions.size, {
      attributes: { transport: 'sliding' },
    });
    log.log(`Sliding Sync active room subscription removed: ${roomId}`);
    debugLog.info('sync', 'Room subscription removed (sliding)', {
      remainingSubscriptions: this.activeRoomSubscriptions.size,
      syncCycle: this.syncCount,
    });
  }
}
