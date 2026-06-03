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
  MatrixEvent,
} from '$types/matrix-sdk';
import { createLogger } from '$utils/debug';
import { createDebugLogger } from '$utils/debugLogger';
import { getRecentRoomIds } from '$utils/recentRooms';
import * as Sentry from '@sentry/react';
import { getThreadIdFromEvent } from './threadEventPatch';

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
// Timeline limit for list rooms. Element Web uses 20 events per room which provides
// enough context for proper notification-dot computation without excessive bandwidth.
// Value 0 means state-only (no timeline events in list responses).
// Setting this above 0 triggers decryptCriticalEvents() per sync, so encrypted rooms
// with many threads/reactions may produce "Decrypted event is not in room" warnings.
// The message-preview feature can override this via ClientRoot when previews are enabled.
const DEFAULT_LIST_TIMELINE_LIMIT = 20;
const DEFAULT_LIST_PAGE_SIZE = 250;
const DEFAULT_POLL_TIMEOUT_MS = 20000;
const DEFAULT_MAX_ROOMS = 5000;

// ---------------------------------------------------------------------------
// Strategy 3: Sliding Sync List State Caching
// ---------------------------------------------------------------------------

const SLIDING_SYNC_LIST_CACHE_KEY = 'slidingSyncListCache';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

type CachedListState = {
  timestamp: number;
  userId: string;
  lists: Array<{
    key: string;
    count: number;
  }>;
};

function getCachedListState(userId: string): CachedListState | null {
  try {
    const cached = localStorage.getItem(SLIDING_SYNC_LIST_CACHE_KEY);
    if (!cached) return null;

    const state: CachedListState = JSON.parse(cached);

    // Validate userId matches
    if (state.userId !== userId) return null;

    // Validate age (< 24h old)
    if (Date.now() - state.timestamp > CACHE_MAX_AGE_MS) return null;

    return state;
  } catch {
    return null;
  }
}

function setCachedListState(state: CachedListState): void {
  try {
    localStorage.setItem(SLIDING_SYNC_LIST_CACHE_KEY, JSON.stringify(state));
  } catch {
    // Ignore — localStorage may be full or unavailable
  }
}

// ---------------------------------------------------------------------------

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

