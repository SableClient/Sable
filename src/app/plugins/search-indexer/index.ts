import { Document, IndexedDB, Resolver } from 'flexsearch';
import {
  BackfillState,
  IndexWorkerMessageIn,
  IndexWorkerMessageOut,
  SearchIndexEvent,
  WorkerMessageTypeIn,
  WorkerMessageTypeOut,
} from './types';

export const HAS_TYPE_TO_MSGTYPE: Record<string, string> = {
  image: 'm.image',
  file: 'm.file',
  audio: 'm.audio',
  video: 'm.video',
};

function openIdb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);

    req.onupgradeneeded = (e) => {
      const db = req.result;

      db.createObjectStore('index');
      db.createObjectStore('backfill');
    };

    req.addEventListener('success', () => resolve(req.result));
    req.addEventListener('error', () => reject(req.error));
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.addEventListener('success', () => resolve(req.result));
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

function getDocument(
  data: Record<string, string> | undefined = undefined
): Document<SearchIndexEvent> {
  const document = new Document<SearchIndexEvent>({
    document: {
      id: 'eventId',
      store: true,
      index: ['body'],
    },
  });

  if (data) {
    for (const [key, value] of Object.entries(data)) {
      document.import(key, value);
    }
  }

  return document;
}

let dirty = false;
const FLUSH_DEBOUNCE_MS = 5000;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushTries = 0

let db: IDBDatabase | null = null;
let document: Document<SearchIndexEvent> | null = null;

const roomQueues = new Map<string, Array<[eventId: string, ts: number]>>();

async function flushIndex(): Promise<void> {
  if (!db || !document || !dirty) return;
  try {
    const doFlush = async () => {
      if (!db || !document) return;
      document.export(async (key, data) => {
        if (db) await idbPut(db, 'index', key, data);
      });

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
  } catch {}
}

function scheduleFlush(): void {
  if (flushTimer !== null && flushTries <= 100) {
    clearTimeout(flushTimer)
    flushTries += 1;
  };
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushTries = 0;
    void flushIndex();
  }, FLUSH_DEBOUNCE_MS);
}

function post(msg: IndexWorkerMessageOut): void {
  self.postMessage(msg);
}

function makeTypeFilter(
  hasTypes: string[] | undefined
): ((ev: SearchIndexEvent) => boolean) | null {
  if (!hasTypes || hasTypes.length === 0) return null;
  const allowedMsgtypes = hasTypes.filter((v) => v != 'link').map((t) => HAS_TYPE_TO_MSGTYPE[t]);
  const needsLink = hasTypes.includes('link');
  return (ev: SearchIndexEvent) => {
    if (allowedMsgtypes.includes(ev.msgtype)) return true;
    if (needsLink && ev.hasLink) return true;
    return false;
  };
}

