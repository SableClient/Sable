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
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('index')) {
        db.createObjectStore('index');
      }
      if (!db.objectStoreNames.contains('backfill')) {
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

/** Dirty flag — index changed since last flush */
let dirty = false;

const FLUSH_DEBOUNCE_MS = 5000;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function makeIndex(): MiniSearch<IndexableEvent> {
  return new MiniSearch<IndexableEvent>({
    idField: 'eventId',
    fields: ['body', 'sender'],
    storeFields: ['eventId', 'roomId', 'sender', 'ts', 'body'],
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
    await navigator.locks.request('sable-search-index-writer', { mode: 'exclusive' }, async () => {
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
    });
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
  }
}

// ── Message handler ────────────────────────────────────────────────────────

async function handleInit(userId: string, maxPerRoom: number): Promise<void> {
  maxMessagesPerRoom = maxPerRoom;
  const dbName = `sable-search-${userId}`;

  db = await openDb(dbName);

  const serialized = await idbGet<string>(db, 'index', 'v1');
  if (serialized) {
    try {
      index = MiniSearch.loadJSON(serialized, {
        idField: 'eventId',
        fields: ['body', 'sender'],
        storeFields: ['eventId', 'roomId', 'sender', 'ts', 'body'],
        searchOptions: {
          boost: { body: 2 },
          fuzzy: 0.2,
          prefix: true,
          combineWith: 'AND',
        },
      });
      // Rebuild room queues from persisted data
      const savedQueues = await idbGet<Record<string, Array<[string, number]>>>(
        db,
        'index',
        'rooms'
      );
      if (savedQueues) {
        for (const [roomId, queue] of Object.entries(savedQueues)) {
          roomQueues.set(roomId, queue);
        }
      }
    } catch {
      index = makeIndex();
    }
  } else {
    index = makeIndex();
  }

  post({
    type: 'READY',
    indexedEventCount: index.documentCount,
    roomCount: roomQueues.size,
  });
}

function handleIndexEvents(events: IndexableEvent[]): void {
  if (!index) return;

  for (const ev of events) {
    if (!ev.eventId || !ev.body.trim()) continue;

    // Skip duplicates already in the index
    if (index.has(ev.eventId)) continue;

    index.add(ev);

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

function handleQuery(id: string, term: string, roomIds?: string[], senders?: string[]): void {
  if (!index) {
    post({ type: 'QUERY_RESULT', id, events: [] });
    return;
  }

  const rawResults = index.search(term, {
    filter: (r) => {
      const ev = r as unknown as IndexableEvent;
      if (roomIds && roomIds.length > 0 && !roomIds.includes(ev.roomId)) return false;
      if (senders && senders.length > 0 && !senders.includes(ev.sender)) return false;
      return true;
    },
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
  dirty = false;
  await idbClear(db, 'index');
  await idbClear(db, 'backfill');
}

self.addEventListener('message', (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'INIT':
      void handleInit(msg.userId, msg.maxMessagesPerRoom);
      break;
    case 'INDEX_EVENTS':
      handleIndexEvents(msg.events);
      break;
    case 'QUERY':
      handleQuery(msg.id, msg.term, msg.roomIds, msg.senders);
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
    default:
      break;
  }
});

// Flush on termination
self.addEventListener('beforeunload', () => {
  void flushIndex();
});
