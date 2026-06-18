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
        restoreAgeMs: 400,
      })
    ).toBe(true);
  });

  it('does not wait once the target room parent mapping is available', () => {
    expect(
      shouldWaitForTargetRoomParentGraph({
        isDirectRoom: false,
        hasTargetParentMapping: true,
        restoreAgeMs: 400,
      })
    ).toBe(false);
  });

  it('does not wait for DM restores or after the timeout budget is exhausted', () => {
    expect(
      shouldWaitForTargetRoomParentGraph({
        isDirectRoom: true,
        hasTargetParentMapping: false,
        restoreAgeMs: 400,
      })
    ).toBe(false);

    expect(
      shouldWaitForTargetRoomParentGraph({
        isDirectRoom: false,
        hasTargetParentMapping: false,
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
