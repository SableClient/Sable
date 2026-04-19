import { describe, it, expect } from 'vitest';
import { roomScrollCache } from './roomScrollCache';

// CacheSnapshot is opaque in tests — cast a plain object.
const fakeCache = () => ({}) as import('./roomScrollCache').RoomScrollCache['cache'];
const userId = '@alice:test';

describe('roomScrollCache', () => {
  it('load returns undefined for an unknown roomId', () => {
    expect(roomScrollCache.load(userId, '!unknown:test')).toBeUndefined();
  });

  it('stores and retrieves data for a roomId', () => {
    const data = {
      cache: fakeCache(),
      scrollOffset: 120,
      atBottom: false,
      headEventIds: ['$a', '$b'],
    };
    roomScrollCache.save(userId, '!room1:test', data);
    expect(roomScrollCache.load(userId, '!room1:test')).toBe(data);
  });

  it('overwrites existing data when saved again for the same roomId', () => {
    const first = {
      cache: fakeCache(),
      scrollOffset: 50,
      atBottom: true,
      headEventIds: ['$a', '$b'],
    };
    const second = {
      cache: fakeCache(),
      scrollOffset: 200,
      atBottom: false,
      headEventIds: ['$c', '$d'],
    };
    roomScrollCache.save(userId, '!room2:test', first);
    roomScrollCache.save(userId, '!room2:test', second);
    expect(roomScrollCache.load(userId, '!room2:test')).toBe(second);
  });

  it('keeps data for separate rooms independent', () => {
    const a = {
      cache: fakeCache(),
      scrollOffset: 10,
      atBottom: true,
      headEventIds: ['$a'],
    };
    const b = {
      cache: fakeCache(),
      scrollOffset: 20,
      atBottom: false,
      headEventIds: ['$b'],
    };
    roomScrollCache.save(userId, '!roomA:test', a);
    roomScrollCache.save(userId, '!roomB:test', b);
    expect(roomScrollCache.load(userId, '!roomA:test')).toBe(a);
    expect(roomScrollCache.load(userId, '!roomB:test')).toBe(b);
  });

  it('scopes data per userId', () => {
    const data1 = {
      cache: fakeCache(),
      scrollOffset: 100,
      atBottom: true,
      headEventIds: ['$a'],
    };
    const data2 = {
      cache: fakeCache(),
      scrollOffset: 200,
      atBottom: false,
      headEventIds: ['$b'],
    };
    roomScrollCache.save('@alice:test', '!room:test', data1);
    roomScrollCache.save('@bob:test', '!room:test', data2);
    expect(roomScrollCache.load('@alice:test', '!room:test')).toBe(data1);
    expect(roomScrollCache.load('@bob:test', '!room:test')).toBe(data2);
  });

  it('invalidates a cache when the current timeline head changes', () => {
    const data = {
      cache: fakeCache(),
      scrollOffset: 120,
      atBottom: false,
      headEventIds: ['$a', '$b', '$c'],
    };
    roomScrollCache.save(userId, '!room3:test', data);

    expect(roomScrollCache.load(userId, '!room3:test', ['$a', '$b', '$c', '$d'])).toBe(data);
    expect(roomScrollCache.load(userId, '!room3:test', ['$x', '$a', '$b', '$c'])).toBeUndefined();
    expect(roomScrollCache.load(userId, '!room3:test', ['$a', '$x', '$c', '$d'])).toBeUndefined();
    expect(roomScrollCache.load(userId, '!room3:test', ['$a', '$b'])).toBeUndefined();
  });
});
