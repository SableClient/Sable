import type {
  IRoomEvent,
  IStateEvent,
  MatrixClient,
  MSC3575List,
  MSC3575RoomData,
  MSC3575RoomSubscription,
  MSC3575SlidingSyncResponse,
  Room,
  EventTimelineSet,
} from '$types/matrix-sdk';
import {
  EventStatus,
  KnownMembership,
  MatrixEvent,
  MSC3575_WILDCARD,
  RoomMemberEvent,
  SlidingSync,
  SlidingSyncEvent,
  SlidingSyncState,
  MSC3575_STATE_KEY_LAZY,
  MSC3575_STATE_KEY_ME,
  EventType,
  EventTimeline,
  EventEmitterEvents,
  ClientEvent,
  RoomEvent,
  UNSTABLE_ELEMENT_FUNCTIONAL_USERS,
} from '$types/matrix-sdk';
import { createLogger } from '$utils/debug';
import { createDebugLogger } from '$utils/debugLogger';
import { CustomStateEvent } from '$types/matrix/room';
import * as Sentry from '@sentry/react';
import { SlidingSyncSidebarCache } from './slidingSyncSidebarCache';

const log = createLogger('slidingSync');
const debugLog = createDebugLogger('slidingSync');

const LIST_JOINED = 'joined';
const LIST_INVITES = 'invites';
const LIST_TIMELINE_LIMIT = 1;

// MSC4186 room_subscriptions maximum.
const MAX_ROOM_SUBSCRIPTIONS = 100;

const LIST_PAGE_SIZE = 30;
const DEFAULT_POLL_TIMEOUT_MS = 45000;
// Mirrors the js-sdk's own BUFFER_PERIOD_MS so our watchdog sits after its `clientTimeout`.
const SDK_CLIENT_TIMEOUT_BUFFER_MS = 10_000;
const POLL_DEADLINE_MARGIN_MS = 20_000;

// The SDK's to_device extension takes 100 events per response, so a backlog needs several.
const MAX_PUSH_DRAIN_POLLS = 5;

const ACTIVE_ROOM_SUBSCRIPTION_KEY = 'active_room';
const CALL_ROOM_SUBSCRIPTION_KEY = 'call_room';
const SIDEBAR_ROOM_SUBSCRIPTION_KEY = 'sidebar_room';
const SPACE_SUBSCRIPTION_KEY = 'space';
const IMAGE_PACK_SUBSCRIPTION_KEY = 'image_packs';
const SPACE_IMAGE_PACK_SUBSCRIPTION_KEY = 'space_image_packs';
const ACTIVE_ROOM_TIMELINE_LIMIT = 50;
const ROUTE_ADOPTION_TIMEOUT_MS = 30_000;
const OPTIMISTIC_JOIN_MAX_SYNC_CYCLES = 10;
const OPTIMISTIC_JOIN_VERIFY_AFTER_CYCLES = 3;

type OptimisticJoin = {
  joinedAtSyncCount: number;
  lastSeenSyncCount: number;
  verificationRequested: boolean;
};

export type PartialSlidingSyncRequest = {
  filters?: MSC3575List['filters'];
  ranges?: [number, number][];
};

type SlidingSyncOptions = {
  timelineLimit?: number;
  pollTimeoutMs?: number;
  initialRoomIds?: Iterable<string>;
};

type RoomScopedExtensionResponse = {
  rooms?: Record<string, unknown>;
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

export type HydrationProgress = { loadedRooms: number; totalRooms: number };

export type CallRoomSubscription = () => void;

const clampPositive = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return fallback;
  return Math.round(value);
};

type SlidingSyncEventLike = IStateEvent | IRoomEvent;

const isSelfMemberEvent = (event: SlidingSyncEventLike, userId: string): boolean =>
  event.type === (EventType.RoomMember as string) &&
  'state_key' in event &&
  event.state_key === userId;

// Scans backwards so the newest wins in a timeline that still holds the
// previous membership.
const findSelfMemberEvent = <T extends SlidingSyncEventLike>(
  events: readonly T[],
  userId: string
): T | undefined => {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event && isSelfMemberEvent(event, userId)) return event;
  }
  return undefined;
};

const membershipOf = (event: SlidingSyncEventLike | undefined): string | undefined => {
  const content = event?.content;
  return content && typeof content === 'object'
    ? ((content as { membership?: unknown }).membership as string | undefined)
    : undefined;
};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

// "~" is the SDK's local-echo event id prefix (see MatrixClient.sendEvent).
const buildSelfJoinEvent = (
  roomId: string,
  userId: string,
  previousContent: unknown
): IStateEvent & { room_id: string } => {
  // Only the profile carries over; is_direct and third_party_invite are invite-only.
  const previous = (previousContent ?? {}) as { displayname?: unknown; avatar_url?: unknown };

  return {
    type: EventType.RoomMember,
    state_key: userId,
    room_id: roomId,
    sender: userId,
    event_id: `~sable-self-join:${roomId}`,
    origin_server_ts: Date.now(),
    content: {
      membership: KnownMembership.Join,
      displayname: asString(previous.displayname),
      avatar_url: asString(previous.avatar_url),
    },
  };
};

