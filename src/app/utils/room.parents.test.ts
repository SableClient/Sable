import { describe, expect, it } from 'vitest';
import type { RoomToParents } from '$types/matrix/room';
import { getAllParents, hasRecursiveParent } from './room';

describe('hasRecursiveParent', () => {
  it('resolves recursive ancestry', () => {
    const roomToParents: RoomToParents = new Map([
      ['!room:example.org', new Set(['!space-a:example.org'])],
      ['!space-a:example.org', new Set(['!space-root:example.org'])],
    ]);

    expect(hasRecursiveParent(roomToParents, '!room:example.org', '!space-a:example.org')).toBe(
      true
    );
    expect(
      hasRecursiveParent(roomToParents, '!room:example.org', '!space-root:example.org')
    ).toBe(true);
    expect(hasRecursiveParent(roomToParents, '!room:example.org', '!unknown:example.org')).toBe(
      false
    );
  });

  it('handles cyclic parent graphs safely', () => {
    const roomToParents: RoomToParents = new Map([
      ['!room:example.org', new Set(['!space-a:example.org'])],
      ['!space-a:example.org', new Set(['!space-b:example.org'])],
      ['!space-b:example.org', new Set(['!space-a:example.org'])],
    ]);

    expect(hasRecursiveParent(roomToParents, '!room:example.org', '!space-a:example.org')).toBe(
      true
    );
    expect(hasRecursiveParent(roomToParents, '!room:example.org', '!space-b:example.org')).toBe(
      true
    );
  });

  it('matches getAllParents semantics', () => {
    const roomToParents: RoomToParents = new Map([
      ['!room:example.org', new Set(['!space-a:example.org', '!space-b:example.org'])],
      ['!space-a:example.org', new Set(['!space-root:example.org'])],
    ]);

    const allParents = getAllParents(roomToParents, '!room:example.org');
    Array.from(allParents).forEach((parentId) => {
      expect(hasRecursiveParent(roomToParents, '!room:example.org', parentId)).toBe(true);
    });
    expect(hasRecursiveParent(roomToParents, '!room:example.org', '!not-a-parent:example.org')).toBe(
      false
    );
  });
});
