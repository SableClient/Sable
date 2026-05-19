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
 * Maximum number of rooms whose backfill pagination may run concurrently.
 * Keeping this small prevents flooding the HTTP connection pool (and starving
 * the /sync long-poll) on low-bandwidth or constrained devices such as iOS.
 */
const MAX_CONCURRENT_BACKFILLS = 2;

function scheduleIdle(cb: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(cb, { timeout: 5000 });
    return () => cancelIdleCallback(id);
  }
  // iOS Safari does not support requestIdleCallback — use a longer delay so the
  // sync connection is not starved by rapid back-to-back pagination requests.
  const id = setTimeout(cb, 1000);
  return () => clearTimeout(id);
}

// ── Event conversion ──────────────────────────────────────────────────────────

function toIndexableEvent(mEvent: MatrixEvent, roomId: string): IndexableEvent | null {
  const eventId = mEvent.getId();
  if (!eventId) return null;
  // Skip still-encrypted and redacted events
  if (mEvent.getType() === 'm.room.encrypted') return null;
  if (mEvent.getType() !== (EventType.RoomMessage as string)) return null;
  if (mEvent.isRedacted()) return null;
  const content = mEvent.getContent<{ body?: string; msgtype?: string }>();
  const body: string = content.body ?? '';
  if (!body.trim()) return null;
  const sender = mEvent.getSender();
  if (!sender) return null;
  const msgtype = content.msgtype ?? 'm.text';
  return { eventId, roomId, sender, msgtype, body, ts: mEvent.getTs() };
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

  const postToWorker = useCallback((msg: WorkerInMessage) => {
    // oxlint-disable-next-line require-post-message-target-origin -- Worker.postMessage has no targetOrigin
    workerRef.current?.postMessage(msg);
  }, []);

  // ── Live indexing ──────────────────────────────────────────────────────────

  const indexEvent = useCallback(
    (mEvent: MatrixEvent, room: Room) => {
      const handleDecrypted = () => {
        const ev = toIndexableEvent(mEvent, room.roomId);
        if (ev) postToWorker({ type: 'INDEX_EVENTS', events: [ev] });
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

      let hasMore = false;
      try {
        hasMore = await mx.paginateEventTimeline(headlessTimeline, {
          backwards: true,
          limit: BACKFILL_PAGE_SIZE,
        });
      } catch {
        // Pagination error — stop this room for now
        backfillingRoomsRef.current.delete(room.roomId);
        return;
      }

      // Collect decrypted events from the headless timeline
      const events = headlessTimeline
        .getEvents()
        .map((ev) => toIndexableEvent(ev, room.roomId))
        .filter((ev): ev is IndexableEvent => ev !== null);

      if (events.length > 0) {
        postToWorker({ type: 'INDEX_EVENTS', events });
      }

      const nextToken = headlessTimeline.getPaginationToken(Direction.Backward);
      const done = !hasMore || !nextToken;

      postToWorker({
        type: 'SET_BACKFILL_STATE',
        roomId: room.roomId,
        state: {
          token: nextToken,
          done,
          indexedCount: state.indexedCount + events.length,
        },
      });

      if (!done) {
        // Schedule next page — but yield to the main sync if it's struggling.
        // resumeBackfill will restart this room once sync recovers.
        const nextState: BackfillState = {
          token: nextToken,
          done: false,
          indexedCount: state.indexedCount + events.length,
        };
        const cancel = scheduleIdle(() => {
          const s = syncStateRef.current;
          if (s !== SyncState.Syncing && s !== SyncState.Prepared && s !== SyncState.Catchup) {
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
    [mx, postToWorker]
  );

  /**
   * Dequeue rooms from the backfill queue up to the concurrency limit.
   * Skips when the Matrix sync is not healthy so the /sync connection is
   * never starved by background pagination requests.
   */
  const resumeBackfill = useCallback(() => {
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
      resumeBackfill();
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
      return;
    }

    const userId = mx.getUserId();
    if (!userId) return;

    const worker = new Worker(
      new URL('../plugins/search-worker/searchWorker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;
    worker.addEventListener('message', handleWorkerMessage);

    // oxlint-disable-next-line require-post-message-target-origin -- Worker.postMessage has no targetOrigin
    worker.postMessage({
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
      if (state === SyncState.Syncing || state === SyncState.Prepared || state === SyncState.Catchup) {
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

    return () => {
      worker.removeEventListener('message', handleWorkerMessage);
      worker.terminate();
      workerRef.current = null;
      setIsReady(false);
      setIsBackfilling(false);
      mx.removeListener(ClientEvent.Sync, handleSync as unknown as (...args: unknown[]) => void);
      mx.removeListener(
        RoomEvent.Timeline,
        handleTimeline as unknown as (...args: unknown[]) => void
      );

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
    };
  }, [idbSearchIndex, mx, searchIndexMessageLimit, handleWorkerMessage, indexEvent, resumeBackfill]);

  // ── Public API ─────────────────────────────────────────────────────────────

  const query = useCallback(
    (
      term: string,
      opts?: { roomIds?: string[]; senders?: string[]; hasTypes?: string[] }
    ): Promise<IndexableEvent[]> => {
      if (!workerRef.current || !isReady) return Promise.resolve([]);
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        pendingQueriesRef.current.set(id, { resolve, reject });
        postToWorker({
          type: 'QUERY',
          id,
          term,
          roomIds: opts?.roomIds,
          senders: opts?.senders,
          hasTypes: opts?.hasTypes,
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
