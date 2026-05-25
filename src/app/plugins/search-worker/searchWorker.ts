/**
 * searchWorker.ts — Web Worker that owns the MiniSearch index and IndexedDB persistence.
 *
 * Vite instantiation (main thread):
 *   new Worker(new URL('./searchWorker.ts', import.meta.url), { type: 'module' })
 */

import MiniSearch from 'minisearch';
import type { IndexableEvent, BackfillState, WorkerInMessage, WorkerOutMessage } from './types';

// ── IDB helpers ─────────────────────────────────────────────────────────────

function openDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 3);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;
      if (oldVersion < 1) {
        db.createObjectStore('index');
        db.createObjectStore('backfill');
      }
      // v2: added msgtype to stored fields
      if (oldVersion >= 1 && oldVersion < 2) {
        db.deleteObjectStore('index');
        db.deleteObjectStore('backfill');
        db.createObjectStore('index');
        db.createObjectStore('backfill');
      }
      // v3: added url/file/info/filename to stored fields for media events
      if (oldVersion >= 2 && oldVersion < 3) {
        db.deleteObjectStore('index');
        db.deleteObjectStore('backfill');
        db.createObjectStore('index');
        db.createObjectStore('backfill');
      }
    };
    req.addEventListener('success', () => resolve(req.result));
    req.addEventListener('error', () => reject(req.error));
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.addEventListener('success', () => resolve(req.result as T | undefined));
    req.addEventListener('error', () => reject(req.error));
  });
}

function idbPut(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value, key);
    req.addEventListener('success', () => resolve());
    req.addEventListener('error', () => reject(req.error));
  });
}

function idbGetAll(db: IDBDatabase, store: string): Promise<{ key: string; value: unknown }[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const results: { key: string; value: unknown }[] = [];
    const keysReq = tx.objectStore(store).openCursor();
    keysReq.addEventListener('success', () => {
      const cursor = keysReq.result;
      if (cursor) {
        results.push({ key: cursor.key as string, value: cursor.value as unknown });
        cursor.continue();
      } else {
        resolve(results);
      }
    });
    keysReq.addEventListener('error', () => reject(keysReq.error));
  });
}

function idbClear(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).clear();
    req.addEventListener('success', () => resolve());
    req.addEventListener('error', () => reject(req.error));
  });
}

// ── Worker state ─────────────────────────────────────────────────────────────

let db: IDBDatabase | null = null;
let index: MiniSearch<IndexableEvent> | null = null;
let maxMessagesPerRoom = 2000;

/**
 * Per-room queue of [eventId, ts] sorted ascending by ts.
 * Used for LRU eviction when the per-room limit is exceeded.
 */
const roomQueues = new Map<string, Array<[eventId: string, ts: number]>>();

/**
 * Parallel store of all indexed documents, keyed by eventId.
 * Maintained alongside the MiniSearch index to avoid relying on
 * private MiniSearch internals (_storedFields) for full-scan queries.
 */
const storedDocs = new Map<string, IndexableEvent>();

/** Dirty flag — index changed since last flush */
let dirty = false;

const FLUSH_DEBOUNCE_MS = 5000;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function makeIndex(): MiniSearch<IndexableEvent> {
  return new MiniSearch<IndexableEvent>({
    idField: 'eventId',
    fields: ['body', 'sender'],
    storeFields: [
      'eventId',
      'roomId',
      'sender',
      'msgtype',
      'ts',
      'body',
      'url',
      'file',
      'info',
      'filename',
    ],
    searchOptions: {
      boost: { body: 2 },
      fuzzy: 0.2,
      prefix: true,
      combineWith: 'AND',
    },
  });
}

function post(msg: WorkerOutMessage): void {
  // oxlint-disable-next-line require-post-message-target-origin -- Worker.postMessage has no targetOrigin
  self.postMessage(msg);
}

function scheduleFlush(): void {
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushIndex();
  }, FLUSH_DEBOUNCE_MS);
}

