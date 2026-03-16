// Example: testing factory functions (functions that return functions).
// Shows how to build lightweight fakes/stubs instead of using a full mock library —
// for factoryRoomIdByActivity and factoryRoomIdByAtoZ the MatrixClient is stubbed
// with a plain object, keeping tests readable without heavy setup.
import { describe, it, expect } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import {
  byOrderKey,
  byTsOldToNew,
  factoryRoomIdByActivity,
  factoryRoomIdByAtoZ,
  factoryRoomIdByUnreadCount,
} from './sort';

// Minimal stub that satisfies the MatrixClient shape needed by these sort functions.
function makeClient(rooms: Record<string, { name: string; ts: number }>): MatrixClient {
  return {
    getRoom: (id: string) => {
      const r = rooms[id];
      if (!r) return null;
      return { name: r.name, getLastActiveTimestamp: () => r.ts } as any;
    },
  } as unknown as MatrixClient;
}

describe('byTsOldToNew', () => {
  it('sorts ascending by timestamp', () => {
    expect([300, 100, 200].sort(byTsOldToNew)).toEqual([100, 200, 300]);
  });
});

describe('byOrderKey', () => {
  it('sorts defined keys lexicographically', () => {
    expect(['c', 'a', 'b'].sort(byOrderKey)).toEqual(['a', 'b', 'c']);
  });

  it('puts undefined keys after defined keys', () => {
    expect([undefined, 'a', undefined, 'b'].sort(byOrderKey)).toEqual([
      'a',
      'b',
      undefined,
      undefined,
    ]);
  });
});

describe('factoryRoomIdByActivity', () => {
  it('sorts rooms most-recently-active first', () => {
    const mx = makeClient({
      '!old:h': { name: 'Old', ts: 1000 },
      '!new:h': { name: 'New', ts: 9000 },
      '!mid:h': { name: 'Mid', ts: 5000 },
    });
    const sort = factoryRoomIdByActivity(mx);
    expect(['!old:h', '!new:h', '!mid:h'].sort(sort)).toEqual(['!new:h', '!mid:h', '!old:h']);
  });

  it('places unknown room IDs last', () => {
    const mx = makeClient({ '!known:h': { name: 'Known', ts: 1000 } });
    const sort = factoryRoomIdByActivity(mx);
    expect(['!unknown:h', '!known:h'].sort(sort)).toEqual(['!known:h', '!unknown:h']);
  });
});

describe('factoryRoomIdByAtoZ', () => {
  it('sorts room names case-insensitively A→Z', () => {
    const mx = makeClient({
      '!c:h': { name: 'Charlie', ts: 0 },
      '!a:h': { name: 'Alice', ts: 0 },
      '!b:h': { name: 'bob', ts: 0 },
    });
    const sort = factoryRoomIdByAtoZ(mx);
    expect(['!c:h', '!a:h', '!b:h'].sort(sort)).toEqual(['!a:h', '!b:h', '!c:h']);
  });

  it('strips leading # before comparing', () => {
    const mx = makeClient({
      '!hash:h': { name: '#alpha', ts: 0 },
      '!plain:h': { name: 'beta', ts: 0 },
    });
    const sort = factoryRoomIdByAtoZ(mx);
    // #alpha → "alpha" sorts before "beta"
    expect(['!plain:h', '!hash:h'].sort(sort)).toEqual(['!hash:h', '!plain:h']);
  });
});

describe('factoryRoomIdByUnreadCount', () => {
  it('sorts rooms with more unreads first', () => {
    const counts: Record<string, number> = { '!a:h': 5, '!b:h': 20, '!c:h': 1 };
    const sort = factoryRoomIdByUnreadCount((id) => counts[id] ?? 0);
    expect(['!a:h', '!b:h', '!c:h'].sort(sort)).toEqual(['!b:h', '!a:h', '!c:h']);
  });

  it('treats missing counts as 0', () => {
    const sort = factoryRoomIdByUnreadCount(() => 0);
    const result = ['!a:h', '!b:h'].sort(sort);
    expect(result).toHaveLength(2);
  });
});
