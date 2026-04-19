import { describe, it, expect } from 'vitest';
import { roomScrollCache, RoomScrollFingerprint, RoomScrollPosition } from './roomScrollCache';

// CacheSnapshot is opaque in tests — cast a plain object.
const fakeCache = () => ({}) as import('./roomScrollCache').RoomScrollCache['measurementCache'];
const userId = '@alice:test';

const fingerprint = (overrides: Partial<RoomScrollFingerprint> = {}): RoomScrollFingerprint => ({
  eventCount: 3,
  headEventIds: ['$a', '$b'],
  tailEventIds: ['$b', '$c'],
  readUptoEventId: '$read',
  layoutKey: 'compact:space',
  ...overrides,
});

const position = (overrides: Partial<Extract<RoomScrollPosition, { kind: 'anchor' }>> = {}) =>
  ({
    kind: 'anchor',
    eventId: '$b',
    offset: -24,
    ...overrides,
  }) as RoomScrollPosition;

describe('roomScrollCache', () => {
  it('load returns undefined for an unknown roomId', () => {
    expect(roomScrollCache.load(userId, '!unknown:test')).toBeUndefined();
  });

  it('stores and retrieves data for a roomId', () => {
    const data = {
      measurementCache: fakeCache(),
      position: position(),
      fingerprint: fingerprint(),
    };
    roomScrollCache.save(userId, '!room1:test', data);
    expect(roomScrollCache.load(userId, '!room1:test')).toBe(data);
  });

  it('overwrites existing data when saved again for the same roomId', () => {
    const first = {
      measurementCache: fakeCache(),
      position: { kind: 'live' } as RoomScrollPosition,
      fingerprint: fingerprint({ headEventIds: ['$a', '$b'] }),
    };
    const second = {
      measurementCache: fakeCache(),
      position: position({ eventId: '$d' }),
      fingerprint: fingerprint({
        headEventIds: ['$c', '$d'],
        tailEventIds: ['$d', '$e'],
      }),
    };
    roomScrollCache.save(userId, '!room2:test', first);
    roomScrollCache.save(userId, '!room2:test', second);
    expect(roomScrollCache.load(userId, '!room2:test')).toBe(second);
  });

  it('keeps data for separate rooms independent', () => {
    const a = {
      measurementCache: fakeCache(),
      position: { kind: 'live' } as RoomScrollPosition,
      fingerprint: fingerprint({ headEventIds: ['$a'], tailEventIds: ['$a'], eventCount: 1 }),
    };
    const b = {
      measurementCache: fakeCache(),
      position: position({ eventId: '$b', offset: -12 }),
      fingerprint: fingerprint({ headEventIds: ['$b'], tailEventIds: ['$b'], eventCount: 1 }),
    };
    roomScrollCache.save(userId, '!roomA:test', a);
    roomScrollCache.save(userId, '!roomB:test', b);
    expect(roomScrollCache.load(userId, '!roomA:test')).toBe(a);
    expect(roomScrollCache.load(userId, '!roomB:test')).toBe(b);
  });

  it('scopes data per userId', () => {
    const data1 = {
      measurementCache: fakeCache(),
      position: { kind: 'live' } as RoomScrollPosition,
      fingerprint: fingerprint({ headEventIds: ['$a'], tailEventIds: ['$a'], eventCount: 1 }),
    };
    const data2 = {
      measurementCache: fakeCache(),
      position: position({ eventId: '$b' }),
      fingerprint: fingerprint({ headEventIds: ['$b'], tailEventIds: ['$b'], eventCount: 1 }),
    };
    roomScrollCache.save('@alice:test', '!room:test', data1);
    roomScrollCache.save('@bob:test', '!room:test', data2);
    expect(roomScrollCache.load('@alice:test', '!room:test')).toBe(data1);
    expect(roomScrollCache.load('@bob:test', '!room:test')).toBe(data2);
  });

  it('drops only the measurement cache when the fingerprint changes', () => {
    const data = {
      measurementCache: fakeCache(),
      position: position(),
      fingerprint: fingerprint({
        eventCount: 4,
        headEventIds: ['$a', '$b', '$c'],
        tailEventIds: ['$b', '$c', '$d'],
      }),
    };
    roomScrollCache.save(userId, '!room3:test', data);

    expect(roomScrollCache.load(userId, '!room3:test', data.fingerprint)).toBe(data);

    const changedHead = roomScrollCache.load(
      userId,
      '!room3:test',
      fingerprint({
        eventCount: 4,
        headEventIds: ['$x', '$a', '$b'],
        tailEventIds: ['$b', '$c', '$d'],
      })
    );
    expect(changedHead?.measurementCache).toBeUndefined();
    expect(changedHead?.position).toEqual(data.position);

    const changedLayout = roomScrollCache.load(
      userId,
      '!room3:test',
      fingerprint({
        eventCount: 4,
        headEventIds: ['$a', '$b', '$c'],
        tailEventIds: ['$b', '$c', '$d'],
        layoutKey: 'modern:wide',
      })
    );
    expect(changedLayout?.measurementCache).toBeUndefined();
    expect(changedLayout?.position).toEqual(data.position);
  });
});
