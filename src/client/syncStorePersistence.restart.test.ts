import 'fake-indexeddb/auto';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import { IndexedDBStore, RoomEvent } from '$types/matrix-sdk';
import { disposeSyncStorePersistence, installSyncStorePersistence } from './syncStorePersistence';

const USER_ID = '@me:example.org';
const ROOM_ID = '!room:example.org';

type SyncOptions = { nextBatch: string; notificationCount: number; readReceiptFor?: string };

const syncResponse = ({ nextBatch, notificationCount, readReceiptFor }: SyncOptions) => ({
  next_batch: nextBatch,
  account_data: { events: [] },
  presence: { events: [] },
  rooms: {
    join: {
      [ROOM_ID]: {
        timeline: {
          events: [
            {
              event_id: '$msg',
              type: 'm.room.message',
              sender: '@them:example.org',
              content: { msgtype: 'm.text', body: 'hi' },
              origin_server_ts: 1000,
            },
          ],
          prev_batch: 'p1',
          limited: false,
        },
        state: { events: [] },
        account_data: { events: [] },
        ephemeral: {
          events: readReceiptFor
            ? [
                {
                  type: 'm.receipt',
                  content: { [readReceiptFor]: { 'm.read': { [USER_ID]: { ts: 2000 } } } },
                },
              ]
            : [],
        },
        unread_notifications: { notification_count: notificationCount, highlight_count: 0 },
      },
    },
    invite: {},
    leave: {},
  },
});

const openStore = (dbName: string) =>
  new IndexedDBStore({ indexedDB: globalThis.indexedDB, localStorage, dbName });

const readBackSnapshot = async (dbName: string) => {
  const store = openStore(dbName);
  await store.startup();
  const saved = await store.getSavedSync();
  const room = saved?.roomsData.join[ROOM_ID];
  await store.destroy();
  return {
    notificationCount: room?.unread_notifications?.notification_count,
    receipts: room?.ephemeral?.events ?? [],
  };
};

const fakeClient = (store: IndexedDBStore) =>
  Object.assign(new EventEmitter(), {
    store,
    getUserId: () => USER_ID,
  }) as unknown as MatrixClient;

let dbName = '';
let liveStore: IndexedDBStore | undefined;
let liveClient: MatrixClient | undefined;

beforeEach(async () => {
  dbName = `sync-store-${Math.random().toString(16).slice(2)}`;
  liveStore = openStore(dbName);
  await liveStore.startup();
  liveClient = fakeClient(liveStore);
  installSyncStorePersistence(liveClient);

  // The state a running client already had on disk before the room was read.
  await liveStore.setSyncData(syncResponse({ nextBatch: 's1', notificationCount: 3 }) as never);
  await liveStore.save(true);

  // Reading the room: the server echoes the receipt and a cleared count, but
  // the sync loop will not write it for another five minutes.
  await liveStore.setSyncData(
    syncResponse({ nextBatch: 's2', notificationCount: 0, readReceiptFor: '$msg' }) as never
  );
});

afterEach(async () => {
  if (liveClient) disposeSyncStorePersistence(liveClient);
  await liveStore?.destroy();
  liveStore = undefined;
  liveClient = undefined;
});

describe('sync store persistence across a restart', () => {
  it('restores the pre-read snapshot when nothing flushes the store', async () => {
    const snapshot = await readBackSnapshot(dbName);

    expect(snapshot.notificationCount).toBe(3);
    expect(snapshot.receipts).toEqual([]);
  });

  it('restores the read state after the app is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(async () => {
      expect((await readBackSnapshot(dbName)).notificationCount).toBe(0);
    });

    const snapshot = await readBackSnapshot(dbName);
    expect(snapshot.receipts).toHaveLength(1);
  });

  it('restores the read state once our own receipt settles, without any hide', async () => {
    vi.useFakeTimers();
    try {
      (liveClient as unknown as EventEmitter).emit(RoomEvent.Receipt, {
        getContent: () => ({ $msg: { 'm.read': { [USER_ID]: { ts: 2000 } } } }),
      });
      await vi.advanceTimersByTimeAsync(60000);
    } finally {
      vi.useRealTimers();
    }

    await vi.waitFor(async () => {
      expect((await readBackSnapshot(dbName)).notificationCount).toBe(0);
    });
  });
});
