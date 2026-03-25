/**
 * Unit tests for getThreadReplyEvents — the function that decides which events
 * to display as replies in the thread drawer.
 *
 * The bug these tests cover (classic-sync empty thread):
 *   room.createThread(id, root, [], false) creates a Thread whose .events array
 *   contains only the root event.  After filtering out the root, the old code
 *   checked `if (fromThread.length > 0)` on the un-filtered array — which was
 *   truthy — and returned an empty list instead of falling back to the live
 *   timeline.  The fix: filter first, then check.
 */
import { describe, it, expect } from 'vitest';
import { RelationType } from '$types/matrix-sdk';
import { getThreadReplyEvents } from './ThreadDrawer';

// ── Minimal MatrixEvent factory ───────────────────────────────────────────────

type EventInit = {
  id: string;
  threadRootId?: string;
  /** When set, the event is treated as a reaction/annotation */
  relType?: string;
};

function makeEvent({ id, threadRootId, relType }: EventInit) {
  return {
    getId: () => id,
    threadRootId,
    getRelation: () => (relType ? { rel_type: relType } : null),
    getContent: () => ({}),
  };
}

// ── Minimal Room factory ──────────────────────────────────────────────────────

type RoomInit = {
  thread?: { events: ReturnType<typeof makeEvent>[] } | null;
  liveEvents?: ReturnType<typeof makeEvent>[];
};

function makeRoom({ thread = null, liveEvents = [] }: RoomInit) {
  return {
    getThread: () => thread,
    getUnfilteredTimelineSet: () => ({
      getLiveTimeline: () => ({
        getEvents: () => liveEvents,
      }),
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const ROOT_ID = '$root-event-id';
const REPLY_ID = '$reply-event-id';
const REACTION_ID = '$reaction-event-id';

describe('getThreadReplyEvents', () => {
  it('returns thread events minus the root when the Thread object has replies', () => {
    const rootEvent = makeEvent({ id: ROOT_ID, threadRootId: ROOT_ID });
    const replyEvent = makeEvent({ id: REPLY_ID, threadRootId: ROOT_ID });

    const room = makeRoom({
      thread: { events: [rootEvent, replyEvent] as any },
      liveEvents: [],
    });

    const result = getThreadReplyEvents(room as any, ROOT_ID);

    expect(result).toHaveLength(1);
    expect(result[0].getId()).toBe(REPLY_ID);
  });

  it('excludes reactions from thread events', () => {
    const rootEvent = makeEvent({ id: ROOT_ID, threadRootId: ROOT_ID });
    const replyEvent = makeEvent({ id: REPLY_ID, threadRootId: ROOT_ID });
    const reactionEvent = makeEvent({
      id: REACTION_ID,
      threadRootId: ROOT_ID,
      relType: RelationType.Annotation,
    });

    const room = makeRoom({
      thread: { events: [rootEvent, replyEvent, reactionEvent] as any },
      liveEvents: [],
    });

    const result = getThreadReplyEvents(room as any, ROOT_ID);

    expect(result).toHaveLength(1);
    expect(result[0].getId()).toBe(REPLY_ID);
  });

  // ── Classic-sync empty-thread regression ──────────────────────────────────

  it('falls back to the live timeline when thread.events contains only the root (classic-sync case)', () => {
    // classic sync: thread created with no initialEvents → events = [rootEvent]
    const rootEvent = makeEvent({ id: ROOT_ID, threadRootId: ROOT_ID });
    const liveReply = makeEvent({ id: REPLY_ID, threadRootId: ROOT_ID });

    const room = makeRoom({
      thread: { events: [rootEvent] as any },
      liveEvents: [liveReply as any],
    });

    const result = getThreadReplyEvents(room as any, ROOT_ID);

    // Without the fix: `fromThread.length > 0` was truthy → returned filtered
    // empty array.  With the fix: filtered array is empty → falls back to live.
    expect(result).toHaveLength(1);
    expect(result[0].getId()).toBe(REPLY_ID);
  });

  it('falls back to the live timeline when there is no Thread object at all', () => {
    const liveReply = makeEvent({ id: REPLY_ID, threadRootId: ROOT_ID });

    const room = makeRoom({
      thread: null,
      liveEvents: [liveReply as any],
    });

    const result = getThreadReplyEvents(room as any, ROOT_ID);

    expect(result).toHaveLength(1);
    expect(result[0].getId()).toBe(REPLY_ID);
  });

  it('excludes events from the live timeline that belong to a different thread', () => {
    const otherReply = makeEvent({ id: '$other-reply', threadRootId: '$other-root' });
    const ourReply = makeEvent({ id: REPLY_ID, threadRootId: ROOT_ID });

    const room = makeRoom({
      thread: null,
      liveEvents: [otherReply as any, ourReply as any],
    });

    const result = getThreadReplyEvents(room as any, ROOT_ID);

    expect(result).toHaveLength(1);
    expect(result[0].getId()).toBe(REPLY_ID);
  });

  it('returns an empty array when neither the thread nor the live timeline has replies', () => {
    const rootEvent = makeEvent({ id: ROOT_ID, threadRootId: ROOT_ID });

    const room = makeRoom({
      thread: { events: [rootEvent] as any },
      liveEvents: [],
    });

    const result = getThreadReplyEvents(room as any, ROOT_ID);

    expect(result).toHaveLength(0);
  });
});
