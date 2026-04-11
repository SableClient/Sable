import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { EventTimeline, EventTimelineSet, MatrixEvent } from '$types/matrix-sdk';
import { useProcessedTimeline } from './useProcessedTimeline';

// ---------------------------------------------------------------------------
// Minimal fakes
// ---------------------------------------------------------------------------

function makeEvent(
  id: string,
  opts: {
    sender?: string;
    type?: string;
    ts?: number;
    content?: Record<string, unknown>;
  } = {}
): MatrixEvent {
  const {
    sender = '@alice:test',
    type = 'm.room.message',
    ts = 1_000,
    content = { body: 'hello' },
  } = opts;
  return {
    getId: () => id,
    getSender: () => sender,
    isRedacted: () => false,
    getTs: () => ts,
    getType: () => type,
    threadRootId: undefined,
    getContent: () => content,
    getRelation: () => null,
    isRedaction: () => false,
  } as unknown as MatrixEvent;
}

const fakeTimelineSet = {} as EventTimelineSet;

function makeTimeline(events: MatrixEvent[]): EventTimeline {
  return {
    getEvents: () => events,
    getTimelineSet: () => fakeTimelineSet,
  } as unknown as EventTimeline;
}

/** Default options — keeps tests concise; individual tests override what they need. */
const defaults = {
  ignoredUsersSet: new Set<string>(),
  showHiddenEvents: false,
  showTombstoneEvents: false,
  mxUserId: '@alice:test',
  readUptoEventId: undefined,
  hideMembershipEvents: false,
  hideNickAvatarEvents: false,
  isReadOnly: false,
  hideMemberInReadOnly: false,
} as const;

