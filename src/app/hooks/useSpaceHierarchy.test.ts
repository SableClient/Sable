import { describe, expect, it } from 'vitest';
import { getSpaceHierarchyItemKey } from './useSpaceHierarchy';

describe('getSpaceHierarchyItemKey', () => {
  it('distinguishes hierarchy entries included through separate parents at the same depth', () => {
    const firstHierarchyItem = {
      roomId: '!child:example.com',
      parentId: '!first-subspace:example.com',
      content: { via: [] },
      ts: 0,
      depth: 1,
    };
    const secondHierarchyItem = {
      ...firstHierarchyItem,
      parentId: '!second-subspace:example.com',
    };

    expect(getSpaceHierarchyItemKey('!space:example.com', firstHierarchyItem)).not.toBe(
      getSpaceHierarchyItemKey('!space:example.com', secondHierarchyItem)
    );
  });
});
