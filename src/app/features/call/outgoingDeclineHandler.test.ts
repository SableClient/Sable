import { describe, expect, it } from 'vitest';
import { applyOutgoingDeclineToTracker, type OutgoingDeclineTracker } from './outgoingDeclineHandler';

const decline = {
  roomId: '!room:example.org',
  declineEventId: '$decline',
  notificationEventId: '$notif',
  senderId: '@alice:example.org',
};

describe('applyOutgoingDeclineToTracker', () => {
  it('ends call immediately for direct rooms', () => {
    const tracker: OutgoingDeclineTracker = new Map();
    const decision = applyOutgoingDeclineToTracker(tracker, decline, {
      remoteJoinedIds: new Set(['@alice:example.org']),
      isDirectRoom: true,
    });

    expect(decision).toEqual({ kind: 'end_call', declinedCount: 1, targetCount: 1 });
  });

  it('ignores partial declines in group calls until all remotes decline', () => {
    const tracker: OutgoingDeclineTracker = new Map();
    const remoteJoinedIds = new Set(['@alice:example.org', '@bob:example.org']);

    const partial = applyOutgoingDeclineToTracker(tracker, decline, {
      remoteJoinedIds,
      isDirectRoom: false,
    });
    expect(partial).toEqual({ kind: 'ignore_partial', declinedCount: 1, targetCount: 2 });

    const end = applyOutgoingDeclineToTracker(
      tracker,
      { ...decline, senderId: '@bob:example.org' },
      { remoteJoinedIds, isDirectRoom: false }
    );
    expect(end).toEqual({ kind: 'end_call', declinedCount: 2, targetCount: 2 });
  });
});
