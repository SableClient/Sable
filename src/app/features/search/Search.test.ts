import { describe, expect, it } from 'vitest';
import type { RoomToParents } from '$types/matrix/room';
import { sortRoomsBySelectedSpace } from './searchUtils';

describe('sortRoomsBySelectedSpace', () => {
  it('returns original list when no space is selected', () => {
    const roomToParents: RoomToParents = new Map();
    const items = ['!a:example.org', '!b:example.org', '!c:example.org'];

    expect(sortRoomsBySelectedSpace(items, undefined, roomToParents)).toEqual(items);
  });

  it('prioritizes rooms in selected space', () => {
    const roomToParents: RoomToParents = new Map([
      ['!room-a:example.org', new Set(['!space-1:example.org'])],
      ['!room-b:example.org', new Set(['!space-2:example.org'])],
      ['!room-c:example.org', new Set(['!space-1:example.org'])],
    ]);
    const items = ['!room-b:example.org', '!room-a:example.org', '!room-c:example.org'];

    expect(sortRoomsBySelectedSpace(items, '!space-1:example.org', roomToParents)).toEqual([
      '!room-a:example.org',
      '!room-c:example.org',
      '!room-b:example.org',
    ]);
  });
});
