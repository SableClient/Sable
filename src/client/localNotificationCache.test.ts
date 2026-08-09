import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StoredNotification } from '$utils/localNotifications';
import { LocalNotificationCache } from './localNotificationCache';

const USER_ID = '@me:example.org';
const caches: LocalNotificationCache[] = [];

const entry = (id: string, ts: number): StoredNotification =>
  ({
    room_id: '!room:example.org',
    event: { event_id: id, type: 'm.room.message' },
    ts,
    highlight: false,
    isDM: false,
  }) as StoredNotification;

const open = () => {
  const cache = new LocalNotificationCache(USER_ID);
  caches.push(cache);
  return cache;
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  caches.splice(0).forEach((cache) => cache.destroy());
  localStorage.clear();
});

describe('LocalNotificationCache', () => {
  it('upserts by event id and sorts newest first', () => {
    const cache = open();
    cache.mergeMany([entry('$a', 1), entry('$b', 3), entry('$a', 2)]);
    expect(cache.getEntries().map((item) => [item.event.event_id, item.ts])).toEqual([
      ['$b', 3],
      ['$a', 2],
    ]);
  });

  it('persists entries', () => {
    const cache = open();
    cache.merge(entry('$a', 1));
    cache.destroy();

    const restored = open();
    expect(restored.getEntries()[0]?.event.event_id).toBe('$a');
  });

  it('only extends the complete history boundary backward', () => {
    const cache = open();
    cache.extendHistoryTo('dms', 100);
    cache.extendHistoryTo('dms', 200);
    cache.extendHistoryTo('dms', 50);
    expect(cache.getHistoryCutoff('dms')).toBe(50);
    expect(cache.getHistoryCutoff('all')).toBeUndefined();
  });

  it('retains only the newest 5,000 entries', () => {
    const cache = open();
    cache.mergeMany(Array.from({ length: 5_010 }, (_, index) => entry(`$${index}`, index)));
    expect(cache.getEntries()).toHaveLength(5_000);
    expect(cache.getEntries().at(-1)?.ts).toBe(10);
  });
});
