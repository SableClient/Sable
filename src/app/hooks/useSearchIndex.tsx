/**
 * useSearchIndex — manages the search worker lifecycle, live indexing, and headless backfill.
 *
 * Mount once via SearchIndexProvider in the client tree. Consume via useSearchIndex().
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ClientEvent,
  Direction,
  EventTimelineSet,
  EventType,
  MatrixEventEvent,
  RoomEvent,
  SyncState,
  type MatrixEvent,
  type Room,
} from '$types/matrix-sdk';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import type {
  BackfillState,
  IndexableEvent,
  WorkerInMessage,
  WorkerOutMessage,
} from '$plugins/search-worker/types';

// ── Types ───────────────────────────────────────────────────────────────────

export type SearchIndexStats = {
  indexedEventCount: number;
  roomCount: number;
  /** Estimated IDB size in bytes */
  estimatedBytes: number;
  /** Number of encrypted rooms still being backfilled */
  backfillingRoomCount: number;
};

type SearchIndexCtx = {
  /** Query the IDB-backed index. Resolves to an empty array when the index is unavailable. */
  query: (
    term: string,
    opts?: { roomIds?: string[]; senders?: string[]; hasTypes?: string[] }
  ) => Promise<IndexableEvent[]>;
  /** Request current stats from the worker. */
  getStats: () => Promise<SearchIndexStats>;
  /** Wipe the index + IDB. */
  clearIndex: () => Promise<void>;
  /** True once the worker has hydrated from IDB and is ready to accept queries. */
  isReady: boolean;
  /** True while background backfill is actively running. */
  isBackfilling: boolean;
};

// ── Context ──────────────────────────────────────────────────────────────────

const SearchIndexContext = createContext<SearchIndexCtx | null>(null);

export function useSearchIndex(): SearchIndexCtx | null {
  return useContext(SearchIndexContext);
}

// ── Idle scheduler ───────────────────────────────────────────────────────────

/**
 * On systems with requestIdleCallback (desktop, Android Chrome) the browser's
 * own idle scheduler provides natural backpressure, so we allow unlimited
 * concurrent backfills — this restores the fast pre-bf4d8d6 behaviour.
 *
 * On iOS Safari (no requestIdleCallback) we cap concurrency to prevent the
 * HTTP connection pool from being saturated and starving the /sync long-poll.
 */
const HAS_IDLE_CALLBACK = typeof requestIdleCallback === 'function';
const MAX_CONCURRENT_BACKFILLS = HAS_IDLE_CALLBACK ? Infinity : 2;

/**
 * How long to wait after the worker is ready before starting the first backfill
 * pass. Gives the initial /sync and room-list load time to settle before we add
 * background pagination pressure.
 */
const BACKFILL_STARTUP_DELAY_MS = 30_000;

function scheduleIdle(cb: () => void): () => void {
  if (HAS_IDLE_CALLBACK) {
    const id = requestIdleCallback(cb, { timeout: 5000 });
    return () => cancelIdleCallback(id);
  }
  // iOS Safari: no requestIdleCallback — use a longer delay; combined with the
  // concurrency cap (MAX_CONCURRENT_BACKFILLS) this prevents HTTP connection
  // pool saturation and gives WASM crypto breathing room between pages.
  const id = setTimeout(cb, 500);
  return () => clearTimeout(id);
}

// ── Event conversion ──────────────────────────────────────────────────────────

const MEDIA_MSGTYPES = new Set(['m.image', 'm.file', 'm.audio', 'm.video']);

function toIndexableEvent(mEvent: MatrixEvent, roomId: string): IndexableEvent | null {
  const eventId = mEvent.getId();
  if (!eventId) return null;
  // Skip still-encrypted and redacted events
  if (mEvent.getType() === 'm.room.encrypted') return null;
  if (mEvent.getType() !== (EventType.RoomMessage as string)) return null;
  if (mEvent.isRedacted()) return null;
  const content = mEvent.getContent<{
    body?: string;
    msgtype?: string;
    url?: string;
    file?: Record<string, unknown>;
    info?: Record<string, unknown>;
    filename?: string;
  }>();
  const body: string = typeof content.body === 'string' ? content.body : '';
  if (!body.trim()) return null;
  const sender = mEvent.getSender();
  if (!sender) return null;
  const msgtype = content.msgtype ?? 'm.text';
  const base: IndexableEvent = { eventId, roomId, sender, msgtype, body, ts: mEvent.getTs() };
  if (MEDIA_MSGTYPES.has(msgtype)) {
    if (content.url !== undefined) base.url = content.url;
    if (content.file !== undefined) base.file = content.file;
    if (content.info !== undefined) base.info = content.info;
    if (content.filename !== undefined) base.filename = content.filename;
  }
  return base;
}

