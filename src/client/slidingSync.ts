import type {
  Extension,
  MatrixClient,
  MSC3575List,
  MSC3575RoomData,
  MSC3575RoomSubscription,
  MSC3575SlidingSyncResponse,
} from '$types/matrix-sdk';
import {
  ClientEvent,
  ExtensionState,
  KnownMembership,
  MSC3575_WILDCARD,
  RoomMemberEvent,
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
import { completeRoomNavigation } from '$utils/perfTelemetry';
import * as Sentry from '@sentry/react';
import { CustomStateEvent } from '$types/matrix/room';
import { classifyCryptoStoreIndexedDbError } from './cryptoStoreErrors';

const log = createLogger('slidingSync');
const debugLog = createDebugLogger('slidingSync');

interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  addEventListener?: (event: string, callback: () => void) => void;
  removeEventListener?: (event: string, callback: () => void) => void;
  onchange?: (() => void) | null;
}

export const LIST_JOINED = 'joined';
export const LIST_INVITES = 'invites';
export const LIST_DMS = 'dms';
export const LIST_SEARCH = 'search';
// Separate key for live room-name filtering; avoids conflicting with the spidering list.
export const LIST_ROOM_SEARCH = 'room_search';
// Dynamic list key used for space-scoped room views.
export const LIST_SPACE = 'space';
// No timeline events for list rooms by default: server-provided notification_count
// and summary fields should carry the room list. Message previews can opt into a
// tiny timeline window, but startup must not hydrate every visible room like
// classic sync.
// Value 0 means state-only (no timeline events in list responses).
// Setting this above 0 triggers decryptCriticalEvents() per sync, so encrypted rooms
// with many threads/reactions may produce "Decrypted event is not in room" warnings.
// The message-preview feature can override this via ClientRoot when previews are enabled.
const DEFAULT_LIST_TIMELINE_LIMIT = 0;
const DEFAULT_LIST_PAGE_SIZE = 30;
const DEFAULT_POLL_TIMEOUT_MS = 20000;
const DEFAULT_MAX_ROOMS = 5000;
const FORCE_RESUBSCRIPTION_RESTORE_TIMEOUT_MS = 5000;
const HEALTH_CHECK_INTERVAL_MS = 15_000;
const HEALTH_STALE_AFTER_MS = 30_000;
const HEALTH_RETRY_COOLDOWN_MS = 30_000;
const SPACE_GRAPH_WARMUP_INITIAL_DELAY_MS = 2500;
const SPACE_GRAPH_WARMUP_INTERVAL_MS = 1500;
const DEFAULT_SPACE_GRAPH_WARMUP_ROOMS = 300;
const ROOM_PREFETCH_TTL_MS = 12_000;

// Sort order for MSC4186 (Simplified Sliding Sync): most recently active first,
// then alphabetical as a tiebreaker. by_notification_level is MSC3575-only and
// not supported by Synapse's native MSC4186 implementation.
const LIST_SORT_ORDER = ['by_recency', 'by_name'];

// Subscription key for the room the user is actively viewing.
// Encrypted rooms get [*,*] required_state; unencrypted rooms also request lazy members.
const UNENCRYPTED_SUBSCRIPTION_KEY = 'unencrypted';
// Timeline limit for the active-room subscription (full history load).
// List entries use a configurable timeline limit (default 0; raised when message previews are enabled).
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
  listTimelineLimit?: number;
  timelineLimit?: number;
  pollTimeoutMs?: number;
  maxRooms?: number;
  spaceGraphWarmupRooms?: number;
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
  lastSuccessfulSyncAgeMs: number | null;
  healthy: boolean;
  lists: SlidingSyncListDiagnostics[];
};

const clampPositive = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return fallback;
  return Math.round(value);
};