// ---------------------------------------------------------------------------
// Helpers to derive `items` from a linked-timeline list
// index 0 = first event in first timeline, etc.
// ---------------------------------------------------------------------------
function makeItems(count: number, startIndex = 0): number[] {
  return Array.from({ length: count }, (_, i) => startIndex + i);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useProcessedTimeline', () => {
  it('returns an empty array when there are no events', () => {
    const { result } = renderHook(() =>
      useProcessedTimeline({
        ...defaults,
        items: [],
        linkedTimelines: [makeTimeline([])],
      })
    );
    expect(result.current).toHaveLength(0);
  });

  it('returns one ProcessedEvent per visible event', () => {
    const events = [makeEvent('$e1'), makeEvent('$e2'), makeEvent('$e3')];
    const timeline = makeTimeline(events);

    const { result } = renderHook(() =>
      useProcessedTimeline({
        ...defaults,
        items: makeItems(3),
        linkedTimelines: [timeline],
      })
    );

    expect(result.current).toHaveLength(3);
    expect(result.current[0].id).toBe('$e1');
    expect(result.current[2].id).toBe('$e3');
  });

  it('collapses consecutive messages from the same sender within 2 minutes', () => {
    const events = [
      makeEvent('$e1', { ts: 1_000 }),
      makeEvent('$e2', { ts: 60_000 }), // same sender, ~1 min later
    ];
    const timeline = makeTimeline(events);

    const { result } = renderHook(() =>
      useProcessedTimeline({
        ...defaults,
        items: makeItems(2),
        linkedTimelines: [timeline],
      })
    );

    expect(result.current[1].collapsed).toBe(true);
  });

  it('does NOT collapse messages from the same sender more than 2 minutes apart', () => {
    const events = [
      makeEvent('$e1', { ts: 1_000 }),
      makeEvent('$e2', { ts: 3 * 60_000 }), // 3 min later
    ];
    const timeline = makeTimeline(events);

    const { result } = renderHook(() =>
      useProcessedTimeline({
        ...defaults,
        items: makeItems(2),
        linkedTimelines: [timeline],
      })
    );

    expect(result.current[1].collapsed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Stable-ref optimisation
  // -------------------------------------------------------------------------

  it('reuses the same ProcessedEvent reference when nothing changed (stable-ref)', () => {
    const events = [makeEvent('$e1'), makeEvent('$e2')];
    const timeline = makeTimeline(events);
    const items = makeItems(2);

    const { result, rerender } = renderHook(
      ({ ver }) =>
        useProcessedTimeline({
          ...defaults,
          items,
          linkedTimelines: [timeline],
          mutationVersion: ver,
        }),
      { initialProps: { ver: 0 } }
    );

    const firstRender = result.current;

    // Re-render with the same mutationVersion — refs should be reused
    rerender({ ver: 0 });

    expect(result.current[0]).toBe(firstRender[0]);
    expect(result.current[1]).toBe(firstRender[1]);
  });

  it('creates fresh ProcessedEvent objects when mutationVersion increments', () => {
    const events = [makeEvent('$e1'), makeEvent('$e2')];
    const timeline = makeTimeline(events);
    const items = makeItems(2);

    const { result, rerender } = renderHook(
      ({ ver }) =>
        useProcessedTimeline({
          ...defaults,
          items,
          linkedTimelines: [timeline],
          mutationVersion: ver,
        }),
      { initialProps: { ver: 0 } }
    );

    const firstRender = result.current;

    // Bump mutation version — stale refs must not be reused
    rerender({ ver: 1 });

    expect(result.current[0]).not.toBe(firstRender[0]);
    expect(result.current[1]).not.toBe(firstRender[1]);
  });

  it('creates fresh ProcessedEvent objects when itemIndex shifts after back-pagination', () => {
    // Initial: one event at index 0
    const existingEvent = makeEvent('$existing');
    const timelineV1 = makeTimeline([existingEvent]);

    const { result, rerender } = renderHook(
      ({ linkedTimelines, items }: { linkedTimelines: EventTimeline[]; items: number[] }) =>
        useProcessedTimeline({
          ...defaults,
          items,
          linkedTimelines,
          mutationVersion: 0, // unchanged — only the itemIndex changes
        }),
      {
        initialProps: {
          linkedTimelines: [timelineV1],
          items: [0],
        },
      }
    );

    const firstRef = result.current[0];
    expect(firstRef.id).toBe('$existing');
    expect(firstRef.itemIndex).toBe(0);

    // Back-pagination prepends a new event at the front — existing event now at index 1
    const newEvent = makeEvent('$new');
    const timelineV2 = makeTimeline([newEvent, existingEvent]);

    rerender({ linkedTimelines: [timelineV2], items: [0, 1] });

    const existingProcessed = result.current.find((e) => e.id === '$existing')!;
    // itemIndex must be 1 (updated), NOT 0 (stale from previous render)
    expect(existingProcessed.itemIndex).toBe(1);
    // And it must be a new object, not the stale cached ref
    expect(existingProcessed).not.toBe(firstRef);
  });

  it('filters events from ignored users', () => {
    const events = [
      makeEvent('$e1', { sender: '@alice:test' }),
      makeEvent('$e2', { sender: '@ignored:test' }),
      makeEvent('$e3', { sender: '@alice:test' }),
    ];
    const timeline = makeTimeline(events);

    const { result } = renderHook(() =>
      useProcessedTimeline({
        ...defaults,
        items: makeItems(3),
        linkedTimelines: [timeline],
        ignoredUsersSet: new Set(['@ignored:test']),
      })
    );

    const ids = result.current.map((e) => e.id);
    expect(ids).not.toContain('$e2');
    expect(ids).toContain('$e1');
    expect(ids).toContain('$e3');
  });

  it('places willRenderNewDivider on the event immediately after readUptoEventId', () => {
    const events = [
      makeEvent('$read', { sender: '@bob:test', ts: 1_000 }),
      makeEvent('$new', { sender: '@bob:test', ts: 2_000 }),
    ];
    const timeline = makeTimeline(events);

    const { result } = renderHook(() =>
      useProcessedTimeline({
        ...defaults,
        items: makeItems(2),
        linkedTimelines: [timeline],
        mxUserId: '@alice:test', // different from sender so divider renders
        readUptoEventId: '$read',
      })
    );

    expect(result.current[1].willRenderNewDivider).toBe(true);
  });

  it('places willRenderDayDivider between events on different calendar days', () => {
    const DAY = 86_400_000;
    const events = [
      makeEvent('$e1', { ts: 1_000 }),
      makeEvent('$e2', { ts: 1_000 + DAY + 1 }), // next day
    ];
    const timeline = makeTimeline(events);

    const { result } = renderHook(() =>
      useProcessedTimeline({
        ...defaults,
        items: makeItems(2),
        linkedTimelines: [timeline],
      })
    );

    expect(result.current[1].willRenderDayDivider).toBe(true);
  });
});