self.addEventListener('message', async (event: MessageEvent<IndexWorkerMessageIn>) => {
  const msg = event.data;

  switch (msg.type) {
    case WorkerMessageTypeIn.Init:
      const dbName = `sable-search${msg.userId}`;

      db = await openIdb(dbName);

      const serialized = await idbGetAll(db, 'index');
      if (serialized) {
        const records: Record<string, string> = {};
        for (const { key, value } of serialized) {
          records[key] = value as string;
        }
        document = getDocument(records);
        const savedQueues = await idbGet<Record<string, Array<[string, number]>>>(
          db,
          'index',
          'rooms'
        );
        if (savedQueues) {
          for (const [roomId, queue] of Object.entries(savedQueues)) {
            roomQueues.set(roomId, queue);
            for (const [eventId] of queue) {
              const fields = document.get(eventId);
            }
          }
        }
      } else {
        document = getDocument();
      }

      post({
        type: WorkerMessageTypeOut.Ready,
        //@ts-expect-error flexsearch types are wrong for some reason
        indexedEventCount: document.store.size,
        roomCount: roomQueues.size,
      });
      break;

    case WorkerMessageTypeIn.Query:
      if (!document) {
        post({ type: WorkerMessageTypeOut.QueryResult, id: msg.id, events: [] });
        return;
      }

      const typeFilter = makeTypeFilter(msg.hasTypes);

      function matchesFilters(ev: SearchIndexEvent): boolean {
        if (msg.type != WorkerMessageTypeIn.Query) return false;
        if (msg.roomIds && msg.roomIds.length > 0 && !msg.roomIds.includes(ev.roomId)) return false;
        if (msg.senders && msg.senders.length > 0 && !msg.senders.includes(ev.sender)) return false;
        if (typeFilter && !typeFilter(ev)) return false;
        return true;
      }
      
      if (!msg.term) {
        const results: SearchIndexEvent[] = 
          //@ts-expect-error flexsearch types are very bad
          [...document.store.values()]
          .filter((v) => matchesFilters(v))
          .slice(0, 1000);
          post({ type: WorkerMessageTypeOut.QueryResult, id: msg.id, events: results });
        return;
      }


      let result = 
        document.search(msg.term, {
          //@ts-expect-error flexsearch types are very bad
          limit: document.store.size,
          enrich: true,
        })
        .flatMap((r) => r.result.map((v) => v.doc!))
        .filter((r) => r != undefined)
        .filter((v) => matchesFilters(v))
        .slice(0, 1000);

      post({ type: WorkerMessageTypeOut.QueryResult, id: msg.id, events: result! });

    case WorkerMessageTypeIn.State:
      if (!document) {
        post({ type: WorkerMessageTypeOut.State, indexedEventCount: 0, roomCount: 0 });
        return;
      }
      post({
        type: WorkerMessageTypeOut.State,
        //@ts-expect-error flexsearch types are very bad
        indexedEventCount: document.store.size,
        roomCount: roomQueues.size,
      });
      break;
    case WorkerMessageTypeIn.Clear:
      if (!db) return;
      Promise.all([idbClear(db, 'index'), idbClear(db, 'backfill')]);
      break;
    case WorkerMessageTypeIn.SetBackfillState:
      if (!db) return;
      await idbPut(db, 'backfill', msg.roomId, msg.state);
      break;
    case WorkerMessageTypeIn.GetBackfillStates:
      if (!db) {
        post({ type: WorkerMessageTypeOut.BackfillStatesDone, states: {} });
        return;
      }

      const rows = await idbGetAll(db, 'backfill');
      const states: Record<string, BackfillState> = {};
      for (const { key, value } of rows) {
        states[key] = value as BackfillState;
      }
      post({ type: WorkerMessageTypeOut.BackfillStatesDone, states });
      break;
    case WorkerMessageTypeIn.Index:
      if (!document) return;

      for (const ev of msg.events) {
        if (!ev.eventId || !ev.body.trim()) continue;
        if (document.contain(ev.eventId)) continue;
        document.add(ev);

        let queue = roomQueues.get(ev.roomId);
        if (!queue) {
          queue = [];
          roomQueues.set(ev.roomId, queue);
        }
        const lastEntry = queue[queue.length - 1];
        if (queue.length === 0 || (lastEntry !== undefined && lastEntry[1] <= ev.ts)) {
          queue.push([ev.eventId, ev.ts]);
        } else {
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
      }
      dirty = true;
      scheduleFlush();
      break;
    case WorkerMessageTypeIn.RedactEvents:
      if (!document) return;
      for (const ev of msg.eventIds) {
        document.remove(ev)
      }
      dirty = true;
      scheduleFlush();
      break
    case WorkerMessageTypeIn.EditEvents:
      if (!document) return;
      for (const id in msg.events) {
        if (!msg.events[id]) continue
        document.set(id, msg.events[id])
      }
      dirty = true;
      scheduleFlush();
      break
    case WorkerMessageTypeIn.Flush:
      void flushIndex().then(() => {
        post({
          type: WorkerMessageTypeOut.FlushDone,
        });
      });
      break;
    default:
      break;
  }
});