async function flushIndex(): Promise<void> {
  if (!db || !index || !dirty) return;
  try {
    const doFlush = async () => {
      if (!db || !index) return;
      // Persist serialized MiniSearch
      await idbPut(db, 'index', 'v1', JSON.stringify(index));
      // Persist room queues for reconstruction on next load
      const roomQueuesData: Record<string, Array<[string, number]>> = {};
      for (const [roomId, queue] of roomQueues.entries()) {
        roomQueuesData[roomId] = queue;
      }
      await idbPut(db, 'index', 'rooms', roomQueuesData);
      dirty = false;
    };
    if ('locks' in navigator) {
      await navigator.locks.request('sable-search-index-writer', { mode: 'exclusive' }, doFlush);
    } else {
      await doFlush();
    }
  } catch {
    // Non-fatal: will retry on next flush
  }
}

// ── Eviction (oldest-first per room) ──────────────────────────────────────────

function evictOldestForRoom(roomId: string): void {
  if (!index) return;
  const queue = roomQueues.get(roomId);
  if (!queue) return;
  const excess = queue.length - maxMessagesPerRoom;
  if (excess <= 0) return;

  const toRemove = queue.splice(0, excess);
  for (const [eventId] of toRemove) {
    index.discard(eventId);
    storedDocs.delete(eventId);
  }
}

// ── Message handler ────────────────────────────────────────────────────────

/** Iterate every document stored in the index using the parallel storedDocs map. */
function iterateStoredDocs(): IterableIterator<IndexableEvent> {
  return storedDocs.values();
}

/** Matrix msgtype for each SearchHasType chip. */
const HAS_TYPE_TO_MSGTYPE: Record<string, string> = {
  image: 'm.image',
  file: 'm.file',
  audio: 'm.audio',
  video: 'm.video',
};