const buildListRequiredState = (): MSC3575RoomSubscription['required_state'] => [
  [EventType.RoomAvatar, ''],
  [EventType.RoomTombstone, ''],
  [EventType.RoomEncryption, ''],
  [EventType.RoomCreate, ''],
  [EventType.RoomName, ''],
  [EventType.RoomCanonicalAlias, ''],
  [EventType.RoomJoinRules, ''],
  [EventType.RoomMember, MSC3575_STATE_KEY_ME],
  [EventType.GroupCallPrefix, ''],
  [EventType.GroupCallMemberPrefix, MSC3575_WILDCARD],
  // Feeds functional-member filtering for bridged DM names/avatars.
  [UNSTABLE_ELEMENT_FUNCTIONAL_USERS.name, ''],
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
  [EventType.SpaceChild, MSC3575_WILDCARD],
  [EventType.SpaceParent, MSC3575_WILDCARD],
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
  [EventType.SpaceChild, MSC3575_WILDCARD],
  [EventType.SpaceParent, MSC3575_WILDCARD],
  [EventType.GroupCallPrefix, ''],
  [EventType.GroupCallMemberPrefix, MSC3575_WILDCARD],
  [UNSTABLE_ELEMENT_FUNCTIONAL_USERS.name, ''],
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

const buildCallRoomSubscription = (timelineLimit: number): MSC3575RoomSubscription => ({
  timeline_limit: timelineLimit,
  // MatrixRTC ignores memberships for users that are absent from the room
  // roster. Unlike a timeline, calls need every membership continuously.
  required_state: [...ACTIVE_ROOM_REQUIRED_STATE, [EventType.RoomMember, MSC3575_WILDCARD]],
});

const IMAGE_PACK_REQUIRED_STATE: MSC3575RoomSubscription['required_state'] = [
  [CustomStateEvent.ImagePack, MSC3575_WILDCARD],
  [CustomStateEvent.PoniesRoomEmotes, MSC3575_WILDCARD],
];

const buildImagePackSubscription = (): MSC3575RoomSubscription => ({
  timeline_limit: 0,
  required_state: IMAGE_PACK_REQUIRED_STATE,
});

// Pack rooms that are also spaces need both state sets; room subscriptions
// use exactly one named key, so register the union as its own subscription.
const buildSpaceImagePackSubscription = (): MSC3575RoomSubscription => ({
  timeline_limit: 0,
  required_state: [...SPACE_REQUIRED_STATE, ...IMAGE_PACK_REQUIRED_STATE],
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
    timeline_limit: LIST_TIMELINE_LIMIT,
    required_state: listRequiredState,
    filters: { is_invite: false },
  });

  lists.set(LIST_INVITES, {
    ranges: [[0, LIST_PAGE_SIZE - 1]],
    timeline_limit: LIST_TIMELINE_LIMIT,
    required_state: listRequiredState,
    filters: { is_invite: true },
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

// Receipts stay unscoped on purpose: they drive unread state for every room in
// the sidebar, and a room that never receives one reads as permanently unread.
export const scopeTypingExtension = (
  extensions: object | undefined,
  roomIds: readonly string[]
): void => {
  if (!extensions) return;

  const typing = (extensions as Record<string, unknown>).typing;
  if (!typing || typeof typing !== 'object') return;

  const scopedTyping = typing as RoomScopedExtension;
  scopedTyping.lists = [];
  scopedTyping.rooms = [...roomIds];
};

type SlidingSyncTimelineRoomData = MSC3575RoomData & {
  expanded_timeline?: boolean;
  unstable_expanded_timeline?: boolean;
};

type PreparedRoomSubscription = {
  afterRequestId: number;
  requiresSubscriptionResponse: boolean;
  listener: () => void;
};

type TrackedSlidingSyncResponse = {
  requestId: number;
  subscriptionRoomIds: ReadonlySet<string>;
};

type TimelineResetCompletion = () => void;

export const prepareSlidingSyncTimelines = (
  resp: MSC3575SlidingSyncResponse | null,
  mx?: MatrixClient,
  subscribedRoomIds?: ReadonlySet<string>
): TimelineResetCompletion | null => {
  if (!resp?.rooms) return null;
  let didResetTimeline = false;
  const pendingEventsToRestore: Array<{
    timelineSet: EventTimelineSet;
    events: MatrixEvent[];
  }> = [];

  for (const [roomId, roomData] of Object.entries(resp.rooms)) {
    const timelineData = roomData as SlidingSyncTimelineRoomData;
    const serverReportedLimited = timelineData.limited === true;
    const hasExpandedFlag =
      timelineData.expanded_timeline === true || timelineData.unstable_expanded_timeline === true;
    const numLive = timelineData.num_live;
    const timeline = Array.isArray(timelineData.timeline) ? timelineData.timeline : [];
    const timelineLength = timeline.length;
    const room = mx?.getRoom(roomId);
    const timelineSet = room?.getUnfilteredTimelineSet();
    const liveTimeline = room?.getLiveTimeline();
    const liveEvents = liveTimeline?.getEvents() ?? [];
    if (serverReportedLimited && room) {
      void room.clearLoadedMembersIfNeeded().catch((error: unknown) => {
        debugLog.warn('sync', 'Failed to flush lazily loaded members after a gap', {
          roomId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    const liveEventIds: string[] = [];
    for (const event of liveEvents) {
      const eventId = event.getId();
      if (eventId) liveEventIds.push(eventId);
    }
    const knownEventIds = new Set(liveEventIds);
    const hasHistoricalEvents =
      timelineData.initial !== true &&
      typeof numLive === 'number' &&
      Number.isInteger(numLive) &&
      numLive >= 0 &&
      numLive < timelineLength;
    let hasHistoricalOverlap = false;
    if (!hasExpandedFlag && !hasHistoricalEvents && timelineData.initial !== true) {
      let sawUnknownEvent = false;
      hasHistoricalOverlap = timeline.some((event) => {
        const eventId = event.event_id;
        if (typeof eventId !== 'string') return false;
        if (knownEventIds.has(eventId)) return sawUnknownEvent;
        sawUnknownEvent = true;
        return false;
      });
    }

    const responseEventIds = timeline
      .map((event) => event.event_id)
      .filter((eventId): eventId is string => typeof eventId === 'string');
    const firstKnownResponseIndex = responseEventIds.findIndex((eventId) =>
      knownEventIds.has(eventId)
    );
    const firstKnownLiveIndex =
      firstKnownResponseIndex < 0
        ? -1
        : liveEventIds.indexOf(responseEventIds[firstKnownResponseIndex]!);
    const hasSparseOverlap = firstKnownResponseIndex > 0 && firstKnownLiveIndex > 0;

    const isRequestedExpansion =
      subscribedRoomIds?.has(roomId) === true &&
      knownEventIds.size > 0 &&
      firstKnownResponseIndex < 0;

    const shouldMarkLimited =
      timelineLength > 0 &&
      (hasExpandedFlag || hasHistoricalEvents || hasHistoricalOverlap || isRequestedExpansion);

    if (shouldMarkLimited) timelineData.limited = true;

    const isGapped = firstKnownResponseIndex < 0 || hasSparseOverlap;
    if (
      knownEventIds.size > 0 &&
      room &&
      timelineSet &&
      isGapped &&
      responseEventIds.length > 0 &&
      typeof timelineData.prev_batch === 'string' &&
      (timelineData.initial === true || timelineData.limited === true)
    ) {
      const pendingEvents = liveEvents.filter((event) => event.isSending());
      if (pendingEvents.length > 0) {
        pendingEventsToRestore.push({ timelineSet, events: pendingEvents });
      }
      const previousOldState = room.oldState;
      timelineSet.resetLiveTimeline(
        typeof timelineData.prev_batch === 'string' ? timelineData.prev_batch : undefined
      );
      const newLiveTimeline = timelineSet.getLiveTimeline();
      room.oldState = newLiveTimeline.getState(EventTimeline.BACKWARDS)!;
      room.currentState = newLiveTimeline.getState(EventTimeline.FORWARDS)!;
      if (room.oldState !== previousOldState) {
        room.emit(RoomEvent.OldStateUpdated, room, previousOldState, room.oldState);
      }
      didResetTimeline = true;
      continue;
    }

    // The SDK writes prev_batch over the live timeline's BACKWARDS token on every
    // limited response. When the window starts at an event we already have below
    // our top, nothing is prepended and the top does not move, so that token would
    // back-paginate from the wrong stream position and prepend newer events.
    if (timelineData.limited === true && firstKnownResponseIndex === 0 && firstKnownLiveIndex > 0) {
      const topToken = liveTimeline?.getPaginationToken(EventTimeline.BACKWARDS);
      if (typeof topToken === 'string') timelineData.prev_batch = topToken;
    }

    if (!shouldMarkLimited) {
      continue;
    }

    if (typeof timelineData.prev_batch !== 'string') {
      const token = mx
        ?.getRoom(roomId)
        ?.getLiveTimeline()
        .getPaginationToken(EventTimeline.BACKWARDS);
      if (typeof token === 'string') timelineData.prev_batch = token;
    }
  }

  if (didResetTimeline) mx?.resetNotifTimelineSet();
  if (pendingEventsToRestore.length === 0) return null;

  return () => {
    for (const { timelineSet, events } of pendingEventsToRestore) {
      const liveTimeline = timelineSet.getLiveTimeline();
      for (const event of events) {
        const eventId = event.getId();
        if (
          event.status === null ||
          event.status === EventStatus.CANCELLED ||
          !eventId ||
          timelineSet.findEventById(eventId)
        ) {
          continue;
        }
        timelineSet.addEventToTimeline(event, liveTimeline, {
          toStartOfTimeline: false,
          addToState: false,
        });
      }
    }
  };
};

const LOCAL_ECHO_MATCH_MAX_CLOCK_SKEW_MS = 60_000;

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .toSorted()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
      );
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
};

export const reconcileLocalEchoes = (room: Room | null | undefined): void => {
  if (!room) return;
  const liveEvents = room.getLiveTimeline().getEvents();
  const pendingEchoes = liveEvents.filter(
    (event) =>
      event.status !== null &&
      event.status !== EventStatus.CANCELLED &&
      event.status !== EventStatus.SENT
  );
  if (pendingEchoes.length === 0) return;

  const claimedEventIds = new Set<string>();
  const isMergeCandidate = (candidate: MatrixEvent, echo: MatrixEvent): boolean => {
    const candidateId = candidate.getId();
    if (!candidateId || candidate === echo || claimedEventIds.has(candidateId)) return false;
    if (candidate.status !== null) return false;
    if (candidate.getSender() !== echo.getSender()) return false;
    return !candidate.isRedacted();
  };

  for (const echo of pendingEchoes) {
    const txnId = echo.getTxnId();
    let match = txnId
      ? liveEvents.find(
          (candidate) =>
            isMergeCandidate(candidate, echo) && candidate.getUnsigned()?.transaction_id === txnId
        )
      : undefined;
    if (!match) {
      const wireType = echo.getWireType();
      const wireContent = canonicalJson(echo.getWireContent());
      match = liveEvents.find((candidate) => {
        if (!isMergeCandidate(candidate, echo)) return false;
        if (candidate.getWireType() !== wireType) return false;
        const candidateTxn = candidate.getUnsigned()?.transaction_id;
        if (typeof candidateTxn === 'string' && candidateTxn !== txnId) return false;
        if (candidate.getTs() < echo.getTs() - LOCAL_ECHO_MATCH_MAX_CLOCK_SKEW_MS) return false;
        return canonicalJson(candidate.getWireContent()) === wireContent;
      });
    }
    const matchId = match?.getId();
    if (!match || !matchId) continue;
    claimedEventIds.add(matchId);

    const unsigned = match.getUnsigned();
    if (txnId && typeof unsigned.transaction_id !== 'string') {
      unsigned.transaction_id = txnId;
      match.setUnsigned(unsigned);
    }
    room.removeEvent(matchId);
    room.handleRemoteEcho(match, echo);
    debugLog.info('sync', 'Reconciled unlinked local echo', {
      roomId: room.roomId,
      localEchoId: echo.getId(),
      remoteEventId: matchId,
    });
  }
};

export class SlidingSyncManager {
  private disposed = false;

  private readonly listKeys: string[];

  private readonly activeRoomSubscriptions = new Set<string>();

  private readonly callRoomSubscriptions = new Set<string>();

  /**
   * Rooms joined locally via reconcileRoomMembership(Join) but not yet confirmed
   * joined by a sliding-sync response. The SDK reverts these to "invite" when the
   * server still sends invite_state after a join, so we re-assert join each sync.
   */
  private readonly optimisticallyJoinedRoomIds = new Map<string, OptimisticJoin>();

  private readonly sidebarRoomSubscriptions = new Set<string>();

  private readonly spaceSubscriptions = new Set<string>();

  private deferredSpaceSubscriptions = new Set<string>();

  private readonly imagePackRoomSubscriptions = new Set<string>();

  private deferredImagePackSubscriptions: Set<string> | null = null;

  /**
   * Room IDs that received data in the current sync cycle. Used to narrow the
   * sync-settled unread recompute to only changed rooms instead of all rooms.
   * Populated by onCacheRoomData, cleared after the settled listeners fire.
   */
  private readonly dirtyRoomIds = new Set<string>();

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

  private readonly serverMembershipRoomIds = new Set<string>();

  private initialSyncCompleted = false;

  private syncCount = 0;

  private responseProcessingStartedAt: number | undefined;

  private responseProcessing = false;

  private readonly responseSettledListeners = new Set<
    (dirtyRoomIds: ReadonlySet<string>) => void
  >();

  private readonly trackedResponses = new WeakMap<
    MSC3575SlidingSyncResponse,
    TrackedSlidingSyncResponse
  >();

  private readonly timelineResetCompletions = new WeakMap<
    MSC3575SlidingSyncResponse,
    TimelineResetCompletion
  >();

  private readonly preparedRoomSubscriptions = new Map<string, Set<PreparedRoomSubscription>>();

  private readonly routeActiveRoomSubscriptions = new Set<string>();

  private readonly temporaryRoomSubscriptions = new Set<string>();

  private readonly pendingRouteReleaseTimers = new Map<
    string,
    ReturnType<typeof globalThis.setTimeout>
  >();

  private requestId = 0;

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

  private readonly hydrationStatusListeners = new Set<
    (isHydrating: boolean, progress?: HydrationProgress) => void
  >();

  private readonly roomDataAwaitingSyncCompletion = new Set<string>();

  /**
   * Sync cycle each room subscription was requested in. A quiet room can be
   * subscribed to without the server ever sending a RoomData envelope for it,
   * so the loading flag needs a deadline of its own rather than waiting on
   * pendingRoomDataListeners, which would never fire.
   */
  private readonly roomSubscriptionLoadingSince = new Map<string, number>();

  /** Wall-clock time recorded in attach() — used to compute true initial-sync latency. */
  private attachTime: number | null = null;

  private readonly pollDeadlineMs: number;

  private pollWatchdogTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

  private paused = false;

  private pushDrainPollsLeft = 0;

  private readonly resumeWaiters = new Set<() => void>();

  /** Span covering the period from attach() to the first successful complete cycle. */
  private initialSyncSpan: ReturnType<typeof Sentry.startInactiveSpan> | null = null;

  public readonly slidingSync: SlidingSync;

  public constructor(
    private readonly mx: MatrixClient,
    private readonly baseUrl: string,
    options: SlidingSyncOptions = {}
  ) {
    const pollTimeoutMs = clampPositive(options.pollTimeoutMs, DEFAULT_POLL_TIMEOUT_MS);
    this.pollDeadlineMs = pollTimeoutMs + SDK_CLIENT_TIMEOUT_BUFFER_MS + POLL_DEADLINE_MARGIN_MS;

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
      CALL_ROOM_SUBSCRIPTION_KEY,
      buildCallRoomSubscription(roomTimelineLimit)
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
    this.slidingSync.addCustomSubscription(
      SPACE_IMAGE_PACK_SUBSCRIPTION_KEY,
      buildSpaceImagePackSubscription()
    );

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

      this.armPollWatchdog();

      if (state === SlidingSyncState.RequestFinished) {
        if (!err && resp) {
          this.responseProcessing = true;
          this.responseProcessingStartedAt = performance.now();
        }
        return;
      }

      if (err || !resp || state !== SlidingSyncState.Complete) return;

      this.timelineResetCompletions.get(resp)?.();
      this.timelineResetCompletions.delete(resp);
      for (const roomId of Object.keys(resp.rooms ?? {})) {
        reconcileLocalEchoes(this.mx.getRoom(roomId));
      }
      this.recordServerMembershipRooms(resp);
      this.reassertOptimisticJoins();

      this.roomDataAwaitingSyncCompletion.forEach((roomId) =>
        this.notifyRoomSubscriptionStatus(roomId, false)
      );
      this.roomDataAwaitingSyncCompletion.clear();

      this.syncCount += 1;
      this.settlePushDrain(resp);

      // A subscription that saw no room data is settled once a full cycle has
      // completed after the one it was requested in: the server had nothing to
      // send for it. The extra cycle is the grace period for the request that
      // actually carried the subscription.
      this.roomSubscriptionLoadingSince.forEach((since, roomId) => {
        if (this.syncCount < since + 2) return;
        this.roomSubscriptionLoadingSince.delete(roomId);
        this.notifyRoomSubscriptionStatus(roomId, false);
      });
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
      this.ensureListCoverage();

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

      ['receipts', 'account_data'].forEach((extensionName) => {
        const extension = resp.extensions?.[extensionName] as
          | RoomScopedExtensionResponse
          | undefined;
        const rooms = extension?.rooms ?? {};
        Object.entries(rooms).forEach(([roomId, data]) => {
          if (extensionName === 'account_data' && Array.isArray(data) && data.length === 0) return;
          this.dirtyRoomIds.add(roomId);
        });
      });

      this.resolvePreparedRoomSubscriptions(resp);

      globalThis.queueMicrotask(() => {
        if (this.disposed) return;
        this.responseProcessing = false;
        const dirtyRoomIds = new Set(this.dirtyRoomIds);
        this.dirtyRoomIds.clear();
        this.responseSettledListeners.forEach((listener) => listener(dirtyRoomIds));
      });
    };

    this.onMembershipLeave = (_event, member) => {
      if (member.userId !== this.mx.getUserId()) return;
      if (member.membership !== KnownMembership.Leave && member.membership !== KnownMembership.Ban)
        return;
      this.handleRoomLeaveSubscriptions(member.roomId);
    };

    this.onCacheRoomData = (roomId, data) => {
      this.dirtyRoomIds.add(roomId);
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
      roomTimelineLimit: this.roomTimelineLimit,
      lists: this.listKeys,
    });

    this.attachTime = performance.now();
    this.initialSyncSpan = Sentry.startInactiveSpan({
      name: 'sync.initial',
      op: 'matrix.sync',
      attributes: {
        'sync.transport': 'sliding',
      },
    });

    this.slidingSync.on(SlidingSyncEvent.Lifecycle, this.onLifecycle);
    this.slidingSync.on(SlidingSyncEvent.RoomData, this.onCacheRoomData);
    this.mx.on(RoomMemberEvent.Membership, this.onMembershipLeave);
    this.mx.on(ClientEvent.AccountData, this.onCacheAccountData);

    this.armPollWatchdog();

    debugLog.info('sync', 'Sliding sync listeners attached successfully');
  }

  /**
   * Backstop for the SDK's own `clientTimeout`, which is a JS timer and so cannot fire
   * while a mobile webview is frozen. Re-arms itself because the SDK's abort path
   * `continue`s without emitting a lifecycle event.
   */
  private armPollWatchdog(): void {
    if (this.disposed || this.paused) return;
    globalThis.clearTimeout(this.pollWatchdogTimer);
    this.pollWatchdogTimer = globalThis.setTimeout(() => {
      this.pollWatchdogTimer = undefined;
      if (this.disposed) return;
      debugLog.warn('sync', 'Sliding sync poll exceeded client-side deadline; cycling transport', {
        pollDeadlineMs: this.pollDeadlineMs,
        syncNumber: this.syncCount,
      });
      this.slidingSync.resend();
      this.armPollWatchdog();
    }, this.pollDeadlineMs);
  }

  /**
   * Stop issuing requests without tearing the transport down. `SlidingSync.stop()` is
   * terminal and drops the `pos` token held in `start()`, so stop/start would force a
   * full initial sync on every resume; the request patch parks on `waitForResume()`
   * instead.
   */
  public pause(): void {
    this.pushDrainPollsLeft = 0;
    if (this.paused || this.disposed) return;
    this.paused = true;
    globalThis.clearTimeout(this.pollWatchdogTimer);
    this.pollWatchdogTimer = undefined;
    this.slidingSync.resend();
    debugLog.info('sync', 'Sliding sync paused');
  }

  private liftPause(): void {
    this.paused = false;
    this.releaseResumeWaiters();
    this.armPollWatchdog();
  }

  public resume(): void {
    this.pushDrainPollsLeft = 0;
    if (!this.paused) return;
    this.liftPause();
    debugLog.info('sync', 'Sliding sync resumed');
  }

  /** Poll on while backgrounded, then park: to-device only arrives over a live `/sync`. */
  public resumeForPush(): boolean {
    if (this.disposed || !this.paused) return false;
    this.pushDrainPollsLeft = MAX_PUSH_DRAIN_POLLS;
    this.liftPause();
    debugLog.info('sync', 'Sliding sync resumed to drain to-device after a push');
    return true;
  }

  private settlePushDrain(resp: MSC3575SlidingSyncResponse): void {
    if (this.pushDrainPollsLeft === 0) return;
    const toDevice = resp.extensions?.to_device as { events?: unknown[] } | undefined;
    const drained = (toDevice?.events?.length ?? 0) === 0;
    this.pushDrainPollsLeft -= 1;
    if (!drained && this.pushDrainPollsLeft > 0) return;
    this.pause();
  }

  public isPaused(): boolean {
    return this.paused;
  }

  /** Resolves on the next resume(), or immediately when not paused. */
  public waitForResume(): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise((resolve) => {
      this.resumeWaiters.add(resolve);
    });
  }

  private releaseResumeWaiters(): void {
    const waiters = Array.from(this.resumeWaiters);
    this.resumeWaiters.clear();
    waiters.forEach((resolve) => resolve());
  }

  public dispose(): void {
    if (this.disposed) return;

    debugLog.info('sync', 'Disposing sliding sync', {
      syncCount: this.syncCount,
      initialSyncCompleted: this.initialSyncCompleted,
    });

    this.pendingRoomDataListeners.clear();
    this.roomSubscriptionLoadingSince.clear();
    this.optimisticallyJoinedRoomIds.clear();
    this.responseProcessing = false;
    this.responseSettledListeners.clear();
    this.preparedRoomSubscriptions.clear();
    this.pendingRouteReleaseTimers.forEach((timer) => globalThis.clearTimeout(timer));
    this.pendingRouteReleaseTimers.clear();
    this.routeActiveRoomSubscriptions.clear();
    this.temporaryRoomSubscriptions.clear();
    this.dirtyRoomIds.clear();
    this.roomDataAwaitingSyncCompletion.clear();
    this.roomSubscriptionStatusListeners.forEach((listeners) =>
      listeners.forEach((listener) => listener(false))
    );
    this.roomSubscriptionStatusListeners.clear();
    this.hydrationStatusListeners.forEach((listener) => listener(false));
    this.hydrationStatusListeners.clear();

    this.disposed = true;
    this.paused = false;
    this.pushDrainPollsLeft = 0;
    this.releaseResumeWaiters();
    globalThis.clearTimeout(this.pollWatchdogTimer);
    this.pollWatchdogTimer = undefined;
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
      const membership = membershipOf(
        findSelfMemberEvent(
          [...(roomData.required_state ?? []), ...(roomData.invite_state ?? [])],
          userId
        )
      );

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

      let joinedRoomIds: string[];
      try {
        const response = await this.mx.getJoinedRooms();
        joinedRoomIds = response.joined_rooms;
      } catch (error) {
        debugLog.warn('sync', 'Skipped sidebar cache reconciliation: joined rooms unavailable', {
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      if (this.disposed || this.sidebarCacheReconciled) return;
      this.sidebarCacheReconciled = true;

      const validRoomIds = new Set([...this.serverMembershipRoomIds, ...joinedRoomIds]);

      this.sidebarCache.clearInviteStateForRooms(joinedRoomIds);

      joinedRoomIds.forEach((roomId) => {
        const room = this.mx.getRoom(roomId);
        if (room?.getMyMembership() === (KnownMembership.Invite as string)) {
          this.assertLocalJoin(room);
        }
      });

      const removedRoomIds = this.sidebarCache.reconcileRooms(validRoomIds);
      removedRoomIds.forEach((roomId) => {
        this.mx.getRoom(roomId)?.updateMyMembership(KnownMembership.Leave);
        this.unsubscribeFromRoom(roomId);
      });

      if (removedRoomIds.length > 0) {
        debugLog.info('sync', 'Removed stale rooms from the sliding sync sidebar cache', {
          removedRoomCount: removedRoomIds.length,
          joinedRoomCount: joinedRoomIds.length,
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
        void this.sidebarCache
          .hydrate(this.mx, this.slidingSync)
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
        this.hydrationStatusListeners.forEach((listener) => listener(false));
        this.reconcileSidebarCacheMembership();
        globalThis.setTimeout(() => this.flushDeferredSubscriptions(), 0);
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
      if (this.listsFullyLoaded) {
        this.listsFullyLoaded = false;
      }
      this.hydrationStatusListeners.forEach((listener) =>
        listener(true, this.getHydrationProgress())
      );
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

  // Paging stops once every list is covered, but the counts keep growing, and a state
  // change does not bump a room back into the window.
  private ensureListCoverage(): void {
    if (!this.initialListHydrationCompleted) return;

    this.listKeys.forEach((key) => {
      const knownCount = this.slidingSync.getListData(key)?.joinedCount ?? 0;
      const desiredEnd = knownCount - 1;
      if (desiredEnd <= getListEndIndex(this.slidingSync.getListParams(key))) return;

      this.slidingSync.setListRanges(key, [[0, desiredEnd]]);
      this.requestedListRangeEnds.set(key, desiredEnd);
      debugLog.info('sync', `Extended list "${key}" to cover newly joined rooms`, {
        list: key,
        newEnd: desiredEnd,
      });
    });
  }

  public ensureListRegistered(listKey: string, updateArgs: PartialSlidingSyncRequest): MSC3575List {
    let list = this.slidingSync.getListParams(listKey);
    if (!list) {
      list = {
        ranges: [[0, LIST_PAGE_SIZE - 1]],
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

  public isRoomActive(roomId: string): boolean {
    return this.activeRoomSubscriptions.has(roomId);
  }

  public getHydrationProgress(): HydrationProgress {
    let loadedRooms = 0;
    let totalRooms = 0;
    this.listKeys.forEach((key) => {
      const existing = this.slidingSync.getListData(key);
      const knownCount = existing?.joinedCount ?? 0;
      const currentEnd = this.confirmedListRangeEnds.get(key) ?? -1;

      if (knownCount > 0) {
        totalRooms += knownCount;
        loadedRooms += Math.min(knownCount, currentEnd + 1);
      }
    });
    return { loadedRooms, totalRooms };
  }

  public isSyncingRoomData(): boolean {
    return !this.listsFullyLoaded;
  }

  public onHydrationStatusChange(
    listener: (isHydrating: boolean, progress?: HydrationProgress) => void
  ): () => void {
    this.hydrationStatusListeners.add(listener);
    listener(
      this.isSyncingRoomData(),
      this.isSyncingRoomData() ? this.getHydrationProgress() : undefined
    );
    return () => {
      this.hydrationStatusListeners.delete(listener);
    };
  }

  public isResponseProcessing(): boolean {
    return this.responseProcessing;
  }

  public subscribeToResponseSettled(
    listener: (dirtyRoomIds: ReadonlySet<string>) => void
  ): () => void {
    this.responseSettledListeners.add(listener);
    return () => this.responseSettledListeners.delete(listener);
  }

  public trackSubscriptionRequest(
    roomIds: Iterable<string>
  ): (response: MSC3575SlidingSyncResponse) => void {
    const requestId = ++this.requestId;
    const subscriptionRoomIds = new Set(roomIds);
    return (response) => {
      this.trackedResponses.set(response, { requestId, subscriptionRoomIds });
    };
  }

  public trackTimelineResetCompletion(
    response: MSC3575SlidingSyncResponse,
    completion: TimelineResetCompletion
  ): void {
    this.timelineResetCompletions.set(response, completion);
  }

  public prepareRoomSubscription(roomId: string, listener: () => void): () => void {
    this.cancelPendingRouteRelease(roomId);
    const wasActive = this.isRoomActive(roomId);
    const prepared: PreparedRoomSubscription = {
      afterRequestId: this.requestId,
      requiresSubscriptionResponse: !wasActive,
      listener,
    };
    const listeners = this.preparedRoomSubscriptions.get(roomId) ?? new Set();
    listeners.add(prepared);
    this.preparedRoomSubscriptions.set(roomId, listeners);
    if (!wasActive) this.subscribeToRoom(roomId);
    else this.slidingSync.resend();
    if (!wasActive && this.isRoomActive(roomId)) {
      this.temporaryRoomSubscriptions.add(roomId);
    }

    return () => {
      listeners.delete(prepared);
      if (listeners.size === 0) this.preparedRoomSubscriptions.delete(roomId);
    };
  }

  public releaseRoomSubscriptionUnlessRouted(roomId: string): void {
    this.cancelPendingRouteRelease(roomId);
    if (!this.temporaryRoomSubscriptions.has(roomId)) return;
    if (this.routeActiveRoomSubscriptions.has(roomId)) {
      this.temporaryRoomSubscriptions.delete(roomId);
      return;
    }

    const timer = globalThis.setTimeout(() => {
      this.pendingRouteReleaseTimers.delete(roomId);
      if (
        this.temporaryRoomSubscriptions.has(roomId) &&
        !this.routeActiveRoomSubscriptions.has(roomId)
      ) {
        this.unsubscribeFromRoom(roomId);
      }
    }, ROUTE_ADOPTION_TIMEOUT_MS);
    this.pendingRouteReleaseTimers.set(roomId, timer);
  }

  private cancelPendingRouteRelease(roomId: string): void {
    const timer = this.pendingRouteReleaseTimers.get(roomId);
    if (timer === undefined) return;
    globalThis.clearTimeout(timer);
    this.pendingRouteReleaseTimers.delete(roomId);
  }

  public isRoomSubscriptionTemporary(roomId: string): boolean {
    return this.temporaryRoomSubscriptions.has(roomId);
  }

  private resolvePreparedRoomSubscriptions(response: MSC3575SlidingSyncResponse): void {
    const tracked = this.trackedResponses.get(response);
    if (!tracked) return;

    this.preparedRoomSubscriptions.forEach((listeners, roomId) => {
      [...listeners].forEach((prepared) => {
        const ready =
          tracked.requestId > prepared.afterRequestId &&
          (!prepared.requiresSubscriptionResponse || tracked.subscriptionRoomIds.has(roomId));
        if (!ready) return;
        listeners.delete(prepared);
        prepared.listener();
      });
      if (listeners.size === 0) this.preparedRoomSubscriptions.delete(roomId);
    });
  }

  /**
   * Re-assert join for rooms the SDK reverted to "invite" because the server's
   * sliding-sync proxy still sent invite_state after a successful join. Runs
   * after the SDK has finished processing all room data for the cycle (Complete
   * fires post-processing) and before the responseSettled microtask that drives
   * unread computation, so the app sees the corrected membership.
   *
   * Release is driven by sanitizeOptimisticJoinResponse, not by the SDK
   * membership read back here: that would release the room merely because
   * nothing in the cycle touched it, letting a later stale invite win for good.
   */
  private reassertOptimisticJoins(): void {
    if (this.optimisticallyJoinedRoomIds.size === 0) return;
    for (const [roomId, tracked] of this.optimisticallyJoinedRoomIds) {
      const room = this.mx.getRoom(roomId);
      if (!room) {
        this.optimisticallyJoinedRoomIds.delete(roomId);
        continue;
      }
      this.assertLocalJoin(room);

      if (
        !tracked.verificationRequested &&
        this.syncCount - tracked.joinedAtSyncCount >= OPTIMISTIC_JOIN_VERIFY_AFTER_CYCLES
      ) {
        tracked.verificationRequested = true;
        this.verifyOptimisticJoin(roomId);
      }

      if (this.syncCount - tracked.lastSeenSyncCount >= OPTIMISTIC_JOIN_MAX_SYNC_CYCLES) {
        debugLog.warn('sync', 'Stopped re-asserting optimistic join: room no longer reported', {
          roomId,
          syncCycles: OPTIMISTIC_JOIN_MAX_SYNC_CYCLES,
        });
        this.optimisticallyJoinedRoomIds.delete(roomId);
      }
    }
  }

  /**
   * Asks the authoritative /joined_rooms who is right when the disagreement
   * lasts. A "no" means our /join is stale (a fresh invite after a kick, or a
   * join that never committed), so stop overriding the server. Errors keep the
   * optimistic join: an unreachable server must not strand the user on an invite.
   */
  private verifyOptimisticJoin(roomId: string): void {
    void this.mx
      .getJoinedRooms()
      .then((response) => {
        if (this.disposed || !this.optimisticallyJoinedRoomIds.has(roomId)) return;
        if (response.joined_rooms.includes(roomId)) return;

        this.optimisticallyJoinedRoomIds.delete(roomId);
        debugLog.warn('sync', 'Stopped re-asserting optimistic join: server reports not joined', {
          roomId,
        });
        Sentry.addBreadcrumb({
          category: 'sync.sliding',
          message: 'Stopped re-asserting optimistic join: server reports not joined',
          level: 'warning',
        });
      })
      .catch((error: unknown) => {
        debugLog.warn('sync', 'Could not verify optimistic join; still assuming joined', {
          roomId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  /**
   * Room.recalculate() derives selfMembership from the m.room.member event, so
   * fixing only one of the two lets the next recalculate() undo it. The crypto
   * layer reads membership from that event too.
   */
  private assertLocalJoin(room: Room): void {
    if (room.getMyMembership() !== (KnownMembership.Join as string)) {
      room.updateMyMembership(KnownMembership.Join);
    }
    this.repairSelfJoinMemberEvent(room);
  }

  private repairSelfJoinMemberEvent(room: Room): void {
    const myUserId = this.mx.getUserId();
    if (!myUserId) return;
    const roomState = room.getLiveTimeline().getState(EventTimeline.FORWARDS);
    if (!roomState) return;
    const existing = roomState.getStateEvents(EventType.RoomMember, myUserId)?.getContent();
    if (existing?.membership === KnownMembership.Join) return;

    roomState.setStateEvents([
      new MatrixEvent(buildSelfJoinEvent(room.roomId, myUserId, existing)),
    ]);
  }

  /**
   * Strips the stale stripped invite some servers keep sending for a room we
   * already joined, before the SDK derives an invite from it.
   *
   * Which field reports the membership varies: Synapse omits required_state for
   * invites, and Continuwuity does not substitute the "$ME" state key at all, so
   * our own member event never appears in its required_state.
   */
  public sanitizeOptimisticJoinResponse(resp: MSC3575SlidingSyncResponse | null): void {
    if (!resp?.rooms || this.optimisticallyJoinedRoomIds.size === 0) return;
    const myUserId = this.mx.getUserId();
    if (!myUserId) return;

    for (const [roomId, tracked] of this.optimisticallyJoinedRoomIds) {
      const roomData = resp.rooms[roomId];
      if (!roomData) continue;

      tracked.lastSeenSyncCount = this.syncCount;

      const stateMember = findSelfMemberEvent(roomData.required_state ?? [], myUserId);
      const reported =
        membershipOf(stateMember) ??
        membershipOf(findSelfMemberEvent(roomData.timeline ?? [], myUserId));
      const staleInvite = findSelfMemberEvent(roomData.invite_state ?? [], myUserId);

      if (
        reported !== undefined &&
        reported !== (KnownMembership.Invite as string) &&
        reported !== (KnownMembership.Knock as string)
      ) {
        // Our join, or something newer we must not suppress.
        this.optimisticallyJoinedRoomIds.delete(roomId);
        // The SDK ignores required_state whenever invite_state is present.
        if (reported === (KnownMembership.Join as string)) delete roomData.invite_state;
        continue;
      }

      if (!roomData.invite_state) {
        // The server stopped treating us as invited.
        this.optimisticallyJoinedRoomIds.delete(roomId);
        continue;
      }

      // Replaced, not removed: the sidebar cache only clears its persisted
      // invite once required_state says join.
      delete roomData.invite_state;
      roomData.required_state = [
        ...(roomData.required_state ?? []).filter((event) => !isSelfMemberEvent(event, myUserId)),
        buildSelfJoinEvent(roomId, myUserId, staleInvite?.content ?? stateMember?.content),
      ];

      debugLog.info('sync', 'Replaced stale invite data for optimistically joined room', {
        roomId,
        reported,
        syncCycle: this.syncCount,
      });
      Sentry.addBreadcrumb({
        category: 'sync.sliding',
        message: 'Replaced stale invite data for optimistically joined room',
        level: 'info',
        data: { reported, syncCycle: this.syncCount },
      });
    }
  }

  public reconcileRoomMembership(
    roomId: string,
    membership: KnownMembership.Join | KnownMembership.Leave
  ): void {
    const room = this.mx.getRoom(roomId);
    room?.updateMyMembership(membership);

    if (membership === KnownMembership.Join) {
      if (room) this.repairSelfJoinMemberEvent(room);
      // The cache clears its own invite only once required_state says join, which
      // a server without "$ME" substitution never sends, so drop it here.
      this.sidebarCache.clearInviteStateForRooms([roomId]);
      // Track the room so we can re-assert join if the SDK reverts it while the
      // server's sliding-sync proxy still reports the room in the invite list.
      this.optimisticallyJoinedRoomIds.set(roomId, {
        joinedAtSyncCount: this.syncCount,
        lastSeenSyncCount: this.syncCount,
        verificationRequested: false,
      });
      // Subscribe so the next sync pulls real joined member state into the
      // room's current state, letting recalculate() see "join" not "invite".
      this.subscribeToRoom(roomId);
      return;
    }

    if (membership === KnownMembership.Leave) {
      this.optimisticallyJoinedRoomIds.delete(roomId);
      this.handleRoomLeaveSubscriptions(roomId);
      this.mx.store.removeRoom(roomId);
    }
  }

  private handleRoomLeaveSubscriptions(roomId: string): void {
    this.sidebarCache.removeRoom(roomId);
    const removedPassiveSubscription = this.removePassiveSubscriptions(roomId);
    if (this.activeRoomSubscriptions.has(roomId)) {
      this.unsubscribeFromRoom(roomId);
    } else if (removedPassiveSubscription) {
      this.queueRoomSubscriptionSync();
    }
  }

  // Includes the deferred sets so a later flush cannot resubscribe a room we left.
  private removePassiveSubscriptions(roomId: string): boolean {
    const removedSpace = this.spaceSubscriptions.delete(roomId);
    const removedSidebar = this.sidebarRoomSubscriptions.delete(roomId);
    const removedImagePack = this.imagePackRoomSubscriptions.delete(roomId);
    this.deferredSpaceSubscriptions.delete(roomId);
    this.deferredImagePackSubscriptions?.delete(roomId);
    return removedSpace || removedSidebar || removedImagePack;
  }

  private flushDeferredSubscriptions(): void {
    if (this.disposed || !this.listsFullyLoaded) return;

    const spaces = this.deferredSpaceSubscriptions;
    this.deferredSpaceSubscriptions = new Set();
    this.setSpaceSubscriptions(spaces);

    const imagePacks = this.deferredImagePackSubscriptions;
    this.deferredImagePackSubscriptions = null;
    if (imagePacks) this.setImagePackSubscriptions(imagePacks);
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
    // MSC4186 rejects a request carrying more than MAX_ROOM_SUBSCRIPTIONS with
    // M_INVALID_PARAM, so fill by priority and drop the rest.
    const desiredSubscriptions = new Set<string>();
    let dropped = 0;
    [
      this.callRoomSubscriptions,
      this.activeRoomSubscriptions,
      this.sidebarRoomSubscriptions,
      this.spaceSubscriptions,
      this.imagePackRoomSubscriptions,
    ].forEach((group) =>
      group.forEach((roomId) => {
        if (desiredSubscriptions.has(roomId)) return;
        if (desiredSubscriptions.size >= MAX_ROOM_SUBSCRIPTIONS) {
          dropped += 1;
          return;
        }
        desiredSubscriptions.add(roomId);
      })
    );
    if (dropped > 0) {
      log.warn(
        `Sliding Sync dropped ${dropped} room subscriptions over the ${MAX_ROOM_SUBSCRIPTIONS} cap`
      );
    }

    desiredSubscriptions.forEach((roomId) => {
      if (this.callRoomSubscriptions.has(roomId)) {
        this.slidingSync.useCustomSubscription(roomId, CALL_ROOM_SUBSCRIPTION_KEY);
      } else if (this.activeRoomSubscriptions.has(roomId)) {
        this.slidingSync.useCustomSubscription(roomId, ACTIVE_ROOM_SUBSCRIPTION_KEY);
      } else if (this.sidebarRoomSubscriptions.has(roomId)) {
        this.slidingSync.useCustomSubscription(roomId, SIDEBAR_ROOM_SUBSCRIPTION_KEY);
      } else if (this.spaceSubscriptions.has(roomId)) {
        this.slidingSync.useCustomSubscription(
          roomId,
          this.imagePackRoomSubscriptions.has(roomId)
            ? SPACE_IMAGE_PACK_SUBSCRIPTION_KEY
            : SPACE_SUBSCRIPTION_KEY
        );
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
    if (!this.listsFullyLoaded) {
      this.deferredImagePackSubscriptions = next;
      return;
    }
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
      this.roomSubscriptionLoadingSince.has(roomId) ||
      this.roomDataAwaitingSyncCompletion.has(roomId)
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
      this.roomSubscriptionLoadingSince.delete(roomId);
      this.roomDataAwaitingSyncCompletion.add(roomId);
    };
    this.pendingRoomDataListeners.set(roomId, onFirstRoomData);
    this.roomSubscriptionLoadingSince.set(roomId, this.syncCount);
    this.slidingSync.on(SlidingSyncEvent.RoomData, onFirstRoomData);
    this.notifyRoomSubscriptionStatus(roomId, true);
    return true;
  }

  private removeActiveRoomSubscription(roomId: string): boolean {
    if (!this.activeRoomSubscriptions.has(roomId)) return false;
    this.cancelPendingRouteRelease(roomId);
    this.temporaryRoomSubscriptions.delete(roomId);
    const pendingListener = this.pendingRoomDataListeners.get(roomId);
    if (pendingListener) {
      this.slidingSync.removeListener(SlidingSyncEvent.RoomData, pendingListener);
      this.pendingRoomDataListeners.delete(roomId);
    }
    this.roomSubscriptionLoadingSince.delete(roomId);
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
    this.routeActiveRoomSubscriptions.clear();
    next.forEach((roomId) => {
      this.routeActiveRoomSubscriptions.add(roomId);
      this.temporaryRoomSubscriptions.delete(roomId);
    });
    this.pendingRouteReleaseTimers.forEach((_timer, roomId) =>
      this.cancelPendingRouteRelease(roomId)
    );
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
    this.cancelPendingRouteRelease(roomId);
    this.temporaryRoomSubscriptions.delete(roomId);
    if (this.disposed || !this.addActiveRoomSubscription(roomId)) return;
    this.syncRoomSubscriptions();
    this.reportActiveSubscriptionCount();
  }

  public subscribeToCallRoom(roomId: string): CallRoomSubscription {
    if (this.disposed) return () => undefined;

    this.callRoomSubscriptions.add(roomId);
    this.syncRoomSubscriptions();
    return () => this.unsubscribeFromCallRoom(roomId);
  }

  public unsubscribeFromCallRoom(roomId: string): void {
    if (this.disposed || !this.callRoomSubscriptions.delete(roomId)) return;
    this.syncRoomSubscriptions();
  }

  public unsubscribeFromRoom(roomId: string): void {
    this.cancelPendingRouteRelease(roomId);
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
