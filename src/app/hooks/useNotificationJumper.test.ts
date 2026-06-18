import { describe, expect, it } from 'vitest';
import {
  hasTargetRoomParentMapping,
  shouldWaitForTargetRoomParentGraph,
} from './useNotificationJumper';

describe('useNotificationJumper helpers', () => {
  it('waits until the target room itself has parent mappings or the timeout expires', () => {
    expect(
      shouldWaitForTargetRoomParentGraph({
        isDirectRoom: false,
        hasTargetParentMapping: false,
        roomToParentsReady: false,
        restoreAgeMs: 400,
      })
    ).toBe(true);
  });

  it('does not wait once the target room parent mapping is available', () => {
    expect(
      shouldWaitForTargetRoomParentGraph({
        isDirectRoom: false,
        hasTargetParentMapping: true,
        roomToParentsReady: false,
        restoreAgeMs: 400,
      })
    ).toBe(false);
  });

  it('does not wait for DM restores, ready orphan graphs, or after the timeout budget is exhausted', () => {
    expect(
      shouldWaitForTargetRoomParentGraph({
        isDirectRoom: true,
        hasTargetParentMapping: false,
        roomToParentsReady: false,
        restoreAgeMs: 400,
      })
    ).toBe(false);

    expect(
      shouldWaitForTargetRoomParentGraph({
        isDirectRoom: false,
        hasTargetParentMapping: false,
        roomToParentsReady: true,
        restoreAgeMs: 400,
      })
    ).toBe(false);

    expect(
      shouldWaitForTargetRoomParentGraph({
        isDirectRoom: false,
        hasTargetParentMapping: false,
        roomToParentsReady: false,
        restoreAgeMs: 1_500,
      })
    ).toBe(false);
  });

  it('treats only the target rooms own mapping as ready', () => {
    const roomToParents = new Map<string, Set<string>>([
      ['!other:example.com', new Set(['!space:example.com'])],
    ]);

    expect(hasTargetRoomParentMapping(roomToParents, '!target:example.com')).toBe(false);

    roomToParents.set('!target:example.com', new Set(['!space:example.com']));
    expect(hasTargetRoomParentMapping(roomToParents, '!target:example.com')).toBe(true);
  });
});
