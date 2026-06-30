import { useMatrixClient } from '$hooks/useMatrixClient';
import {
  SearchIndexContext,
  SearchIndexContextType,
  SearchIndexState,
} from '$hooks/useSearchIndex';
import {
  SearchIndexEvent,
  IndexWorkerMessageIn,
  WorkerMessageTypeIn,
  IndexWorkerMessageOut,
  WorkerMessageTypeOut,
  BackfillState,
} from '$plugins/search-indexer/types';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import {
  MatrixEvent,
  EventType,
  MatrixEventEvent,
  Room,
  EventTimelineSet,
  Direction,
  ClientEvent,
  RoomEvent,
  SyncState,
} from 'matrix-js-sdk';
import { ReactNode, useState, useRef, useCallback, useMemo, useEffect } from 'react';
import * as Sentry from '@sentry/react';
import CreateSearchWorker from '$plugins/search-indexer/index.ts?worker';
import { is } from 'immer/dist/internal.js';

const BACKFILL_PAGE_SIZE = 50;
const HAS_IDLE_CALLBACK = typeof requestIdleCallback === 'function';
let IDLE_CALLBACK_COUNT = 0;
const MAX_CONCURRENT_BACKFILLS = HAS_IDLE_CALLBACK ? Infinity : 2;
const BACKFILL_STARTUP_DELAY_MS = 30_000;

const canRunMobileBackfill = (): boolean =>
  HAS_IDLE_CALLBACK || (document.visibilityState === 'visible' && document.hasFocus());

function scheduleIdle(cb: () => void): () => void {
  if (HAS_IDLE_CALLBACK) {
    IDLE_CALLBACK_COUNT += 1;
    const id = requestIdleCallback(cb, { timeout: 5000 });
    return () => cancelIdleCallback(id);
  }

  const id = setTimeout(cb, 500);
  return () => clearTimeout(id);
}

const MEDIA_MSGTYPES = ['m.image', 'm.file', 'm.audio', 'm.video'];

function toSearchIndexEvent(event: MatrixEvent, replaced: boolean = false): SearchIndexEvent | null {
  const eventId = event.getId();
  if (!eventId) return null;

  const roomId = event.getRoomId();
  if (!roomId) return null;

  if (event.getType() !== EventType.RoomMessage) return null;
  if (event.isRedacted()) return null;

  const content = event.getContent();

  const body: string = (replaced ? event.getContent()["m.new_content"]?.body : content.body) ?? '';
  if (!body.trim()) return null;

  const sender = event.getSender();
  if (!sender) return null;

  const msgtype = content.msgtype ?? 'm.text';
  const ts = event.getTs();
  const hasLink =  /https?:\/\//i.test(body) 

  const searchIndexEvent: SearchIndexEvent = { eventId, roomId, sender, msgtype, body, ts, hasLink };

  if (MEDIA_MSGTYPES.includes(msgtype)) {
    if (content.url !== undefined) searchIndexEvent.url = content.url;
    if (content.file !== undefined) searchIndexEvent.file = content.file;
    if (content.info !== undefined) searchIndexEvent.info = content.info;
    if (content.filename !== undefined) searchIndexEvent.filename = content.filename;
  }
  return searchIndexEvent;
}

type PendingStats = {
  resolve: (stats: SearchIndexState) => void;
  backfillingRoomCount: number;
};
type PendingQuery = {
  resolve: (events: SearchIndexEvent[]) => void;
  reject: (err: unknown) => void;
};