// Minimal required_state for list entries; enough to render the room list sidebar,
// compute unread state, build the space hierarchy, and keep alias-based room links
// available without fetching full room history.
// Notes:
//   - RoomName is omitted: sliding sync returns the room name as a top-level field
//     in every list response, so fetching it as a state event is redundant.
//   - MSC3575_STATE_KEY_LAZY is included only when `includeMembers=true` (i.e. when
//     message previews are enabled and listTimelineLimit > 0). Lazy loading brings in
//     m.room.member state events for senders of the preview timeline events so that
//     display names resolve correctly. When previews are disabled, lazy loading is
//     omitted to avoid wasteful member fetches for every list entry.
//   - m.room.topic is required: topics are displayed for joined child rooms in space
//     lobby (RoomItem → LocalRoomSummaryLoader → useLocalRoomSummary) and in the
//     invite list. Without this event the topic always shows as blank for non-active
//     rooms.
//   - Room emoji packs and abbreviations are inherited from ancestor spaces by the
//     composer and message renderer. Keep them in state-only list windows so cold
//     sliding-sync sessions do not lose inherited rendering until a parent space is
//     opened as the active room.
const buildListRequiredState = (
  includeMembers: boolean
): MSC3575RoomSubscription['required_state'] => [
  [EventType.RoomJoinRules, ''],
  [EventType.RoomAvatar, ''],
  [EventType.RoomTombstone, ''],
  [EventType.RoomEncryption, ''],
  [EventType.RoomCreate, ''],
  [EventType.RoomTopic, ''],
  [EventType.RoomCanonicalAlias, ''],
  [EventType.RoomMember, MSC3575_STATE_KEY_ME],
  [EventType.SpaceChild, MSC3575_WILDCARD],
  [CustomStateEvent.PoniesRoomEmotes, MSC3575_WILDCARD],
  [CustomStateEvent.RoomAbbreviations, ''],
  ...(includeMembers ? [[EventType.RoomMember, MSC3575_STATE_KEY_LAZY] as [string, string]] : []),
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

const buildLists = (
  pageSize: number,
  includeInviteList: boolean,
  listTimelineLimit: number
): Map<string, MSC3575List> => {
  const lists = new Map<string, MSC3575List>();
  const listRequiredState = buildListRequiredState(listTimelineLimit > 0);

  // Start with the visible room-list window only. Sliding sync wins by not
  // hydrating all cached rooms at startup; follow-up range changes should come
  // from UI demand such as scrolling, show-more, or a space-filter change.
  const initialRange = Math.max(1, pageSize);

  lists.set(LIST_JOINED, {
    ranges: [[0, Math.max(0, initialRange - 1)]],
    sort: LIST_SORT_ORDER,
    timeline_limit: listTimelineLimit,
    required_state: listRequiredState,
    filters: { is_invite: false },
  });

  if (includeInviteList) {
    lists.set(LIST_INVITES, {
      ranges: [[0, Math.max(0, initialRange - 1)]],
      sort: LIST_SORT_ORDER,
      timeline_limit: listTimelineLimit,
      required_state: listRequiredState,
      filters: { is_invite: true },
    });
  }

  lists.set(LIST_DMS, {
    ranges: [[0, Math.max(0, initialRange - 1)]],
    sort: LIST_SORT_ORDER,
    timeline_limit: listTimelineLimit,
    required_state: listRequiredState,
    filters: { is_dm: true },
  });

  return lists;
};

const getListEndIndex = (list: MSC3575List | null): number => {
  if (!list?.ranges?.length) return -1;
  return list.ranges.reduce((max, range) => Math.max(max, range[1] ?? -1), -1);
};

// MSC4186 presence extension: requests `extensions.presence` in every sliding sync
// poll.  NOTE: Synapse's MSC4186 implementation does not currently support this
// extension (its get_extensions_response only handles to_device, e2ee, account_data,
// receipts, typing, and thread_subscriptions).  The extension is kept here so that
// clients automatically benefit if/when server support is added; live presence for
// now is handled by the direct REST fallback in useUserPresence.
class ExtensionPresence implements Extension<{ enabled: boolean }, { events?: object[] }> {
  private enabled = true;

  public constructor(private readonly mx: MatrixClient) {}

  public setEnabled(value: boolean): void {
    this.enabled = value;
  }

  public name(): string {
    return 'presence';
  }

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

  private readonly spaceGraphWarmupRooms: number;

  private readonly listKeys: string[];

  private readonly activeRoomSubscriptions = new Set<string>();

  private readonly activeRoomSubscriptionRefs = new Map<string, number>();

  private readonly prefetchedRoomSubscriptions = new Set<string>();

  private readonly prefetchedRoomSubscriptionTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  private readonly ptrRefreshRooms = new Set<string>();

  private readonly visitedRoomsThisSession = new Set<string>();

  private roomSubscriptionFlushTimer: ReturnType<typeof setTimeout> | undefined;

  private lastFlushedRoomSubscriptionsKey = '';

  private readonly listPageSize: number;

  private readonly listTimelineLimit: number;

  private readonly roomTimelineLimit: number;

  private readonly onConnectionChange: () => void;

  private readonly initialRoomCount: number;

  private readonly initialWarmCache: boolean;

  private readonly loadedRoomIds = new Set<string>();

  private readonly loadedListCoverageEnd = new Map<string, number>();

  private lastOnlineState = typeof navigator !== 'undefined' ? navigator.onLine : true;

  private readonly onLifecycle: (state: SlidingSyncState, resp: unknown, err?: Error) => void;

  private readonly onMembershipLeave: (
    event: unknown,
    member: { userId: string; roomId: string; membership?: string }
  ) => void;

  private presenceExtension!: ExtensionPresence;

  private listsFullyLoaded = false;

  private initialSyncCompleted = false;

  private syncCount = 0;

  private previousListCounts: Map<string, number> = new Map();

  /**
   * When non-null, contains the set of room IDs that were active subscriptions
   * before a force-reset was scheduled (pull-to-refresh). The rooms are
   * temporarily cleared from activeRoomSubscriptions so the server processes
   * one empty-subscription cycle, and then restored here so the server treats
   * them as fresh subscriptions and returns initial:true with full data and
   * backward-pagination tokens.
   */
  private pendingResubscriptions: Set<string> | null = null;
  private pendingForceResetCompletionReason: 'request_finished' | 'timeout' | null = null;

  private pendingResubscriptionRestoreTimer: ReturnType<typeof setTimeout> | undefined;

  private pendingForceResetWaiters: Array<
    (reason: 'request_finished' | 'timeout' | 'disposed') => void
  > = [];

  private healthCheckTimer: ReturnType<typeof setInterval> | undefined;

  private spaceGraphWarmupTimer: ReturnType<typeof setTimeout> | undefined;

  private spaceGraphWarmupStarted = false;

  private lastSuccessfulSyncAt = 0;

  private lastHealthRetryAt = 0;

  private attachWallClockAt: number | null = null;

  /**
   * One-shot RoomData listeners keyed by roomId, used to measure the latency
   * between subscribeToRoom() and the first data arriving for that room.
   * Cleaned up automatically after first fire or on unsubscribe/dispose.
   */
  private readonly pendingRoomDataListeners = new Map<
    string,
    (roomId: string, data: MSC3575RoomData) => void
  >();
  private pendingWatchdogPing: Promise<void> | null = null;

  /** Wall-clock time recorded in attach() — used to compute true initial-sync latency. */
  private attachTime: number | null = null;

  /** Span covering the period from attach() to the first successful complete cycle. */
  private initialSyncSpan: ReturnType<typeof Sentry.startInactiveSpan> | null = null;

  public readonly slidingSync: SlidingSync;

  public readonly probeTimeoutMs: number;

  public constructor(
    private readonly mx: MatrixClient,
    private readonly proxyBaseUrl: string,
    config: SlidingSyncConfig,
    initialWarmCache?: boolean
  ) {
    const listPageSize = clampPositive(config.listPageSize, DEFAULT_LIST_PAGE_SIZE);
    const pollTimeoutMs = clampPositive(config.pollTimeoutMs, DEFAULT_POLL_TIMEOUT_MS);
    this.probeTimeoutMs = clampPositive(config.probeTimeoutMs, 5000);
    this.maxRooms = clampPositive(config.maxRooms, DEFAULT_MAX_ROOMS);
    this.spaceGraphWarmupRooms = Math.min(
      this.maxRooms,
      clampPositive(config.spaceGraphWarmupRooms, DEFAULT_SPACE_GRAPH_WARMUP_ROOMS)
    );
    this.listPageSize = listPageSize;
    const includeInviteList = config.includeInviteList !== false;
    this.listTimelineLimit = clampPositive(config.listTimelineLimit, DEFAULT_LIST_TIMELINE_LIMIT);

    const roomTimelineLimit = clampPositive(config.timelineLimit, ACTIVE_ROOM_TIMELINE_LIMIT);
    this.roomTimelineLimit = roomTimelineLimit;
    this.initialRoomCount = mx.getRooms().length;
    this.initialWarmCache = initialWarmCache ?? this.initialRoomCount > 0;

    const defaultSubscription = buildEncryptedSubscription(roomTimelineLimit);
    const lists = buildLists(listPageSize, includeInviteList, this.listTimelineLimit);
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
      Sentry.metrics.count('sable.sync.cycle', 1, {
        attributes: { transport: 'sliding', state },
      });

      debugLog.info('sync', `Sliding sync lifecycle: ${state} (cycle #${this.syncCount})`, {
        state,
        hasError: !!err,
        syncNumber: this.syncCount,
        isInitialSync: !this.initialSyncCompleted,
      });

      // Add breadcrumb for all state transitions (not just errors) to have full picture before crashes
      const roomsInResponse = (resp as MSC3575SlidingSyncResponse)?.rooms
        ? Object.keys((resp as MSC3575SlidingSyncResponse).rooms).length
        : 0;
      Sentry.addBreadcrumb({
        category: 'sync.slidingSync',
        message: `Sliding sync state: ${state}`,
        data: {
          prevState: 'unknown',
          newState: state,
          syncNumber: this.syncCount,
          roomsInResponse,
          hasError: !!err,
        },
        level: state === SlidingSyncState.RequestFinished ? 'info' : err ? 'error' : 'warning',
      });

      if (err) {
        const errorMsg = err.message ?? '';
        const cryptoStoreErrorType = classifyCryptoStoreIndexedDbError(errorMsg);
        const isCryptoStoreError = cryptoStoreErrorType !== undefined;

        debugLog.error('sync', 'Sliding sync error', {
          error: err,
          errorMessage: errorMsg,
          syncNumber: this.syncCount,
          state,
          isCryptoStoreError,
        });
        Sentry.metrics.count('sable.sync.error', 1, {
          attributes: {
            transport: 'sliding',
            state,
            crypto_store_error: isCryptoStoreError,
          },
        });

        // Capture crypto store errors to Sentry with additional context
        if (isCryptoStoreError) {
          Sentry.captureMessage('Crypto store IndexedDB error during sync', {
            level: 'error',
            tags: {
              component: 'crypto-store',
              sync_transport: 'sliding',
              error_type: cryptoStoreErrorType,
            },
            extra: {
              errorMessage: errorMsg,
              syncState: state,
              syncNumber: this.syncCount,
              userId: this.mx.getUserId(),
              recovery_recommendation:
                'Matrix SDK WASM crypto layer issue - client will attempt to reconnect',
            },
          });
        }

        // Detect M_UNKNOWN_POS error (sliding sync position lost)
        const errorData = err as { errcode?: string; httpStatus?: number };
        if (
          errorData.errcode === 'M_UNKNOWN_POS' ||
          (err.message && err.message.includes('M_UNKNOWN_POS'))
        ) {
          Sentry.addBreadcrumb({
            category: 'sync.slidingSync',
            message: 'Sliding sync position lost (M_UNKNOWN_POS) — full resync required',
            data: {
              syncNumber: this.syncCount,
              roomsLoaded: this.mx.getRooms().length,
              errorMessage: err.message,
            },
            level: 'error',
          });
          Sentry.captureMessage('Sliding sync M_UNKNOWN_POS detected', {
            level: 'warning',
            tags: { sync_transport: 'sliding' },
            extra: {
              syncNumber: this.syncCount,
              roomCount: this.mx.getRooms().length,
            },
          });
        }
      }

      if (this.disposed) {
        debugLog.warn('sync', 'Sync lifecycle called after disposal', { state });
        return;
      }

      if (
        !err &&
        (state === SlidingSyncState.RequestFinished || state === SlidingSyncState.Complete)
      ) {
        this.lastSuccessfulSyncAt = Date.now();
      }

      // Before room data is processed, reset live timelines for active rooms that
      // are receiving a full refresh (initial: true) or a post-gap update
      // (limited: true). The SDK deliberately does not call resetLiveTimeline() for
      // sliding sync, so events from previous visits accumulate in the live
      // timeline alongside new events. Resetting here — before the SDK's
      // onRoomData listener runs — ensures the fresh batch lands on a clean
      // timeline with a correct backward pagination token.
      //
      // IMPORTANT: We must be conservative about resets to avoid breaking forward
      // pagination. Only reset when we're certain the local timeline is genuinely
      // stale, not just when there's no overlap (server may be sending an extended
      // range that includes older events not in the local timeline).
      if (state === SlidingSyncState.RequestFinished && resp && !err) {
        if (this.pendingForceResetCompletionReason && this.pendingResubscriptions === null) {
          const completionReason = this.pendingForceResetCompletionReason;
          this.pendingForceResetCompletionReason = null;
          this.resolvePendingForceResetWaiters(completionReason);
        }

        const response = resp as MSC3575SlidingSyncResponse & {
          lists?: Record<
            string,
            { ops?: Array<{ range?: [number, number]; room_ids?: string[] }> }
          >;
        };
        const rooms = response.rooms ?? {};
        Object.keys(rooms).forEach((roomId) => this.loadedRoomIds.add(roomId));
        Object.entries(response.lists ?? {}).forEach(([key, listData]) => {
          listData.ops?.forEach((op) => {
            const start = op.range?.[0];
            const roomIds = op.room_ids ?? [];
            if (typeof start !== 'number' || roomIds.length === 0) return;
            const loadedEnd = start + roomIds.length - 1;
            const previousEnd = this.loadedListCoverageEnd.get(key) ?? -1;
            this.loadedListCoverageEnd.set(key, Math.max(previousEnd, loadedEnd));
          });
        });
        Object.entries(rooms)
          .filter(([, roomData]) => roomData.initial || roomData.limited)
          .filter(([roomId]) => this.activeRoomSubscriptions.has(roomId))
          .forEach(([roomId, roomData]) => {
            const room = this.mx.getRoom(roomId);
            if (!room) return;
            const timelineSet = room.getUnfilteredTimelineSet();
            const liveTimeline = timelineSet.getLiveTimeline();
            const localEvents = liveTimeline.getEvents();

            // Empty timeline: reset is fine, no flicker
            if (localEvents.length === 0) return;

            // Check for event overlap with server data
            const serverEvents = roomData.timeline ?? [];
            if (serverEvents.length === 0) {
              // No incoming events: preserve local timeline
              return;
            }

            // Build set of local event IDs for fast lookup
            const localIds = new Set(localEvents.map((e) => e.getId()));
            const serverIds = serverEvents.map((e) => e.event_id);

            // Check if any server event ID exists in local timeline
            const hasOverlap = serverIds.some((id) => localIds.has(id));

            if (hasOverlap) {
              // Overlap detected: SDK will merge naturally, no reset needed
              // This prevents flicker when reopening recently-viewed rooms
              return;
            }

            // No direct overlap found. Before resetting, check if this is just an
            // extended range (server sending older events) vs. a genuinely stale
            // timeline (local events are from a different timeline branch).
            //
            // Strategy: if the newest server event is older than the oldest local
            // event, the timelines are disjoint and we should preserve the local
            // timeline to maintain forward pagination capability. The SDK will
            // naturally merge them when the user paginates backward.
            //
            // Only reset if we detect the local timeline is truly stale (e.g., the
            // server has newer events that aren't in the local timeline, indicating
            // the local timeline is from an old session or after a gap).
            if (serverEvents.length > 0 && localEvents.length > 0) {
              const newestServerEvent = serverEvents[serverEvents.length - 1];
              const oldestLocalEvent = localEvents[0];
              const newestServerTs = newestServerEvent?.origin_server_ts ?? 0;
              const oldestLocalTs = oldestLocalEvent?.getTs() ?? 0;

              // If server's newest event is older than local's oldest event, the
              // server is giving us historical events that fill in the gap before
              // our current timeline. Don't reset — let the SDK link them.
              if (newestServerTs < oldestLocalTs) {
                return;
              }
            }

            // Check if this room has been visited in this session - skip automatic
            // resets to avoid blanking the UI when the user is actively viewing the room.
            // Exception: allow resets during PTR (room is in ptrRefreshRooms set).
            const isPTRMode = this.ptrRefreshRooms.has(roomId);
            if (!isPTRMode && this.visitedRoomsThisSession.has(roomId)) {
              debugLog.info('sync', 'Skipping automatic timeline reset for visited room', {
                roomId,
                localEvents: localEvents.length,
                serverEvents: serverEvents.length,
              });
              return;
            }

            // No overlap and server has newer events: local timeline is stale, reset needed
            debugLog.info('sync', 'Resetting timeline', {
              roomId,
              isPTR: isPTRMode,
              localEvents: localEvents.length,
              serverEvents: serverEvents.length,
            });
            this.resetRoomTimelines(roomId, isPTRMode ? 'ptr_initial' : 'stale_initial');

            // If this was a PTR refresh, remove from the set now that reset is complete
            if (isPTRMode) {
              this.ptrRefreshRooms.delete(roomId);
            }
          });

        // If a force-resubscription cycle was scheduled (pull-to-refresh), restore
        // all subscriptions now that the server has seen the empty-subscription
        // request.  On the next sync cycle the server will treat these as new
        // subscriptions and return initial:true with fresh data and backward-
        // pagination tokens, which the block above will then handle.
        this.restorePendingResubscriptions('request_finished');
      }

      if (err || !resp || state !== SlidingSyncState.Complete) return;

      // Track what changed in this sync cycle
      const changes: Record<string, { previous: number; current: number; delta: number }> = {};
      let totalRoomCount = 0;
      let hasChanges = false;

      this.listKeys.forEach((key) => {
        const listData = this.slidingSync.getListData(key);
        const currentCount = listData?.joinedCount ?? 0;
        const previousCount = this.previousListCounts.get(key) ?? 0;

        totalRoomCount += currentCount;

        if (currentCount !== previousCount) {
          const deltaValue = currentCount - previousCount;
          changes[key] = {
            previous: previousCount,
            current: currentCount,
            delta: deltaValue,
          };
          this.previousListCounts.set(key, currentCount);
          hasChanges = true;

          // Track batch size distribution for observability
          Sentry.metrics.distribution('sliding_sync.batch_size', Math.abs(deltaValue), {
            unit: 'none',
            attributes: { list: key, direction: deltaValue > 0 ? 'added' : 'removed' },
          });
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

      // Mark initial sync as complete after first successful cycle
      if (!this.initialSyncCompleted) {
        this.initialSyncCompleted = true;
        // Wall-clock ms from attach() — the actual user-perceived wait for first data.
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

        Sentry.metrics.distribution('sable.sync.first_list_window_rooms', this.loadedRoomIds.size, {
          attributes: { transport: 'sliding' },
        });
        this.scheduleSpaceGraphWarmup();
      }

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
      this.unsubscribeFromRoom(member.roomId, true);
    };

    this.onConnectionChange = () => {
      const isOnline = navigator.onLine;
      const wasOnline = this.lastOnlineState;
      this.lastOnlineState = isOnline;
      const connectionInfo =
        typeof navigator !== 'undefined'
          ? (navigator as unknown as { connection?: NetworkInformation }).connection
          : undefined;
      const effectiveType = connectionInfo?.effectiveType;
      const downlink = connectionInfo?.downlink;

      debugLog.info('network', `Network connectivity changed: ${isOnline ? 'online' : 'offline'}`, {
        online: isOnline,
        wasOnline,
        effectiveType,
        downlink: downlink ? `${downlink} Mbps` : undefined,
      });

      if (!isOnline) {
        debugLog.warn('network', 'Device went offline - sync paused', {
          syncNumber: this.syncCount,
        });
      } else if (!wasOnline) {
        debugLog.info('network', 'Device back online - triggering immediate resync', {
          syncNumber: this.syncCount,
        });
        this.slidingSync.resend();
      } else {
        debugLog.info('network', 'Ignored online-only network change for sliding sync', {
          syncNumber: this.syncCount,
          effectiveType,
          downlink: downlink ? `${downlink} Mbps` : undefined,
        });
      }
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
    this.attachWallClockAt = Date.now();
    this.initialSyncSpan = Sentry.startInactiveSpan({
      name: 'sync.initial',
      op: 'matrix.sync',
      attributes: { 'sync.transport': 'sliding', 'sync.proxy': this.proxyBaseUrl },
    });

    this.slidingSync.on(SlidingSyncEvent.Lifecycle, this.onLifecycle);
    this.mx.on(RoomMemberEvent.Membership, this.onMembershipLeave);
    const connection = (
      typeof navigator !== 'undefined'
        ? (navigator as unknown as { connection?: NetworkInformation }).connection
        : undefined
    ) as
      | {
          addEventListener?: (e: string, cb: () => void) => void;
          removeEventListener?: (e: string, cb: () => void) => void;
          onchange?: (() => void) | null;
        }
      | undefined;
    connection?.addEventListener?.('change', this.onConnectionChange);
    // oxlint-disable-next-line unicorn/prefer-add-event-listener
    if (connection && connection.onchange === null) connection.onchange = this.onConnectionChange;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onConnectionChange);
      window.addEventListener('offline', this.onConnectionChange);
    }
    this.healthCheckTimer = setInterval(() => this.checkSyncHealth(), HEALTH_CHECK_INTERVAL_MS);

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

    // Clean up pending room-data latency listeners before marking disposed.
    // SlidingSync.stop() will removeAllListeners anyway, but this keeps the Map tidy.
    this.pendingRoomDataListeners.clear();
    if (this.roomSubscriptionFlushTimer) {
      clearTimeout(this.roomSubscriptionFlushTimer);
      this.roomSubscriptionFlushTimer = undefined;
    }
    if (this.pendingResubscriptionRestoreTimer) {
      clearTimeout(this.pendingResubscriptionRestoreTimer);
      this.pendingResubscriptionRestoreTimer = undefined;
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    if (this.spaceGraphWarmupTimer) {
      clearTimeout(this.spaceGraphWarmupTimer);
      this.spaceGraphWarmupTimer = undefined;
    }
    this.prefetchedRoomSubscriptionTimers.forEach((timer) => clearTimeout(timer));
    this.prefetchedRoomSubscriptionTimers.clear();
    this.prefetchedRoomSubscriptions.clear();

    this.disposed = true;
    this.resolvePendingForceResetWaiters('disposed');
    // Stop the SDK's internal polling loop and abort any in-flight requests.
    this.slidingSync.stop();
    this.slidingSync.removeListener(SlidingSyncEvent.Lifecycle, this.onLifecycle);
    this.mx.removeListener(RoomMemberEvent.Membership, this.onMembershipLeave);
    const connection = (
      typeof navigator !== 'undefined'
        ? (navigator as unknown as { connection?: NetworkInformation }).connection
        : undefined
    ) as
      | {
          addEventListener?: (e: string, cb: () => void) => void;
          removeEventListener?: (e: string, cb: () => void) => void;
          onchange?: (() => void) | null;
        }
      | undefined;
    connection?.removeEventListener?.('change', this.onConnectionChange);
    // oxlint-disable-next-line unicorn/prefer-add-event-listener
    if (connection?.onchange === this.onConnectionChange) connection.onchange = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onConnectionChange);
      window.removeEventListener('offline', this.onConnectionChange);
    }

    debugLog.info('sync', 'Sliding sync disposed successfully', {
      totalSyncCycles: this.syncCount,
    });
  }

  /**
   * Abort any in-flight sliding sync request and retry immediately.
   * Safe to call at any time; if the sync is healthy the next poll just fires sooner.
   */
  public retryNow(): void {
    if (this.disposed) return;
    this.slidingSync.resend();
  }

  private checkSyncHealth(): void {
    if (this.disposed) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const now = Date.now();
    const fallbackStart = this.attachWallClockAt ?? now;
    const lastProgressAt =
      this.lastSuccessfulSyncAt > 0 ? this.lastSuccessfulSyncAt : fallbackStart;
    const staleForMs = now - lastProgressAt;
    if (staleForMs < HEALTH_STALE_AFTER_MS) return;
    if (now - this.lastHealthRetryAt < HEALTH_RETRY_COOLDOWN_MS) return;

    this.lastHealthRetryAt = now;
    debugLog.warn('sync', 'Sliding sync stale; requesting immediate retry', {
      staleForMs,
      syncNumber: this.syncCount,
    });
    Sentry.metrics.count('sable.sync.health_retry', 1, {
      attributes: { transport: 'sliding' },
    });
    this.retryNow();
  }

  private scheduleSpaceGraphWarmup(): void {
    if (this.disposed || this.spaceGraphWarmupStarted) return;
    this.spaceGraphWarmupStarted = true;
    this.spaceGraphWarmupTimer = setTimeout(
      () => this.expandSpaceGraphWarmup(),
      SPACE_GRAPH_WARMUP_INITIAL_DELAY_MS
    );
  }

  private expandSpaceGraphWarmup(): void {
    this.spaceGraphWarmupTimer = undefined;
    if (this.disposed) return;

    const listData = this.slidingSync.getListData(LIST_JOINED);
    if (!listData) {
      this.spaceGraphWarmupTimer = setTimeout(
        () => this.expandSpaceGraphWarmup(),
        SPACE_GRAPH_WARMUP_INTERVAL_MS
      );
      return;
    }

    const knownCount = listData.joinedCount ?? 0;
    if (knownCount <= 0) return;

    const currentEnd = getListEndIndex(this.slidingSync.getListParams(LIST_JOINED));
    const warmupEnd = Math.min(knownCount - 1, this.maxRooms - 1, this.spaceGraphWarmupRooms - 1);
    if (currentEnd >= warmupEnd) return;

    const nextEnd = Math.min(warmupEnd, currentEnd + this.listPageSize);
    this.requestListWindow(LIST_JOINED, nextEnd);
    Sentry.metrics.count('sable.sync.space_graph_warmup_expand', 1, {
      attributes: { transport: 'sliding' },
    });

    this.spaceGraphWarmupTimer = setTimeout(
      () => this.expandSpaceGraphWarmup(),
      SPACE_GRAPH_WARMUP_INTERVAL_MS
    );
  }

  /**
   * Force a full re-subscription for all currently active room subscriptions.
   *
   * Immediately resets the live timeline of every active room so stale or
   * out-of-order in-memory data is cleared synchronously.  Then clears all
   * room subscriptions and triggers a sync with an empty room_subscriptions
   * map.  When RequestFinished fires for that empty-subscription cycle, the
   * subscriptions are restored; the server treats them as brand-new and
   * returns initial:true with a full event window and a valid backward-
   * pagination token for each room on the following cycle.
   *
   * This recovers from stale or out-of-order in-memory timeline state that
   * cannot be fixed by a normal delta sync.  Called by pull-to-refresh.
   */
  public scheduleForceReset(): void {
    if (this.disposed) {
      this.resolvePendingForceResetWaiters('disposed');
      return;
    }
    if (this.pendingResubscriptionRestoreTimer) {
      clearTimeout(this.pendingResubscriptionRestoreTimer);
      this.pendingResubscriptionRestoreTimer = undefined;
    }
    // Save the current subscriptions before modifying anything.
    this.pendingResubscriptions = new Set(this.activeRoomSubscriptions);

    // Mark these rooms as undergoing PTR refresh so the reset logic allows
    // timeline resets even for visited rooms.
    this.ptrRefreshRooms.clear();
    this.pendingResubscriptions.forEach((roomId) => {
      this.ptrRefreshRooms.add(roomId);
      this.resetRoomTimelines(roomId, 'force_reset');
    });

    // Clear subscriptions so the next sync request carries an empty
    // room_subscriptions map.  When RequestFinished fires, the subscriptions
    // are restored; the server then treats them as brand-new and returns
    // initial:true with a full event window and a valid prev_batch token.
    // The timeline resets will happen automatically when initial:true arrives.
    this.activeRoomSubscriptions.clear();
    this.slidingSync.modifyRoomSubscriptions(new Set());
    this.slidingSync.resend();
    this.pendingResubscriptionRestoreTimer = setTimeout(() => {
      this.pendingResubscriptionRestoreTimer = undefined;
      this.restorePendingResubscriptions('timeout');
    }, FORCE_RESUBSCRIPTION_RESTORE_TIMEOUT_MS);
  }

  public waitForPendingForceReset(): Promise<'request_finished' | 'timeout' | 'disposed'> {
    if (this.disposed) return Promise.resolve('disposed');
    if (this.pendingResubscriptions === null) return Promise.resolve('request_finished');

    return new Promise((resolve) => {
      this.pendingForceResetWaiters.push(resolve);
    });
  }

  private resolvePendingForceResetWaiters(reason: 'request_finished' | 'timeout' | 'disposed') {
    if (this.pendingForceResetWaiters.length === 0) return;
    const waiters = this.pendingForceResetWaiters.splice(0);
    waiters.forEach((resolve) => resolve(reason));
  }

  private restorePendingResubscriptions(reason: 'request_finished' | 'timeout'): void {
    if (this.disposed || this.pendingResubscriptions === null) return;
    if (this.pendingResubscriptionRestoreTimer) {
      clearTimeout(this.pendingResubscriptionRestoreTimer);
      this.pendingResubscriptionRestoreTimer = undefined;
    }

    const toRestore = this.pendingResubscriptions;
    this.pendingResubscriptions = null;
    this.pendingForceResetCompletionReason = reason;
    if (reason === 'timeout') {
      this.resolvePendingForceResetWaiters('timeout');
    }
    toRestore.forEach((roomId) => this.activeRoomSubscriptions.add(roomId));
    this.slidingSync.modifyRoomSubscriptions(new Set(this.activeRoomSubscriptions));
    debugLog.info('sync', 'Restored force-reset room subscriptions', {
      reason,
      roomCount: this.activeRoomSubscriptions.size,
      syncNumber: this.syncCount,
    });
    // Explicitly trigger a sync to fetch fresh data with initial:true.
    // Without this, modifyRoomSubscriptions alone may not trigger a new
    // request if the sync loop is idle.
    this.slidingSync.resend();
  }

  private resetRoomTimelines(roomId: string, reason: string): boolean {
    const room = this.mx.getRoom(roomId);
    if (!room) return false;
    room.resetLiveTimeline();
    Sentry.metrics.count('sable.timeline.room_reset', 1, {
      attributes: { room_id: roomId, reason },
    });
    Sentry.addBreadcrumb({
      category: 'sync.timeline',
      message: 'Room timeline reset',
      level: 'warning',
      data: { roomId, reason, syncNumber: this.syncCount },
    });
    return true;
  }

  public setPresenceEnabled(enabled: boolean): void {
    this.presenceExtension.setEnabled(enabled);
  }

  /**
   * Synthesizes an own-presence update into the SDK store.
   * MSC4186 servers never echo back the client's own m.presence events, so after
   * calling mx.setPresence() we manually build a synthetic event and feed it into
   * the SDK's User object — exactly what ExtensionPresence.onResponse does for others.
   */
  public updateOwnPresence(presence: string, statusMsg: string): void {
    const userId = this.mx.getUserId();
    if (!userId) return;
    const mapper = this.mx.getEventMapper();
    const rawEvent = {
      type: 'm.presence',
      sender: userId,
      content: { presence, status_msg: statusMsg, currently_active: presence === 'online' },
    };
    const event = mapper(rawEvent as Parameters<typeof mapper>[0]);
    let user = this.mx.store.getUser(userId);
    if (user) {
      user.setPresenceEvent(event);
    } else {
      user = User.createUser(userId, this.mx);
      user.setPresenceEvent(event);
      this.mx.store.storeUser(user);
    }
    this.mx.emit(ClientEvent.Event, event);
  }

  public getDiagnostics(): SlidingSyncDiagnostics {
    const lastSuccessfulSyncAgeMs =
      this.lastSuccessfulSyncAt > 0 ? Date.now() - this.lastSuccessfulSyncAt : null;
    return {
      proxyBaseUrl: this.proxyBaseUrl,
      timelineLimit: this.roomTimelineLimit,
      listPageSize: this.listPageSize,
      lastSuccessfulSyncAgeMs,
      healthy:
        lastSuccessfulSyncAgeMs !== null &&
        lastSuccessfulSyncAgeMs < HEALTH_STALE_AFTER_MS &&
        !this.disposed,
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

  public isFullyLoaded(): boolean {
    return this.listsFullyLoaded;
  }

  /**
   * Check if we have a warm cache (existing rooms loaded from IndexedDB).
   * If true, we can show the UI while sync continues in the background.
   */
  public hasWarmCache(): boolean {
    return this.initialWarmCache;
  }

  /**
   * Check if the first requested sliding-sync list window has arrived.
   * The UI should render from server-provided positions and placeholders rather
   * than block until hundreds or all rooms have been hydrated.
   */
  public hasSufficientRoomsLoaded(): boolean {
    let sawListData = false;

    for (const key of this.listKeys) {
      const listData = this.slidingSync.getListData(key);
      if (!listData) continue;
      sawListData = true;
      const knownCount = listData.joinedCount ?? 0;
      if (knownCount <= 0) continue;

      const params = this.slidingSync.getListParams(key);
      const requestedEnd = getListEndIndex(params);
      if (requestedEnd < 0) continue;
      const requiredEnd = Math.min(knownCount, requestedEnd + 1) - 1;
      const rangeEnd = this.loadedListCoverageEnd.get(key) ?? -1;
      if (rangeEnd < requiredEnd) return false;
    }

    if (sawListData) return true;

    return this.loadedRoomIds.size > 0;
  }

  public isListReady(listKey: string): boolean {
    const listData = this.slidingSync.getListData(listKey);
    if (!listData) return false;
    const knownCount = listData.joinedCount ?? 0;
    if (knownCount <= 0) return true;

    const params = this.slidingSync.getListParams(listKey);
    const requestedEnd = getListEndIndex(params);
    if (requestedEnd < 0) return false;
    const requiredEnd = Math.min(knownCount, requestedEnd + 1) - 1;
    const rangeEnd = this.loadedListCoverageEnd.get(listKey) ?? -1;
    return rangeEnd >= requiredEnd;
  }

  /**
   * Expand a list only when the UI needs more rows. This keeps startup
   * viewport-driven while still allowing virtualized room lists to page forward
   * as the user approaches the loaded tail.
   */
  public requestListWindow(listKey: string, endIndex: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(endIndex) || endIndex < 0) return;
    const params = this.slidingSync.getListParams(listKey);
    if (!params) return;

    const knownCount = this.slidingSync.getListData(listKey)?.joinedCount ?? 0;
    const requestedEnd = Math.min(Math.round(endIndex), this.maxRooms - 1);
    const cappedEnd = knownCount > 0 ? Math.min(requestedEnd, knownCount - 1) : requestedEnd;
    const currentEnd = getListEndIndex(params);
    if (cappedEnd <= currentEnd) return;

    this.slidingSync.setListRanges(listKey, [[0, cappedEnd]]);
    Sentry.metrics.count('sable.sync.list_window_expand', 1, {
      attributes: { list: listKey, transport: 'sliding' },
    });
    debugLog.info('sync', 'Expanded sliding sync list window on demand', {
      list: listKey,
      previousEnd: currentEnd,
      newEnd: cappedEnd,
      knownCount,
      maxRooms: this.maxRooms,
    });
  }

  public getListDiagnostics(listKey: string): SlidingSyncListDiagnostics | undefined {
    const params = this.slidingSync.getListParams(listKey);
    if (!params) return undefined;
    return {
      key: listKey,
      knownCount: this.slidingSync.getListData(listKey)?.joinedCount ?? 0,
      rangeEnd: getListEndIndex(params),
    };
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
        ranges: [[0, Math.max(0, this.listPageSize - 1)]],
        sort: LIST_SORT_ORDER,
        timeline_limit: this.listTimelineLimit,
        required_state: buildListRequiredState(this.listTimelineLimit > 0),
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
    let batchCount = 0;

    await Sentry.startSpan(
      {
        name: 'sync.spidering',
        op: 'matrix.sync',
        attributes: { 'sync.transport': 'sliding' },
      },
      async (span) => {
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
          [CustomStateEvent.PoniesRoomEmotes, MSC3575_WILDCARD],
          [CustomStateEvent.RoomAbbreviations, ''],
        ];

        while (hasMore) {
          if (this.disposed) return;
          batchCount += 1;
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
            // oxlint-disable-next-line no-await-in-loop
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
        const finalCount = this.slidingSync.getListData(LIST_SEARCH)?.joinedCount ?? 0;
        span.setAttributes({
          'spidering.batches': batchCount,
          'spidering.total_rooms': finalCount,
        });
        log.log(`Sliding Sync spidering complete for ${this.mx.getUserId()}`);
      }
    );
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
    const initialSpaceRangeEnd = Math.min(
      Math.max(this.listPageSize * 2 - 1, this.listPageSize - 1),
      this.maxRooms - 1
    );
    this.ensureListRegistered(LIST_SPACE, {
      filters,
      ranges: spaceId ? [[0, initialSpaceRangeEnd]] : [[0, 0]],
      sort: LIST_SORT_ORDER,
    });
  }

  public prefetchRoom(roomId: string, ttlMs = ROOM_PREFETCH_TTL_MS): void {
    if (this.disposed || this.activeRoomSubscriptions.has(roomId)) return;

    const existingTimer = this.prefetchedRoomSubscriptionTimers.get(roomId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.prefetchedRoomSubscriptions.add(roomId);
    this.prefetchedRoomSubscriptionTimers.set(
      roomId,
      setTimeout(() => {
        this.prefetchedRoomSubscriptionTimers.delete(roomId);
        this.prefetchedRoomSubscriptions.delete(roomId);
        this.flushRoomSubscriptions();
      }, ttlMs)
    );
    this.flushRoomSubscriptions();
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
    const prefetchTimer = this.prefetchedRoomSubscriptionTimers.get(roomId);
    if (prefetchTimer) {
      clearTimeout(prefetchTimer);
      this.prefetchedRoomSubscriptionTimers.delete(roomId);
    }
    this.prefetchedRoomSubscriptions.delete(roomId);
    const refCount = this.activeRoomSubscriptionRefs.get(roomId) ?? 0;
    this.activeRoomSubscriptionRefs.set(roomId, refCount + 1);
    if (this.activeRoomSubscriptions.has(roomId)) return;
    const room = this.mx.getRoom(roomId);
    const isEncrypted = this.mx.isRoomEncrypted(roomId);

    // Mark this room as visited - timeline resets will skip visited rooms
    this.visitedRoomsThisSession.add(roomId);

    if (room && !isEncrypted) {
      // Only use the unencrypted (lazy-load) subscription when we are certain
      // the room is unencrypted.  Unknown rooms fall through to the safer
      // encrypted default.
      this.slidingSync.useCustomSubscription(roomId, UNENCRYPTED_SUBSCRIPTION_KEY);
    }
    this.activeRoomSubscriptions.add(roomId);
    this.scheduleRoomSubscriptionFlush();
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
    // One-shot listener: measure latency from subscription request to first room data.
    // Clean up any stale listener for the same roomId first.
    const existingListener = this.pendingRoomDataListeners.get(roomId);
    if (existingListener) {
      this.slidingSync.removeListener(SlidingSyncEvent.RoomData, existingListener);
    }
    const subscribeMs = performance.now();
    const onFirstRoomData = (dataRoomId: string) => {
      if (dataRoomId !== roomId) return;
      const latencyMs = Math.round(performance.now() - subscribeMs);
      // Measure how many events landed on the live timeline as part of this
      // subscription activation — this is the "page" the timeline has to absorb.
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
      completeRoomNavigation(roomId, 'subscription_data', eventCount);
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

  /**
   * Remove the explicit room subscription for a room.
   * Rooms that are still in a list will continue to receive background updates.
   * This is a no-op after dispose().
   */
  public unsubscribeFromRoom(roomId: string, force = false): void {
    if (this.disposed) return;
    this.pendingResubscriptions?.delete(roomId);
    this.ptrRefreshRooms.delete(roomId);
    const refCount = this.activeRoomSubscriptionRefs.get(roomId) ?? 0;
    if (!force && refCount > 1) {
      this.activeRoomSubscriptionRefs.set(roomId, refCount - 1);
      return;
    }
    this.activeRoomSubscriptionRefs.delete(roomId);
    if (!this.activeRoomSubscriptions.has(roomId)) return;
    // Clean up any pending first-data latency listener for this room.
    const pendingListener = this.pendingRoomDataListeners.get(roomId);
    if (pendingListener) {
      this.slidingSync.removeListener(SlidingSyncEvent.RoomData, pendingListener);
      this.pendingRoomDataListeners.delete(roomId);
    }
    this.activeRoomSubscriptions.delete(roomId);
    this.scheduleRoomSubscriptionFlush();
    Sentry.metrics.gauge('sable.sync.active_subscriptions', this.activeRoomSubscriptions.size, {
      attributes: { transport: 'sliding' },
    });
    log.log(`Sliding Sync active room subscription removed: ${roomId}`);
    debugLog.info('sync', 'Room subscription removed (sliding)', {
      remainingSubscriptions: this.activeRoomSubscriptions.size,
      syncCycle: this.syncCount,
    });
  }

  private scheduleRoomSubscriptionFlush(): void {
    if (this.disposed || this.roomSubscriptionFlushTimer) return;
    this.roomSubscriptionFlushTimer = setTimeout(() => {
      this.roomSubscriptionFlushTimer = undefined;
      this.flushRoomSubscriptions();
    }, 100);
  }

  private flushRoomSubscriptions(): void {
    if (this.disposed) return;
    const nextSubscriptions = [
      ...new Set([...this.activeRoomSubscriptions, ...this.prefetchedRoomSubscriptions]),
    ].toSorted();
    const nextKey = nextSubscriptions.join('\u0000');
    if (nextKey === this.lastFlushedRoomSubscriptionsKey) return;

    this.lastFlushedRoomSubscriptionsKey = nextKey;
    this.slidingSync.modifyRoomSubscriptions(new Set(nextSubscriptions));
  }

  public static async probe(
    mx: MatrixClient,
    proxyBaseUrl: string,
    probeTimeoutMs: number
  ): Promise<boolean> {
    return Sentry.startSpan(
      { name: 'sync.probe', op: 'matrix.sync', attributes: { 'sync.proxy': proxyBaseUrl } },
      async (span) => {
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

          const supported = typeof response.pos === 'string' && response.pos.length > 0;
          span.setAttribute('probe.supported', supported);
          return supported;
        } catch {
          span.setAttribute('probe.supported', false);
          return false;
        }
      }
    );
  }
}