function makeTypeFilter(hasTypes: string[] | undefined): ((ev: IndexableEvent) => boolean) | null {
  if (!hasTypes || hasTypes.length === 0) return null;
  const allowedMsgtypes = new Set(hasTypes.map((t) => HAS_TYPE_TO_MSGTYPE[t]).filter(Boolean));
  const needsLink = hasTypes.includes('link');
  return (ev: IndexableEvent) => {
    if (allowedMsgtypes.has(ev.msgtype)) return true;
    if (needsLink && /https?:\/\//i.test(ev.body)) return true;
    return false;
  };
}

// Instrument IDB connection lifecycle
function instrumentIDB(idb: IDBDatabase, dbName: string): void {
  idb.addEventListener('close', () => {
    // eslint-disable-next-line no-console
    console.error(`[SearchWorker] IDB connection closed unexpectedly: ${dbName}`);
    postMessage({
      type: '_sentry_breadcrumb',
      category: 'idb',
      message: 'IDB connection closed unexpectedly',
      data: { dbName, version: idb.version },
      level: 'error',
    });
  });
  
  idb.addEventListener('versionchange', (event: IDBVersionChangeEvent) => {
    // eslint-disable-next-line no-console
    console.warn(`[SearchWorker] IDB version change requested: ${dbName}`, event.oldVersion, event.newVersion);
    postMessage({
      type: '_sentry_breadcrumb',
      category: 'idb',
      message: 'IDB version change requested',
      data: { dbName, oldVersion: event.oldVersion, newVersion: event.newVersion },
      level: 'warning',
    });
  });
}

async function handleInit(userId: string, maxPerRoom: number): Promise<void> {
  post({
    type: '_sentry_breadcrumb',
    category: 'search.worker',
    message: 'Worker received INIT message',
    level: 'info',
    data: { userId, maxPerRoom },
  });

  maxMessagesPerRoom = maxPerRoom;
  const dbName = `sable-search-${userId}`;

  post({
    type: '_sentry_breadcrumb',
    category: 'search.worker',
    message: 'Opening IDB',
    level: 'info',
    data: { dbName },
  });

  try {
    db = await openDb(dbName);
  } catch (err: unknown) {
    post({
      type: '_sentry_breadcrumb',
      category: 'search.worker',
      message: 'IDB open failed',
      level: 'error',
      data: {
        dbName,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }

  post({
    type: '_sentry_breadcrumb',
    category: 'search.worker',
    message: 'IDB opened successfully',
    level: 'info',
    data: { dbName, version: db.version },
  });

  instrumentIDB(db, dbName);

  post({
    type: '_sentry_breadcrumb',
    category: 'search.worker',
    message: 'Loading serialized index from IDB',
    level: 'info',
  });

  const serialized = await idbGet<string>(db, 'index', 'v1');
  if (serialized) {
    post({
      type: '_sentry_breadcrumb',
      category: 'search.worker',
      message: 'Found persisted index, deserializing',
      level: 'info',
      data: { sizeBytes: serialized.length * 2 },
    });
    try {
      index = MiniSearch.loadJSON(serialized, {
        idField: 'eventId',
        fields: ['body', 'sender'],
        storeFields: [
          'eventId',
          'roomId',
          'sender',
          'msgtype',
          'ts',
          'body',
          'url',
          'file',
          'info',
          'filename',
        ],
        searchOptions: {
          boost: { body: 2 },
          fuzzy: 0.2,
          prefix: true,
          combineWith: 'AND',
        },
      });
      post({
        type: '_sentry_breadcrumb',
        category: 'search.worker',
        message: 'Index deserialized successfully',
        level: 'info',
        data: { documentCount: index.documentCount },
      });

      // Rebuild room queues and storedDocs from persisted data.
      // storedDocs must be repopulated so that chip-only queries (e.g. image
      // filter with no text term) can scan events from previous sessions.
      post({
        type: '_sentry_breadcrumb',
        category: 'search.worker',
        message: 'Loading room queues',
        level: 'info',
      });

      const savedQueues = await idbGet<Record<string, Array<[string, number]>>>(
        db,
        'index',
        'rooms'
      );
      if (savedQueues) {
        const roomCount = Object.keys(savedQueues).length;
        post({
          type: '_sentry_breadcrumb',
          category: 'search.worker',
          message: 'Rebuilding room queues and storedDocs',
          level: 'info',
          data: { roomCount },
        });

        for (const [roomId, queue] of Object.entries(savedQueues)) {
          roomQueues.set(roomId, queue);
          for (const [eventId] of queue) {
            const fields = index.getStoredFields(eventId);
            if (fields) {
              storedDocs.set(eventId, fields as unknown as IndexableEvent);
            }
          }
        }

        post({
          type: '_sentry_breadcrumb',
          category: 'search.worker',
          message: 'Room queues rebuilt',
          level: 'info',
          data: {
            roomCount: roomQueues.size,
            storedDocsCount: storedDocs.size,
          },
        });
      } else {
        post({
          type: '_sentry_breadcrumb',
          category: 'search.worker',
          message: 'No persisted room queues found',
          level: 'info',
        });
      }
    } catch (err: unknown) {
      post({
        type: '_sentry_breadcrumb',
        category: 'search.worker',
        message: 'Failed to deserialize index, creating new',
        level: 'warning',
        data: {
          error: err instanceof Error ? err.message : String(err),
        },
      });
      index = makeIndex();
    }
  } else {
    post({
      type: '_sentry_breadcrumb',
      category: 'search.worker',
      message: 'No persisted index found, creating new',
      level: 'info',
    });
    index = makeIndex();
  }

  post({
    type: '_sentry_breadcrumb',
    category: 'search.worker',
    message: 'Sending READY message',
    level: 'info',
    data: {
      indexedEventCount: index.documentCount,
      roomCount: roomQueues.size,
    },
  });

  post({
    type: 'READY',
    indexedEventCount: index.documentCount,
    roomCount: roomQueues.size,
  });
}

function handleIndexEvents(events: IndexableEvent[]): void {
  if (!index) return;

  for (const ev of events) {
    const body = typeof ev.body === 'string' ? ev.body : String(ev.body ?? '');
    if (!ev.eventId || !body.trim()) continue;

    // Skip duplicates already in the index
    if (index.has(ev.eventId)) continue;

    index.add(ev);
    storedDocs.set(ev.eventId, ev);
    let queue = roomQueues.get(ev.roomId);
    if (!queue) {
      queue = [];
      roomQueues.set(ev.roomId, queue);
    }
    // Insert in ts-ascending order (most backfill arrives in order, so push is common)
    const lastEntry = queue[queue.length - 1];
    if (queue.length === 0 || (lastEntry !== undefined && lastEntry[1] <= ev.ts)) {
      queue.push([ev.eventId, ev.ts]);
    } else {
      // Binary search insertion for out-of-order events
      let lo = 0;
      let hi = queue.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        const midEntry = queue[mid];
        if (midEntry !== undefined && midEntry[1] <= ev.ts) lo = mid + 1;
        else hi = mid;
      }
      queue.splice(lo, 0, [ev.eventId, ev.ts]);
    }

    // Enforce per-room limit; amortise by only evicting when 10% over
    if (queue.length > maxMessagesPerRoom * 1.1) {
      evictOldestForRoom(ev.roomId);
    }
  }

  dirty = true;
  scheduleFlush();
}

function handleQuery(
  id: string,
  term: string,
  roomIds?: string[],
  senders?: string[],
  hasTypes?: string[]
): void {
  if (!index) {
    post({ type: 'QUERY_RESULT', id, events: [] });
    return;
  }

  const typeFilter = makeTypeFilter(hasTypes);

  function matchesFilters(ev: IndexableEvent): boolean {
    if (roomIds && roomIds.length > 0 && !roomIds.includes(ev.roomId)) return false;
    if (senders && senders.length > 0 && !senders.includes(ev.sender)) return false;
    if (typeFilter && !typeFilter(ev)) return false;
    return true;
  }

  if (!term) {
    // Chip-only query: scan all stored documents — MiniSearch can't search an empty term.
    const results: IndexableEvent[] = [];
    for (const ev of iterateStoredDocs()) {
      if (matchesFilters(ev)) results.push(ev);
    }
    post({ type: 'QUERY_RESULT', id, events: results });
    return;
  }

  const rawResults = index.search(term, {
    filter: (r) => matchesFilters(r as unknown as IndexableEvent),
  }) as unknown as IndexableEvent[];

  post({ type: 'QUERY_RESULT', id, events: rawResults });
}

async function handleSetBackfillState(roomId: string, state: BackfillState): Promise<void> {
  if (!db) return;
  await idbPut(db, 'backfill', roomId, state);
}

async function handleGetBackfillStates(): Promise<void> {
  if (!db) {
    post({ type: 'BACKFILL_STATES', states: {} });
    return;
  }
  const rows = await idbGetAll(db, 'backfill');
  const states: Record<string, BackfillState> = {};
  for (const { key, value } of rows) {
    states[key] = value as BackfillState;
  }
  post({ type: 'BACKFILL_STATES', states });
}

function handleGetStats(): void {
  if (!index) {
    post({ type: 'STATS', indexedEventCount: 0, roomCount: 0, estimatedBytes: 0 });
    return;
  }
  const serialized = JSON.stringify(index);
  post({
    type: 'STATS',
    indexedEventCount: index.documentCount,
    roomCount: roomQueues.size,
    estimatedBytes: serialized.length * 2, // UTF-16 approximation
  });
}

async function handleClearIndex(): Promise<void> {
  if (!db) return;
  index = makeIndex();
  roomQueues.clear();
  storedDocs.clear();
  dirty = false;
  await idbClear(db, 'index');
  await idbClear(db, 'backfill');
}

self.addEventListener('message', (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'INIT':
      handleInit(msg.userId, msg.maxMessagesPerRoom).catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[SearchWorker] INIT failed:', err);
        post({
          type: '_sentry_breadcrumb',
          category: 'search.worker',
          message: 'INIT failed with error',
          level: 'error',
          data: {
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          },
        });
        // Send ERROR instead of READY so the UI can show the error state
        post({
          type: 'ERROR',
          message: err instanceof Error ? err.message : String(err),
        });
      });
      break;
    case 'INDEX_EVENTS':
      handleIndexEvents(msg.events);
      break;
    case 'QUERY':
      handleQuery(msg.id, msg.term, msg.roomIds, msg.senders, msg.hasTypes);
      break;
    case 'SET_BACKFILL_STATE':
      void handleSetBackfillState(msg.roomId, msg.state);
      break;
    case 'GET_BACKFILL_STATES':
      void handleGetBackfillStates();
      break;
    case 'GET_STATS':
      handleGetStats();
      break;
    case 'CLEAR_INDEX':
      void handleClearIndex();
      break;
    case 'FLUSH':
      void flushIndex().then(() => {
        self.postMessage({ type: 'FLUSH_DONE' }, self.location.origin);
      });
      break;
    default:
      break;
  }
});