export function SearchIndexProvider({ children }: { children: ReactNode }) {
  const mx = useMatrixClient();
  const [idbSearchIndex] = useSetting(settingsAtom, 'idbSearchIndex');

  const [isReady, setIsReady] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const pendingStatsRef = useRef<PendingStats | null>(null);
  const pendingQueriesRef = useRef<Map<string, PendingQuery>>(new Map());

  const postToWorker = useCallback((msg: IndexWorkerMessageIn) => {
    workerRef.current?.postMessage(msg);
  }, []);

  const headlessSetsRef = useRef<Map<string, EventTimelineSet>>(new Map());
  const cancelIdlesRef = useRef<Array<() => void>>([]);
  const syncStateRef = useRef<SyncState | null>(null);

  const backfillQueueRef = useRef<Array<{ room: Room; state: BackfillState }>>([]);
  const backfillStatesRef = useRef<Record<string, BackfillState>>({});
  const backfillingRoomsRef = useRef<Set<string>>(new Set()); // TODO: I dont like this
  const backfillStartDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backfillReadyRef = useRef(false);

  const indexEvent = useCallback(
    (event: MatrixEvent) => {
      const handleEvent = () => {
        const searchEvent = toSearchIndexEvent(event);
        if (searchEvent)
          postToWorker({
            type: WorkerMessageTypeIn.Index,
            events: [searchEvent],
          });
      };

      if (event.getType() === 'm.room.encrypted') {
        event.once(MatrixEventEvent.Decrypted, handleEvent);
      } 
      else if (event.isSending()) {
        event.once(MatrixEventEvent.LocalEventIdReplaced, handleEvent)
      }
      else {
        handleEvent();
      }
    },
    [postToWorker]
  );

  const backfillRoom = useCallback(async (room: Room, state: BackfillState) => {
    if (state.done) return;

    if (!canRunMobileBackfill()) {
      backfillingRoomsRef.current.delete(room.roomId);
      backfillQueueRef.current.unshift({ room, state });
      Sentry.addBreadcrumb({
        category: 'search.backfill',
        message: `Backfill deferred for room ${room.roomId}`,
        data: {
          reason: 'mobile_not_focused',
          isMobile: !HAS_IDLE_CALLBACK,
          visibilityState: document.visibilityState,
          focused: document.hasFocus(),
        },
        level: 'info',
      });
      return;
    }

    let headlessSet = headlessSetsRef.current.get(room.roomId);
    if (!headlessSet) {
      headlessSet = new EventTimelineSet(room, {});
      headlessSetsRef.current.set(room.roomId, headlessSet);
    }
    const headlessTimeline = headlessSet.getLiveTimeline();

    const seedToken = state.token ?? room.getLiveTimeline().getPaginationToken(Direction.Backward);
    if (!seedToken) {
      postToWorker({
        type: WorkerMessageTypeIn.SetBackfillState,
        roomId: room.roomId,
        state: { ...state, done: true },
      });
      backfillingRoomsRef.current.delete(room.roomId);
      return;
    }

    headlessTimeline.setPaginationToken(seedToken, Direction.Backward);

    const prevEventCount = headlessTimeline.getEvents().length;

    let hasMore = false;
    try {
      hasMore = await mx.paginateEventTimeline(headlessTimeline, {
        backwards: true,
        limit: BACKFILL_PAGE_SIZE,
      });
    } catch {
      backfillingRoomsRef.current.delete(room.roomId);
    }

    const allEvents = headlessTimeline.getEvents();
    const newEvents = allEvents.slice(0, allEvents.length - prevEventCount);

    const recoveryFrontier = state.token === null ? state.oldestTs : undefined;
    const unindexedEvents =
      recoveryFrontier !== undefined
        ? newEvents.filter((ev) => ev.getTs() < recoveryFrontier)
        : newEvents;

    const events: SearchIndexEvent[] = [];
    for (const ev of unindexedEvents) {
      try {
        const relatesTo = ev.getContent()?.['m.relates_to'];
        if (relatesTo?.rel_type === 'm.thread' || ev.isRedacted()) {
          continue;
        }

        if (ev.getType() === 'm.room.encrypted') {
          indexEvent(ev);
        } else {
          const indexable = toSearchIndexEvent(ev);
          if (indexable) events.push(indexable);
        }
      } catch (e) {
        continue;
      }
    }

    if (events.length > 0) {
      postToWorker({ type: WorkerMessageTypeIn.Index, events });
    }

    const nextToken = headlessTimeline.getPaginationToken(Direction.Backward);
    const done = !hasMore && !nextToken;

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
      type: WorkerMessageTypeIn.SetBackfillState,
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
          Sentry.addBreadcrumb({
            category: 'search.backfill',
            message: `Backfill deferred for room ${room.roomId}`,
            data: { reason: 'sync_not_healthy', syncState: s },
            level: 'info',
          });
          return;
        }

        if (!canRunMobileBackfill()) {
          backfillingRoomsRef.current.delete(room.roomId);
          backfillQueueRef.current.unshift({ room, state: nextState });
          Sentry.addBreadcrumb({
            category: 'search.backfill',
            message: `Backfill deferred for room ${room.roomId}`,
            data: {
              reason: 'mobile_not_focused',
              isMobile: !HAS_IDLE_CALLBACK,
              visibilityState: document.visibilityState,
              focused: document.hasFocus(),
            },
            level: 'info',
          });
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
  }, []);

  const resumeBackfill = useCallback(() => {
    if (!backfillReadyRef.current) return;
    const s = syncStateRef.current;
    if (s !== SyncState.Syncing && s !== SyncState.Prepared && s !== SyncState.Catchup) return;
    if (!canRunMobileBackfill()) return;

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

      backfillStartDelayRef.current = setTimeout(() => {
        backfillStartDelayRef.current = null;
        backfillReadyRef.current = true;
        resumeBackfill();
      }, BACKFILL_STARTUP_DELAY_MS);
    },
    [mx, resumeBackfill]
  );

  const handleWorkerMessage = useCallback((event: MessageEvent<IndexWorkerMessageOut>) => {
    const msg = event.data;

    switch (msg.type) {
      case WorkerMessageTypeOut.Ready:
        setIsReady(true);
        postToWorker({ type: WorkerMessageTypeIn.GetBackfillStates });
        break;
      case WorkerMessageTypeOut.State:
        const pending = pendingStatsRef.current;
        if (pending) {
          pendingStatsRef.current = null;
          pending.resolve({
            indexedEventsCount: msg.indexedEventCount,
            roomCount: msg.roomCount,
            backfillingRoomCount: pending.backfillingRoomCount,
          });
        }
        break;
      case WorkerMessageTypeOut.QueryResult:
        const pendingQuery = pendingQueriesRef.current.get(msg.id);
        if (pendingQuery) {
          pendingQueriesRef.current.delete(msg.id);
          pendingQuery.resolve(msg.events);
        }
        break;
      case WorkerMessageTypeOut.BackfillStatesDone:
        startBackfill(msg.states);
        break;
    }
  }, []);

  useEffect(() => {
    if (!idbSearchIndex) {
      setIsReady(false);
      return () => {};
    }
    let worker: Worker;
    try {
      Sentry.addBreadcrumb({
        category: 'search.index',
        message: 'Initializing search worker',
        level: 'info',
      });
      worker = new CreateSearchWorker();
    } catch (e) {
      console.error('Error!');
      return () => {};
    }

    const userId = mx.getUserId();
    if (!userId) return () => {};

    Sentry.addBreadcrumb({
      category: 'search.index',
      message: 'Initializing search worker',
      level: 'info',
      data: { userId },
    });

    workerRef.current = worker;
    worker.addEventListener('message', handleWorkerMessage);

    Sentry.addBreadcrumb({
      category: 'search.index',
      message: 'INIT sent to worker',
      level: 'info',
      data: { userId },
    });

    postToWorker({
      type: WorkerMessageTypeIn.Init,
      userId,
    });

    const handleSync = (state: SyncState) => {
      syncStateRef.current = state;
      if (
        state === SyncState.Syncing
      ) {
        resumeBackfill();
      }
    };
    mx.on(ClientEvent.Sync, handleSync as unknown as (...args: unknown[]) => void);

    const handleTimeline = (mEvent: MatrixEvent, room: Room | undefined) => {
      const relation = mEvent.getRelation();

      if (relation && relation.rel_type === "m.replace") {
        const targetEventId = relation.event_id;
        if (!targetEventId) return;
        const searchEvent = toSearchIndexEvent(mEvent, true);
        if (!searchEvent) return;

        postToWorker({
          type: WorkerMessageTypeIn.EditEvents,
          events: {
            [targetEventId]: searchEvent
          }
        })
        return;
      }

      if (!room) return;
      indexEvent(mEvent);
    };
    mx.on(RoomEvent.Timeline, handleTimeline);

    const handleRedaction = (mEvent: MatrixEvent) => {
      if (mEvent.getType() !== EventType.RoomRedaction) return;
      let eventId = mEvent.event.redacts;
      if (!eventId) return;

      postToWorker({
        type: WorkerMessageTypeIn.RedactEvents,
        eventIds: [eventId]
      })
    };
    mx.on(RoomEvent.Redaction, handleRedaction);
    
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
    mx.on(ClientEvent.Room, handleRoomAdded);

    const handleForegroundFocus = () => {
      if (canRunMobileBackfill()) {
        resumeBackfill();
      }
    };
    if (!HAS_IDLE_CALLBACK) {
      document.addEventListener('visibilitychange', handleForegroundFocus);
      window.addEventListener('focus', handleForegroundFocus);
      window.addEventListener('pageshow', handleForegroundFocus);
    }

const handleOnBeforeUnload = () => {
           postToWorker({ type: WorkerMessageTypeIn.Flush });

      worker.addEventListener(
        'message',
        (ev: MessageEvent<IndexWorkerMessageOut>) => {
          if (ev.data.type === WorkerMessageTypeOut.FlushDone) {
            worker.removeEventListener('message', handleWorkerMessage);
            worker.terminate();
            workerRef.current = null;
          }
        },
        { once: true }
      );
}

  window.addEventListener('beforeunload', handleOnBeforeUnload);

    return () => {
      mx.removeListener(ClientEvent.Sync, handleSync);
      mx.removeListener(
        RoomEvent.Timeline,
        handleTimeline
      );
      mx.removeListener(
        ClientEvent.Room,
        handleRoomAdded
      );
      mx.removeListener(RoomEvent.Redaction, handleRedaction)
      worker.removeEventListener('message', handleWorkerMessage);
      //   worker.removeEventListener('error', handleWorkerError);
          window.removeEventListener('beforeunload', handleOnBeforeUnload);

      setIsReady(false);
      setIsBackfilling(false);
    };
  }, [idbSearchIndex, mx, handleWorkerMessage, indexEvent, postToWorker]);

  const query = useCallback(
    (
      term: string,
      opts?: { roomIds?: string[]; senders?: string[]; hasTypes?: string[] }
    ): Promise<SearchIndexEvent[]> => {
      if (!workerRef.current || !isReady) return Promise.resolve([]);
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        pendingQueriesRef.current.set(id, { resolve, reject });
        postToWorker({
          type: WorkerMessageTypeIn.Query,
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

  const state = useCallback((): Promise<SearchIndexState> => {
    if (!workerRef.current || !isReady) {
      return Promise.resolve({
        indexedEventsCount: 0,
        roomCount: 0,
        backfillingRoomCount: 0,
      });
    }
    return new Promise((resolve) => {
      pendingStatsRef.current = {
        backfillingRoomCount: backfillingRoomsRef.current.size,
        resolve,
      };
      postToWorker({ type: WorkerMessageTypeIn.State });
    });
  }, [isReady, postToWorker]);

  const clearIndex = () => {};

  const ctx = useMemo<SearchIndexContextType>(
    () => ({ query, state, clearIndex, isBackfilling, ready: isReady }),
    [query, state, clearIndex, isReady, isBackfilling]
  );

  return <SearchIndexContext.Provider value={ctx}>{children}</SearchIndexContext.Provider>;
}
