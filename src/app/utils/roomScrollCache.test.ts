import { describe, it, expect } from 'vitest';
import { roomScrollCache } from './roomScrollCache';

// CacheSnapshot is opaque in tests — cast a plain object.
const fakeCache = () => ({} as import('./roomScrollCache').RoomScrollCache['cache']);

describe('roomScrollCache', () => {
  it('load returns undefined for an unknown roomId', () => {
    expect(roomScrollCache.load('!unknown:test')).toBeUndefined();
  });

  it('stores and retrieves data for a roomId', () => {
    const data = { cache: fakeCache(), scrollOffset: 120, atBottom: false };
    roomScrollCache.save('!room1:test', data);
    expect(roomScrollCache.load('!room1:test')).toBe(data);
  });

  it('overwrites existing data when saved again for the same roomId', () => {
    const first = { cache: fakeCache(), scrollOffset: 50, atBottom: true };
    const second = { cache: fakeCache(), scrollOffset: 200, atBottom: false };
    roomScrollCache.save('!room2:test', first);
    roomScrollCache.save('!room2:test', second);
    expect(roomScrollCache.load('!room2:test')).toBe(second);
  });

  it('keeps data for separate rooms independent', () => {
    const a = { cache: fakeCache(), scrollOffset: 10, atBottom: true };
    const b = { cache: fakeCache(), scrollOffset: 20, atBottom: false };
    roomScrollCache.save('!roomA:test', a);
    roomScrollCache.save('!roomB:test', b);
    expect(roomScrollCache.load('!roomA:test')).toBe(a);
    expect(roomScrollCache.load('!roomB:test')).toBe(b);
  });
});