// ── Provider ─────────────────────────────────────────────────────────────────

const BACKFILL_PAGE_SIZE = 50;

type PendingQuery = {
  resolve: (events: IndexableEvent[]) => void;
  reject: (err: unknown) => void;
};

type PendingStats = {
  backfillingRoomCount: number;
  resolve: (stats: SearchIndexStats) => void;
};

export function SearchIndexProvider({ children }: { children: ReactNode }) {
  const mx = useMatrixClient();
  const [idbSearchIndex] = useSetting(settingsAtom, 'idbSearchIndex');
  const [searchIndexMessageLimit] = useSetting(settingsAtom, 'searchIndexMessageLimit');

  const [isReady, setIsReady] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const pendingQueriesRef = useRef<Map<string, PendingQuery>>(new Map());
  const pendingStatsRef = useRef<PendingStats | null>(null);
  // Rooms whose backfill is actively scheduled (to avoid double-scheduling)
  const backfillingRoomsRef = useRef<Set<string>>(new Set());
  // Store headless timeline sets per room for pagination continuity
  const headlessSetsRef = useRef<Map<string, EventTimelineSet>>(new Map());
  // cancellable idle callbacks for backfill
  const cancelIdlesRef = useRef<Array<() => void>>([]);
  // Queue of rooms waiting to start backfill (for the concurrency limiter)
  const backfillQueueRef = useRef<Array<{ room: Room; state: BackfillState }>>([]);
  // Current Matrix sync state — used to pause backfill when sync is struggling
  const syncStateRef = useRef<SyncState | null>(null);
  // Persisted backfill states received from the worker — used by the ClientEvent.Room
  // listener to correctly handle rooms that are added after the initial startBackfill call
  // (e.g. rooms loaded by sliding sync after the initial window of 100).
  const backfillStatesRef = useRef<Record<string, BackfillState>>({});
  // True after the startup delay has elapsed — gates resumeBackfill so we don't
  // hammer /messages during the initial sync and room-list load.
  const backfillReadyRef = useRef(false);
  // Handle for the startup-delay timer so we can cancel it on cleanup.
  const backfillStartDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const postToWorker = useCallback((msg: WorkerInMessage) => {
    // oxlint-disable-next-line require-post-message-target-origin -- Worker.postMessage has no targetOrigin
    workerRef.current?.postMessage(msg);
  }, []);

  // ── Live indexing ──────────────────────────────────────────────────────────

  const indexEvent = useCallback(
    (mEvent: MatrixEvent, room: Room) => {
      const handleDecrypted = () => {
        try {
          const ev = toIndexableEvent(mEvent, room.roomId);
          if (ev) postToWorker({ type: 'INDEX_EVENTS', events: [ev] });
        } catch (e) {
          // Skip events that fail to process without halting live indexing
          console.warn(
            `[search-index] Failed to index live event ${mEvent.getId()} in room ${room.roomId}:`,
            e
          );
          Sentry.captureException(e, {
            level: 'warning',
            tags: { component: 'search-index', failure_stage: 'live_event_indexing' },
            extra: {
              eventId: mEvent.getId(),
              eventType: mEvent.getType(),
              roomId: room.roomId,
            },
          });
        }
      };

      if (mEvent.getType() === 'm.room.encrypted') {
        // Still encrypted — wait for decryption
        mEvent.once(MatrixEventEvent.Decrypted, handleDecrypted);
      } else {
        handleDecrypted();
      }
    },
    [postToWorker]
  );

  // ── Headless backfill ──────────────────────────────────────────────────────

  const backfillRoom = useCallback(
    async (room: Room, state: BackfillState): Promise<void> => {
      if (state.done) return;

      // Get or create headless timeline set for this room
      let headlessSet = headlessSetsRef.current.get(room.roomId);
      if (!headlessSet) {
        headlessSet = new EventTimelineSet(room, {});
        headlessSetsRef.current.set(room.roomId, headlessSet);
      }

      const headlessTimeline = headlessSet.getLiveTimeline();

      // Seed the backward token: from IDB state, or from the room's live timeline
      const seedToken =
        state.token ?? room.getLiveTimeline().getPaginationToken(Direction.Backward);
      if (!seedToken) {
        // Room has no history to paginate — mark done
        postToWorker({
          type: 'SET_BACKFILL_STATE',
          roomId: room.roomId,
          state: { ...state, done: true },
        });
        backfillingRoomsRef.current.delete(room.roomId);
        return;
      }

      headlessTimeline.setPaginationToken(seedToken, Direction.Backward);

      // Snapshot event count before pagination so we can slice only new events
      const prevEventCount = headlessTimeline.getEvents().length;

      let hasMore = false;
      try {
        hasMore = await mx.paginateEventTimeline(headlessTimeline, {
          backwards: true,
          limit: BACKFILL_PAGE_SIZE,
        });
      } catch {
        // Pagination error — the stored token has likely expired.
        // If we have an established frontier (oldestTs), re-queue this room
        // with token:null so the next attempt falls back to the live timeline
        // token and fast-forwards past already-indexed history instead of
        // abandoning the room permanently.
        if (state.oldestTs !== undefined && state.token !== null) {
          backfillQueueRef.current.unshift({
            room,
            state: {
              token: null,
              done: false,
              indexedCount: state.indexedCount,
              oldestTs: state.oldestTs,
            },
          });
        }
        backfillingRoomsRef.current.delete(room.roomId);
        return;
      }

      // Only process events added by this pagination pass. The headless timeline
      // accumulates all paginated events, so slicing from prevEventCount avoids
      // re-indexing already-seen events (O(n²) → O(n) per page).
      const allEvents = headlessTimeline.getEvents();
      const newEvents = allEvents.slice(0, allEvents.length - prevEventCount);

      // Expired-token recovery: when state.token was null (we fell back to the
      // live timeline's backward token after an expiry), skip events that fall
      // within the already-indexed time range. We compare by timestamp rather
      // than event ID to avoid fetching and decrypting every page looking for
      // a known ID — only this first fallback page needs the filter; subsequent
      // pages resume from the returned token and are always past the frontier.
      const recoveryFrontier = state.token === null ? state.oldestTs : undefined;
      const unindexedEvents =
        recoveryFrontier !== undefined
          ? newEvents.filter((ev) => ev.getTs() < recoveryFrontier)
          : newEvents;

      const events: IndexableEvent[] = [];
      for (const ev of unindexedEvents) {
        try {
          if (ev.getType() === 'm.room.encrypted') {
            // Still encrypted — re-use the live-indexing path which registers a
            // Decrypted listener so the event is indexed once keys arrive.
            indexEvent(ev, room);
          } else {
            const indexable = toIndexableEvent(ev, room.roomId);
            if (indexable) events.push(indexable);
          }
        } catch (e) {
          // Skip events that fail to process (e.g., media fetch errors, malformed content)
          // without aborting the entire backfill. Log for debugging.
          console.warn(
            `[search-index] Failed to index event ${ev.getId()} in room ${room.roomId}:`,
            e
          );
          Sentry.captureException(e, {
            level: 'warning',
            tags: { component: 'search-index', failure_stage: 'event_indexing' },
            extra: {
              eventId: ev.getId(),
              eventType: ev.getType(),
              roomId: room.roomId,
            },
          });
          continue;
        }
      }

      if (events.length > 0) {
        postToWorker({ type: 'INDEX_EVENTS', events });
      }

      const nextToken = headlessTimeline.getPaginationToken(Direction.Backward);
      const done = !hasMore || !nextToken;

      // Track the oldest event timestamp we've indexed so far. Only update when
      // we actually processed new events (unindexedEvents may be empty on the
      // first page of expired-token recovery while fast-forwarding the frontier).
      const minTsThisPage =
        unindexedEvents.length > 0 ? Math.min(...unindexedEvents.map((e) => e.getTs())) : undefined;
      const newOldestTs =
        minTsThisPage !== undefined
          ? Math.min(state.oldestTs ?? Infinity, minTsThisPage)
          : state.oldestTs;

      postToWorker({
        type: 'SET_BACKFILL_STATE',
        roomId: room.roomId,
        state: {
          token: nextToken,
          done,
          indexedCount: state.indexedCount + events.length,
          oldestTs: newOldestTs,
        },
      });

      if (!done) {
        // Schedule next page — but yield to the main sync if it's struggling.
        // resumeBackfill will restart this room once sync recovers.
        const nextState: BackfillState = {
          token: nextToken,
          done: false,
          indexedCount: state.indexedCount + events.length,
          oldestTs: newOldestTs,
        };
        const cancel = scheduleIdle(() => {
          const s = syncStateRef.current;
          if (s !== SyncState.Syncing && s !== SyncState.Prepared && s !== SyncState.Catchup) {
            backfillingRoomsRef.current.delete(room.roomId);
            backfillQueueRef.current.unshift({ room, state: nextState });
            return;
          }
          // On mobile, pause when the tab is hidden to avoid unnecessary
          // network traffic and WASM crypto work in the background.
          if (!HAS_IDLE_CALLBACK && document.visibilityState === 'hidden') {
            backfillingRoomsRef.current.delete(room.roomId);
            backfillQueueRef.current.unshift({ room, state: nextState });
            return;
          }
          void backfillRoom(room, nextState);
        });
        cancelIdlesRef.current.push(cancel);
      } else {
        backfillingRoomsRef.current.delete(room.roomId);
        // Dequeue the next room from the concurrency queue while under the limit
        while (
          backfillingRoomsRef.current.size < MAX_CONCURRENT_BACKFILLS &&
          backfillQueueRef.current.length > 0
        ) {
          const next = backfillQueueRef.current.shift()!;
          backfillingRoomsRef.current.add(next.room.roomId);
          const cancel = scheduleIdle(() => void backfillRoom(next.room, next.state));
          cancelIdlesRef.current.push(cancel);
        }
        if (backfillingRoomsRef.current.size === 0 && backfillQueueRef.current.length === 0) {
          setIsBackfilling(false);
        }
      }
    },
    [mx, indexEvent, postToWorker]
  );

  /**
   * Dequeue rooms from the backfill queue up to the concurrency limit.
   * Skips when the Matrix sync is not healthy so the /sync connection is
   * never starved by background pagination requests.
   */
  const resumeBackfill = useCallback(() => {
    // Don't start until the startup grace period has elapsed.
    if (!backfillReadyRef.current) return;
    const s = syncStateRef.current;
    if (s !== SyncState.Syncing && s !== SyncState.Prepared && s !== SyncState.Catchup) return;

    while (
      backfillingRoomsRef.current.size < MAX_CONCURRENT_BACKFILLS &&
      backfillQueueRef.current.length > 0
    ) {
      const next = backfillQueueRef.current.shift()!;
      backfillingRoomsRef.current.add(next.room.roomId);
      const cancel = scheduleIdle(() => void backfillRoom(next.room, next.state));
      cancelIdlesRef.current.push(cancel);
    }
  }, [backfillRoom]);

  const startBackfill = useCallback(
    (backfillStates: Record<string, BackfillState>) => {
      backfillStatesRef.current = backfillStates;
      const rooms = mx.getRooms().filter((r) => !r.isSpaceRoom());

      // Enqueue all unfinished rooms that are not already active
      for (const room of rooms) {
        const state = backfillStates[room.roomId] ?? {
          token: null,
          done: false,
          indexedCount: 0,
        };
        if (state.done) continue;
        if (backfillingRoomsRef.current.has(room.roomId)) continue;
        if (backfillQueueRef.current.some((e) => e.room.roomId === room.roomId)) continue;

        backfillQueueRef.current.push({ room, state });
      }

      if (backfillQueueRef.current.length > 0 || backfillingRoomsRef.current.size > 0) {
        setIsBackfilling(true);
      }
      // Delay the first backfill pass so the initial sync and room list have
      // time to settle before we start paginating history.
      backfillStartDelayRef.current = setTimeout(() => {
        backfillStartDelayRef.current = null;
        backfillReadyRef.current = true;
        resumeBackfill();
      }, BACKFILL_STARTUP_DELAY_MS);
    },
    [mx, resumeBackfill]
  );

  // ── Worker message handler ─────────────────────────────────────────────────

  const handleWorkerMessage = useCallback(
    (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case 'READY':
          setIsReady(true);
          // Request backfill states, then start background fill
          postToWorker({ type: 'GET_BACKFILL_STATES' });
          break;

        case 'BACKFILL_STATES':
          startBackfill(msg.states);
          break;

        case 'QUERY_RESULT': {
          const pending = pendingQueriesRef.current.get(msg.id);
          if (pending) {
            pendingQueriesRef.current.delete(msg.id);
            pending.resolve(msg.events);
          }
          break;
        }

        case 'STATS': {
          const pending = pendingStatsRef.current;
          if (pending) {
            pendingStatsRef.current = null;
            pending.resolve({
              indexedEventCount: msg.indexedEventCount,
              roomCount: msg.roomCount,
              estimatedBytes: msg.estimatedBytes,
              backfillingRoomCount: pending.backfillingRoomCount,
            });
          }
          break;
        }

        case 'ERROR':
          // eslint-disable-next-line no-console
          console.error('[SearchIndex worker error]', msg.message);
          break;

        default:
          break;
      }
    },
    [postToWorker, startBackfill]
  );

  // ── Worker lifecycle ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!idbSearchIndex) {
      setIsReady(false);
      return () => {};
    }

    const userId = mx.getUserId();
    if (!userId) return () => {};

    Sentry.addBreadcrumb({
      category: 'search.index',
      message: 'Initializing search worker',
      level: 'info',
      data: { userId, maxMessagesPerRoom: searchIndexMessageLimit },
    });

    let worker: Worker;
    try {
      worker = new Worker(
        new URL('../plugins/search-worker/searchWorker.ts', import.meta.url),
        { type: 'module' }
      );
    } catch (e) {
      // Worker failed to load — likely a missing or mis-served asset (404 → HTML)
      const errorMsg = `Search worker failed to instantiate: ${e instanceof Error ? e.message : String(e)}`;
      setInitError(errorMsg);
      Sentry.captureException(e, {
        level: 'error',
        tags: { component: 'search-index', failure_stage: 'worker_instantiation' },
        extra: { userId, maxMessagesPerRoom: searchIndexMessageLimit },
      });
      return () => {};
    }

    workerRef.current = worker;
    worker.addEventListener('message', handleWorkerMessage);

    // Handle worker runtime errors (e.g., MIME type errors from failed imports)
    const handleWorkerError = (error: ErrorEvent) => {
      // Null-check error.message — it may be undefined on ErrorEvent (SABLE-52)
      const message = error?.message ?? '';
      const errorMsg = `Search worker runtime error: ${message || 'Unknown worker error'}`;
      const isMimeError = message.includes('MIME') && message.includes('text/html');

      setInitError(errorMsg);
      setIsReady(false);
      Sentry.captureException(error.error || new Error(message || 'Unknown worker error'), {
        level: isMimeError ? 'warning' : 'error',
        tags: {
          component: 'search-index',
          failure_stage: 'worker_runtime',
          is_mime_error: isMimeError,
        },
        extra: {
          userId,
          maxMessagesPerRoom: searchIndexMessageLimit,
          filename: error.filename,
          lineno: error.lineno,
          colno: error.colno,
          likely_stale_cache: isMimeError,
        },
        contexts: {
          hint: {
            description: isMimeError
              ? 'Worker import failed with MIME error - likely stale cache referencing old assets or missing chunk'
              : 'Worker script runtime error',
          },
        },
      });
    };
    worker.addEventListener('error', handleWorkerError);

    // Set a timeout to detect if the worker never sends READY or ERROR (SABLE-54)
    const initTimeout = setTimeout(() => {
      setInitError('Worker initialization timed out (30s) — READY message never received');
      setIsReady(false);
      // Terminate the stuck worker so it doesn't consume resources
      worker.terminate();
      workerRef.current = null;
      Sentry.captureMessage('Search worker INIT timeout — READY message never received', {
        level: 'error',
        tags: { component: 'search-index' },
        extra: { userId, maxMessagesPerRoom: searchIndexMessageLimit },
      });
    }, 30000); // 30s timeout

    // Clear timeout when READY or ERROR arrives
    const originalHandler = handleWorkerMessage;
    const wrappedHandler = (event: MessageEvent<WorkerOutMessage>) => {
      if (event.data.type === 'READY' || event.data.type === 'ERROR') {
        clearTimeout(initTimeout);
        if (event.data.type === 'READY') {
          setInitError(null); // Clear any previous error only on successful READY
        }
      }
      originalHandler(event);
    };
    worker.removeEventListener('message', handleWorkerMessage);
    worker.addEventListener('message', wrappedHandler as EventListener);

    postToWorker({
      type: 'INIT',
      userId,
      maxMessagesPerRoom: searchIndexMessageLimit,
    } satisfies WorkerInMessage);

    // Seed sync state so backfill is correctly paused if the worker becomes
    // ready before the first PREPARED/SYNCING event fires.
    syncStateRef.current = mx.getSyncState();

    // When sync recovers, restart any rooms that were paused mid-backfill.
    const handleSync = (state: SyncState) => {
      syncStateRef.current = state;
      if (
        state === SyncState.Syncing ||
        state === SyncState.Prepared ||
        state === SyncState.Catchup
      ) {
        resumeBackfill();
      }
    };
    mx.on(ClientEvent.Sync, handleSync as unknown as (...args: unknown[]) => void);

    // Live indexing listener
    const handleTimeline = (mEvent: MatrixEvent, room: Room | undefined) => {
      if (!room) return;
      indexEvent(mEvent, room);
    };
    mx.on(RoomEvent.Timeline, handleTimeline as unknown as (...args: unknown[]) => void);

    // Enqueue rooms added by sliding sync after the initial startBackfill call.
    // Sliding sync starts with an initial window of 100 rooms; additional rooms
    // are received progressively as the list expands, firing ClientEvent.Room.
    const handleRoomAdded = (room: Room) => {
      if (room.isSpaceRoom()) return;
      if (backfillingRoomsRef.current.has(room.roomId)) return;
      if (backfillQueueRef.current.some((e) => e.room.roomId === room.roomId)) return;
      const state = backfillStatesRef.current[room.roomId] ?? {
        token: null,
        done: false,
        indexedCount: 0,
      };
      if (state.done) return;
      backfillQueueRef.current.push({ room, state });
      setIsBackfilling(true);
      resumeBackfill();
    };
    mx.on(ClientEvent.Room, handleRoomAdded as unknown as (...args: unknown[]) => void);

    // On mobile, resume backfill when the tab becomes visible again after being
    // hidden (backfill pauses when hidden to avoid unnecessary background work).
    const handleVisibilityChange = () => {
      if (!HAS_IDLE_CALLBACK && document.visibilityState === 'visible') {
        resumeBackfill();
      }
    };
    if (!HAS_IDLE_CALLBACK) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      // Ask the worker to flush before terminating. We wait up to 2 s then
      // force-terminate regardless so the cleanup never hangs.
      clearTimeout(initTimeout);
      worker.removeEventListener('message', wrappedHandler as EventListener);
      worker.removeEventListener('error', handleWorkerError);
      postToWorker({ type: 'FLUSH' });
      const terminateTimeout = setTimeout(() => {
        worker.terminate();
        workerRef.current = null;
      }, 2000);
      worker.addEventListener(
        'message',
        (ev: MessageEvent<WorkerOutMessage>) => {
          if (ev.data.type === 'FLUSH_DONE') {
            clearTimeout(terminateTimeout);
            worker.terminate();
            workerRef.current = null;
          }
        },
        { once: true }
      );
      setIsReady(false);
      setIsBackfilling(false);
      mx.removeListener(ClientEvent.Sync, handleSync as unknown as (...args: unknown[]) => void);
      mx.removeListener(
        RoomEvent.Timeline,
        handleTimeline as unknown as (...args: unknown[]) => void
      );
      mx.removeListener(
        ClientEvent.Room,
        handleRoomAdded as unknown as (...args: unknown[]) => void
      );
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Cancel the startup delay and reset the ready gate
      if (backfillStartDelayRef.current !== null) {
        clearTimeout(backfillStartDelayRef.current);
        backfillStartDelayRef.current = null;
      }
      backfillReadyRef.current = false;

      // Cancel all pending idle callbacks
      // eslint-disable-next-line react-hooks/exhaustive-deps -- mutable non-DOM refs, current is intentional at cleanup time
      const cancels = cancelIdlesRef.current;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- mutable non-DOM refs, current is intentional at cleanup time
      const backfillingRooms = backfillingRoomsRef.current;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- mutable non-DOM refs, current is intentional at cleanup time
      const headlessSets = headlessSetsRef.current;
      for (const cancel of cancels) cancel();
      cancelIdlesRef.current = [];
      backfillingRooms.clear();
      headlessSets.clear();
      backfillQueueRef.current = [];

      // Reject any in-flight search/stats promises so callers don't hang forever
      // eslint-disable-next-line react-hooks/exhaustive-deps -- mutable non-DOM refs, current is intentional at cleanup time
      const pendingQueries = pendingQueriesRef.current;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- mutable non-DOM refs, current is intentional at cleanup time
      const pendingStats = pendingStatsRef.current;
      for (const { reject } of pendingQueries.values()) {
        reject(new Error('Search index unmounted'));
      }
      pendingQueries.clear();
      if (pendingStats) {
        pendingStats.resolve({
          indexedEventCount: 0,
          roomCount: 0,
          estimatedBytes: 0,
          backfillingRoomCount: 0,
        });
        pendingStatsRef.current = null;
      }
    };
  }, [
    idbSearchIndex,
    mx,
    searchIndexMessageLimit,
    handleWorkerMessage,
    indexEvent,
    resumeBackfill,
    postToWorker,
  ]);

  // ── Public API ─────────────────────────────────────────────────────────────

  const query = useCallback(
    (
      term: string,
      opts?: { roomIds?: string[]; senders?: string[]; hasTypes?: string[]; exactMatch?: boolean }
    ): Promise<IndexableEvent[]> => {
      if (!workerRef.current || !isReady) return Promise.resolve([]);

      // Parse term for exact match (wrapped in double quotes)
      let searchTerm = term;
      let isExactMatch = opts?.exactMatch ?? false;

      if (!isExactMatch && term.startsWith('"') && term.endsWith('"') && term.length > 1) {
        // Strip quotes for exact match
        searchTerm = term.slice(1, -1);
        isExactMatch = true;
      }

      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        pendingQueriesRef.current.set(id, { resolve, reject });
        postToWorker({
          type: 'QUERY',
          id,
          term: searchTerm,
          roomIds: opts?.roomIds,
          senders: opts?.senders,
          hasTypes: opts?.hasTypes,
          exactMatch: isExactMatch,
        });
      });
    },
    [isReady, postToWorker]
  );

  const getStats = useCallback((): Promise<SearchIndexStats> => {
    if (!workerRef.current || !isReady) {
      return Promise.resolve({
        indexedEventCount: 0,
        roomCount: 0,
        estimatedBytes: 0,
        backfillingRoomCount: 0,
      });
    }
    return new Promise((resolve) => {
      pendingStatsRef.current = {
        backfillingRoomCount: backfillingRoomsRef.current.size,
        resolve,
      };
      postToWorker({ type: 'GET_STATS' });
    });
  }, [isReady, postToWorker]);

  const clearIndex = useCallback((): Promise<void> => {
    if (!workerRef.current) return Promise.resolve();
    postToWorker({ type: 'CLEAR_INDEX' });
    // Reset local state
    headlessSetsRef.current.clear();
    for (const cancel of cancelIdlesRef.current) cancel();
    cancelIdlesRef.current = [];
    backfillingRoomsRef.current.clear();
    setIsBackfilling(false);
    return Promise.resolve();
  }, [postToWorker]);

  const ctx = useMemo<SearchIndexCtx>(
    () => ({ query, getStats, clearIndex, isReady, isBackfilling }),
    [query, getStats, clearIndex, isReady, isBackfilling]
  );

  return <SearchIndexContext.Provider value={ctx}>{children}</SearchIndexContext.Provider>;
}