// Minimal required_state for list entries; enough to render the room list sidebar,
// compute unread state, and build the space hierarchy without fetching full room history.
// Notes:
//   - RoomName/RoomCanonicalAlias are omitted: sliding sync returns the room name as a
//     top-level field in every list response, so fetching them as state events is redundant.
//   - MSC3575_STATE_KEY_LAZY is included only when `includeMembers=true` (i.e. when
//     message previews are enabled and listTimelineLimit > 0). Lazy loading brings in
//     m.room.member state events for senders of the preview timeline events so that
//     display names resolve correctly. When previews are disabled, lazy loading is
//     omitted to avoid wasteful member fetches for every list entry.
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
  ...(includeMembers ? [[EventType.RoomMember, MSC3575_STATE_KEY_LAZY] as [string, string]] : []),
  ['m.space.child', MSC3575_WILDCARD],
  ['im.ponies.room_emotes', MSC3575_WILDCARD],
  ['moe.sable.room.abbreviations', ''],
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
  listTimelineLimit: number,
  cachedRoomCount: number = 0
): Map<string, MSC3575List> => {
  const lists = new Map<string, MSC3575List>();
  const listRequiredState = buildListRequiredState(listTimelineLimit > 0);

  // Strategy 5: Adaptive initial range based on cached room count.
  // Start with enough to cover cached rooms, or at least 100.
  // This ensures we fetch at least all cached rooms in the first sync response.
  const initialRange = Math.min(pageSize, Math.max(100, cachedRoomCount));

  lists.set(LIST_JOINED, {
    ranges: [[0, Math.max(0, initialRange - 1)]],
    sort: LIST_SORT_ORDER,
    timeline_limit: listTimelineLimit,
    required_state: listRequiredState,
    slow_get_all_rooms: true,
    filters: { is_invite: false },
  });

  if (includeInviteList) {
    lists.set(LIST_INVITES, {
      ranges: [[0, Math.max(0, initialRange - 1)]],
      sort: LIST_SORT_ORDER,
      timeline_limit: listTimelineLimit,
      required_state: listRequiredState,
      slow_get_all_rooms: true,
      filters: { is_invite: true },
    });
  }

  lists.set(LIST_DMS, {
    ranges: [[0, Math.max(0, initialRange - 1)]],
    sort: LIST_SORT_ORDER,
    timeline_limit: listTimelineLimit,
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

  private readonly listKeys: string[];

  private readonly activeRoomSubscriptions = new Set<string>();

  /** Rooms that have been actively opened/viewed in this session. Never reset these. */
  private readonly visitedRoomsThisSession = new Set<string>();

  /** Rooms currently in a PTR refresh cycle - allow resets for these. */
  private readonly ptrRefreshRooms = new Set<string>();

  private readonly listPageSize: number;

  private readonly listTimelineLimit: number;

  private readonly roomTimelineLimit: number;

  private readonly onConnectionChange: () => void;

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

  /** Whether progressive prefetch is enabled (controlled by experimental setting). */
  private progressivePrefetchEnabled = false;

  /** Timer ID for progressive prefetch batches. */
  private progressivePrefetchTimer: ReturnType<typeof setTimeout> | null = null;

  /** Current offset in the recentRoomIds array for progressive prefetch. */
  private progressivePrefetchOffset = 0;

  /**
   * When non-null, contains the set of room IDs that were active subscriptions
   * before a force-reset was scheduled (pull-to-refresh). The rooms are
   * temporarily cleared from activeRoomSubscriptions so the server processes
   * one empty-subscription cycle, and then restored here so the server treats
   * them as fresh subscriptions and returns initial:true with full data and
   * backward-pagination tokens.
   */
  private pendingResubscriptions: Set<string> | null = null;

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
    this.listTimelineLimit = clampPositive(config.listTimelineLimit, DEFAULT_LIST_TIMELINE_LIMIT);

    const roomTimelineLimit = clampPositive(config.timelineLimit, ACTIVE_ROOM_TIMELINE_LIMIT);
    this.roomTimelineLimit = roomTimelineLimit;

    const defaultSubscription = buildEncryptedSubscription(roomTimelineLimit);
    const cachedRoomCount = mx.getRooms().length;
    const lists = buildLists(
      listPageSize,
      includeInviteList,
      this.listTimelineLimit,
      cachedRoomCount
    );
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
        const isCryptoStoreError =
          errorMsg.includes('without an in-progress transaction') ||
          errorMsg.includes('database connection is closed') ||
          errorMsg.includes('InvalidStateError') ||
          errorMsg.includes('UnknownError');

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
              error_type: errorMsg.includes('transaction')
                ? 'transaction_error'
                : errorMsg.includes('closed')
                  ? 'connection_closed'
                  : 'unknown_idb_error',
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
        const rooms = (resp as MSC3575SlidingSyncResponse).rooms ?? {};
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
            timelineSet.resetLiveTimeline();

            // If this was a PTR refresh, remove from the set now that reset is complete
            if (isPTRMode) {
              this.ptrRefreshRooms.delete(roomId);
            }
          });

        // Process timeline events with thread support before SDK's default handler runs.
        // The SDK's addEventToTimeline rejects events with threadId=undefined (by design),
        // causing thread reply events to be silently dropped. We intercept here to extract
        // threadId from m.relates_to and route events to the correct timeline set.
        Object.entries(rooms).forEach(([roomId, roomData]) => {
          const room = this.mx.getRoom(roomId);
          if (!room) return;

          const rawEvents = roomData.timeline ?? [];
          if (rawEvents.length === 0) return;

          let threadEventsProcessed = 0;
          let rootEventsProcessed = 0;
          let threadEventsDropped = 0;

          // Process each event and route to the correct timeline set based on threadId
          for (const rawEvent of rawEvents) {
            // Create MatrixEvent from raw server payload
            const event = new MatrixEvent(rawEvent);
            const threadId = getThreadIdFromEvent(event);

            // Track dropped thread events where threadId resolution failed
            const relatesTo = event.getContent()?.['m.relates_to'];
            if (!threadId && relatesTo?.rel_type === 'm.thread') {
              threadEventsDropped += 1;
              Sentry.metrics.count('sable.timeline.thread_event_dropped', 1, {
                attributes: {
                  room_id: roomId,
                  reason: 'threadId_undefined',
                  encrypted: String(event.getType() === 'm.room.encrypted'),
                },
              });
              console.warn('[SlidingSync] Thread event dropped — threadId unresolvable', {
                eventId: event.getId(),
                roomId,
                relatesTo,
              });
              // Skip this event — cannot route to timeline without threadId
              continue;
            }

            // Get the appropriate timeline set (thread-specific or root)
            let timelineSet;
            if (threadId) {
              const thread = room.getThread(threadId);
              if (!thread) {
                // Thread doesn't exist yet - track and skip
                threadEventsDropped += 1;
                Sentry.metrics.count('sable.timeline.thread_event_dropped', 1, {
                  attributes: {
                    room_id: roomId,
                    reason: 'thread_not_found',
                    encrypted: String(event.getType() === 'm.room.encrypted'),
                  },
                });
                console.warn('[SlidingSync] Thread event dropped — thread not found', {
                  eventId: event.getId(),
                  roomId,
                  threadId,
                  relatesTo,
                });
                continue;
              }
              timelineSet = thread.timelineSet;
            } else {
              timelineSet = room.getUnfilteredTimelineSet();
            }

            const timeline = timelineSet.getLiveTimeline();

            // Add event to the correct timeline with threadId parameter
            timelineSet.addEventToTimeline(event, timeline, {
              toStartOfTimeline: false,
              addToState: true,
              ...(threadId && { threadId }),
            });

            if (threadId) {
              threadEventsProcessed += 1;
            } else {
              rootEventsProcessed += 1;
            }
          }

          // Clear the timeline array so SDK doesn't try to re-add these events
          roomData.timeline = [];

          if (threadEventsProcessed > 0 || threadEventsDropped > 0) {
            debugLog.info('sync', 'Processed thread events with threadId routing', {
              roomId,
              threadEvents: threadEventsProcessed,
              rootEvents: rootEventsProcessed,
              droppedEvents: threadEventsDropped,
              syncCycle: this.syncCount,
            });
            Sentry.addBreadcrumb({
              category: 'sync.threadEvents',
              message: 'Thread events routed to correct timeline sets',
              level: threadEventsDropped > 0 ? 'warning' : 'info',
              data: {
                roomId,
                threadEvents: threadEventsProcessed,
                rootEvents: rootEventsProcessed,
                droppedEvents: threadEventsDropped,
              },
            });

            // Report per-sync thread drop count
            if (threadEventsDropped > 0) {
              Sentry.metrics.distribution(
                'sable.timeline.thread_drops_per_sync',
                threadEventsDropped,
                { attributes: { room_id: roomId } }
              );
            }
          }
        });

        // If a force-resubscription cycle was scheduled (pull-to-refresh), restore
        // all subscriptions now that the server has seen the empty-subscription
        // request.  On the next sync cycle the server will treat these as new
        // subscriptions and return initial:true with fresh data and backward-
        // pagination tokens, which the block above will then handle.
        if (this.pendingResubscriptions !== null) {
          const toRestore = this.pendingResubscriptions;
          this.pendingResubscriptions = null;
          toRestore.forEach((roomId) => this.activeRoomSubscriptions.add(roomId));
          this.slidingSync.modifyRoomSubscriptions(new Set(this.activeRoomSubscriptions));
          // Explicitly trigger a sync to fetch fresh data with initial:true.
          // Without this, modifyRoomSubscriptions alone may not trigger a new
          // request if the sync loop is idle.
          this.slidingSync.resend();
        }
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

        // Prefetch recently-visited rooms to warm the cache for likely next navigations
        this.prefetchRecentRooms();
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

    this.onConnectionChange = () => {
      const isOnline = navigator.onLine;
      const connectionInfo =
        typeof navigator !== 'undefined'
          ? (navigator as unknown as { connection?: NetworkInformation }).connection
          : undefined;
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
        debugLog.info('network', 'Device back online - triggering immediate resync', {
          syncNumber: this.syncCount,
        });
        this.slidingSync.resend();
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

    // Clean up progressive prefetch timer
    if (this.progressivePrefetchTimer) {
      clearTimeout(this.progressivePrefetchTimer);
      this.progressivePrefetchTimer = null;
    }

    // Clean up pending room-data latency listeners before marking disposed.
    // SlidingSync.stop() will removeAllListeners anyway, but this keeps the Map tidy.
    this.pendingRoomDataListeners.clear();

    this.disposed = true;
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
    if (this.disposed) return;
    // Save the current subscriptions before modifying anything.
    this.pendingResubscriptions = new Set(this.activeRoomSubscriptions);

    // Mark these rooms as undergoing PTR refresh so the reset logic allows
    // timeline resets even for visited rooms.
    this.ptrRefreshRooms.clear();
    this.pendingResubscriptions.forEach((roomId) => this.ptrRefreshRooms.add(roomId));

    // Clear subscriptions so the next sync request carries an empty
    // room_subscriptions map.  When RequestFinished fires, the subscriptions
    // are restored; the server then treats them as brand-new and returns
    // initial:true with a full event window and a valid prev_batch token.
    // The timeline resets will happen automatically when initial:true arrives.
    this.activeRoomSubscriptions.clear();
    this.slidingSync.modifyRoomSubscriptions(new Set());
    this.slidingSync.resend();
  }

  public setPresenceEnabled(enabled: boolean): void {
    this.presenceExtension.setEnabled(enabled);
  }

  /**
   * Enable or disable progressive prefetch. When enabled, after the initial
   * batch of 25 rooms is prefetched, additional rooms are loaded in the
   * background in batches of 25 until all rooms are subscribed.
   */
  public setProgressivePrefetch(enabled: boolean): void {
    if (this.progressivePrefetchEnabled === enabled) return;
    this.progressivePrefetchEnabled = enabled;
    debugLog.info('sync', `Progressive prefetch ${enabled ? 'enabled' : 'disabled'}`);
    Sentry.addBreadcrumb({
      category: 'sync',
      message: `Progressive prefetch ${enabled ? 'enabled' : 'disabled'}`,
      level: 'info',
      data: { enabled, initialSyncCompleted: this.initialSyncCompleted },
    });

    // If disabling, cancel any pending prefetch
    if (!enabled && this.progressivePrefetchTimer) {
      clearTimeout(this.progressivePrefetchTimer);
      this.progressivePrefetchTimer = null;
      this.progressivePrefetchOffset = 0;
    }

    // If enabling and we already completed initial sync, start prefetch
    if (enabled && this.initialSyncCompleted) {
      this.scheduleNextProgressivePrefetch();
    }
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

  public isFullyLoaded(): boolean {
    return this.listsFullyLoaded;
  }

  /**
   * Check if we have a warm cache (existing rooms loaded from IndexedDB).
   * If true, we can show the UI immediately while sync continues in background.
   */
  public hasWarmCache(): boolean {
    return this.mx.getRooms().length > 0;
  }

  /**
   * Strategy 8: Check if we've loaded "sufficient" rooms to show the UI,
   * even if not all lists are fully loaded. This improves perceived performance
   * for users with many rooms by not blocking on loading ALL rooms.
   */
  public hasSufficientRoomsLoaded(): boolean {
    if (this.listsFullyLoaded) return true;

    const cachedRoomCount = this.mx.getRooms().length;
    // Target: load at least 200 rooms, or match cached count (up to 500)
    // This ensures most users see their recent rooms immediately
    const targetCount = Math.max(200, Math.min(cachedRoomCount, 500));

    let loadedCount = 0;
    for (const key of this.listKeys) {
      const params = this.slidingSync.getListParams(key);
      const rangeEnd = getListEndIndex(params);
      loadedCount += rangeEnd + 1; // +1 because range is 0-indexed
    }

    return loadedCount >= targetCount;
  }

  /**
   * Strategy 3: Get cached list state from previous session if available.
   * Returns null if no cache exists, cache is stale, or userId doesn't match.
   * UI can use this to optimistically render room order while sync loads fresh data.
   */
  public getCachedListState(): CachedListState | null {
    const userId = this.mx.getUserId();
    if (!userId) return null;
    return getCachedListState(userId);
  }

  private expandListsToKnownCount(): void {
    // Stop expanding once we've loaded all rooms - prevents continuous updates
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

      // Strategy 3: Cache list state to localStorage for faster next launch
      const listStateToCache: CachedListState = {
        timestamp: Date.now(),
        userId: this.mx.getUserId() ?? '',
        lists: this.listKeys.map((key) => ({
          key,
          count: this.slidingSync.getListData(key)?.joinedCount ?? 0,
        })),
      };
      setCachedListState(listStateToCache);
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
          ['im.ponies.room_emotes', MSC3575_WILDCARD],
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
   * Prefetch recently-visited rooms by subscribing to them in a single batched
   * call to modifyRoomSubscriptions.
   *
   * IMPORTANT: This only subscribes to rooms that ALREADY EXIST in the client
   * (from IndexedDB cache or initial sync response). It does not load/fetch new
   * rooms. On warm cache launches, all cached rooms load from IndexedDB instantly,
   * then this method subscribes to them to request fresh timeline content.
   *
   * Progressive prefetch (if enabled) continues subscribing to additional cached
   * rooms in batches of 25 every 3 seconds, spreading server load and avoiding
   * overwhelming the connection with hundreds of simultaneous subscriptions.
   *
   * The "all rooms visible, then content loads, then sort" behavior on warm cache
   * is CORRECT: rooms appear from cache instantly → progressive prefetch subscribes
   * in batches → fresh content arrives → rooms re-sort by priority.
   *
   * Calling subscribeToRoom() per room would trigger a modifyRoomSubscriptions +
   * resend() for each room individually (N+1 resend calls), whereas this method
   * collects all rooms first and issues one call, keeping startup sync churn low.
   */
  public prefetchRecentRooms(): void {
    if (this.disposed) return;
    const userId = this.mx.getUserId();
    if (!userId) return;

    const recentRoomIds = getRecentRoomIds(userId);
    const toPrefetch = recentRoomIds.slice(0, 25); // Top 25 most recent

    if (toPrefetch.length === 0) return;

    debugLog.info('sync', 'Prefetching recent rooms', {
      count: toPrefetch.length,
      roomIds: toPrefetch,
    });

    // Phase 1: batch — add all rooms to activeRoomSubscriptions and set custom
    // subscriptions, but defer modifyRoomSubscriptions until all are registered.
    const toSubscribe: string[] = [];
    for (const roomId of toPrefetch) {
      const room = this.mx.getRoom(roomId);
      if (!room || this.activeRoomSubscriptions.has(roomId)) continue;
      const isEncrypted = this.mx.isRoomEncrypted(roomId);
      if (!isEncrypted) {
        this.slidingSync.useCustomSubscription(roomId, UNENCRYPTED_SUBSCRIPTION_KEY);
      }
      this.activeRoomSubscriptions.add(roomId);
      toSubscribe.push(roomId);
    }

    if (toSubscribe.length === 0) return;

    // Phase 2: single modifyRoomSubscriptions covers all rooms at once.
    this.slidingSync.modifyRoomSubscriptions(new Set(this.activeRoomSubscriptions));
    Sentry.metrics.gauge('sable.sync.active_subscriptions', this.activeRoomSubscriptions.size, {
      attributes: { transport: 'sliding' },
    });
    debugLog.info('sync', 'Batch-subscribed recent rooms (prefetch)', {
      count: toSubscribe.length,
      roomIds: toSubscribe,
      activeSubscriptions: this.activeRoomSubscriptions.size,
      syncCycle: this.syncCount,
    });

    // Phase 3: register one-shot latency listeners per room (no modifyRoomSubscriptions needed).
    const subscribeMs = performance.now();
    for (const roomId of toSubscribe) {
      const existingListener = this.pendingRoomDataListeners.get(roomId);
      if (existingListener) {
        this.slidingSync.removeListener(SlidingSyncEvent.RoomData, existingListener);
      }
      const onFirstRoomData = (dataRoomId: string) => {
        if (dataRoomId !== roomId) return;
        const latencyMs = Math.round(performance.now() - subscribeMs);
        const subscribedRoom = this.mx.getRoom(roomId);
        const eventCount = subscribedRoom?.getLiveTimeline().getEvents().length ?? 0;
        debugLog.info('sync', 'Room subscription: first data received (sliding prefetch)', {
          latencyMs,
          syncCycle: this.syncCount,
          eventCount,
        });
        Sentry.metrics.distribution('sable.sync.room_sub_latency_ms', latencyMs, {
          attributes: { transport: 'sliding' },
        });
        this.slidingSync.removeListener(SlidingSyncEvent.RoomData, onFirstRoomData);
        this.pendingRoomDataListeners.delete(roomId);
      };
      this.pendingRoomDataListeners.set(roomId, onFirstRoomData);
      this.slidingSync.on(SlidingSyncEvent.RoomData, onFirstRoomData);
    }

    // Set offset for progressive prefetch to start after initial batch
    this.progressivePrefetchOffset = 25;

    // If progressive prefetch is enabled, schedule the next batch
    if (this.progressivePrefetchEnabled) {
      debugLog.info('sync', 'Scheduling progressive prefetch after initial batch');
      Sentry.addBreadcrumb({
        category: 'sync',
        message: 'Scheduling progressive prefetch',
        level: 'info',
        data: {
          initialBatchSize: toSubscribe.length,
          nextOffset: 25,
          totalRecentRooms: recentRoomIds.length,
        },
      });
      this.scheduleNextProgressivePrefetch();
    } else {
      debugLog.info('sync', 'Progressive prefetch disabled, not scheduling next batch');
      Sentry.addBreadcrumb({
        category: 'sync',
        message: 'Progressive prefetch disabled',
        level: 'info',
      });
    }
  }

  /**
   * Schedule the next batch of progressive prefetch. Loads rooms in batches
   * of 25 with a 3-second delay between batches to avoid overwhelming the
   * server and client. Continues until all rooms are subscribed or maxRooms
   * is reached.
   */
  private scheduleNextProgressivePrefetch(): void {
    if (this.disposed || !this.progressivePrefetchEnabled) return;

    // Cancel any existing timer
    if (this.progressivePrefetchTimer) {
      clearTimeout(this.progressivePrefetchTimer);
      this.progressivePrefetchTimer = null;
    }

    const userId = this.mx.getUserId();
    if (!userId) return;

    const recentRoomIds = getRecentRoomIds(userId);
    const batchSize = 25;
    const nextBatch = recentRoomIds.slice(
      this.progressivePrefetchOffset,
      this.progressivePrefetchOffset + batchSize
    );

    if (nextBatch.length === 0) {
      debugLog.info('sync', 'Progressive prefetch complete', {
        totalPrefetched: this.progressivePrefetchOffset,
      });
      Sentry.addBreadcrumb({
        category: 'sync',
        message: 'Progressive prefetch complete',
        level: 'info',
        data: { totalPrefetched: this.progressivePrefetchOffset },
      });
      return;
    }

    // Schedule next batch after 3 seconds
    this.progressivePrefetchTimer = setTimeout(() => {
      if (this.disposed || !this.progressivePrefetchEnabled) return;

      debugLog.info('sync', 'Progressive prefetch batch', {
        offset: this.progressivePrefetchOffset,
        count: nextBatch.length,
      });
      Sentry.addBreadcrumb({
        category: 'sync',
        message: 'Progressive prefetch batch starting',
        level: 'info',
        data: {
          offset: this.progressivePrefetchOffset,
          count: nextBatch.length,
          totalRecentRooms: recentRoomIds.length,
        },
      });

      const toSubscribe: string[] = [];
      for (const roomId of nextBatch) {
        const room = this.mx.getRoom(roomId);
        if (!room || this.activeRoomSubscriptions.has(roomId)) continue;
        const isEncrypted = this.mx.isRoomEncrypted(roomId);
        if (!isEncrypted) {
          this.slidingSync.useCustomSubscription(roomId, UNENCRYPTED_SUBSCRIPTION_KEY);
        }
        this.activeRoomSubscriptions.add(roomId);
        toSubscribe.push(roomId);
      }

      if (toSubscribe.length > 0) {
        this.slidingSync.modifyRoomSubscriptions(new Set(this.activeRoomSubscriptions));
        Sentry.metrics.gauge('sable.sync.active_subscriptions', this.activeRoomSubscriptions.size, {
          attributes: { transport: 'sliding' },
        });
        debugLog.info('sync', 'Batch-subscribed progressive prefetch rooms', {
          count: toSubscribe.length,
          activeSubscriptions: this.activeRoomSubscriptions.size,
          offset: this.progressivePrefetchOffset,
        });
      }

      // Move offset forward
      this.progressivePrefetchOffset += batchSize;

      // Schedule next batch if progressive prefetch is still enabled
      if (this.progressivePrefetchEnabled) {
        this.scheduleNextProgressivePrefetch();
      }
    }, 3000); // 3 second delay between batches
  }

  /**
   * Remove the explicit room subscription for a room.
   * Rooms that are still in a list will continue to receive background updates.
   * This is a no-op after dispose().
   */
  public unsubscribeFromRoom(roomId: string): void {
    if (this.disposed) return;
    // Clean up any pending first-data latency listener for this room.
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
