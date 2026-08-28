import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { faker } from '@faker-js/faker';
import { M_POLL_RESPONSE } from 'matrix-js-sdk';
import type { EventTimeline, EventTimelineSet, MatrixEvent } from '$types/matrix-sdk';
import { EventType, RelationType } from '$types/matrix-sdk';
import type { ResolvedHiddenEventSettings } from '$state/hooks/settings';
import type { ProcessedEvent } from './useProcessedTimeline';
import {
  getProcessedRowIndexForRawTimelineIndex,
  useProcessedTimeline,
} from './useProcessedTimeline';
import { M_POLL_START } from 'matrix-js-sdk';

const MY_USER = '@alice:test';
const OTHER_USER = '@bob:test';

const hiddenEvents: ResolvedHiddenEventSettings = {
  showHiddenEvents: false,
  showTombstoneEvents: false,
  hiddenEventEdits: false,
  hiddenEventRedactionTimeline: false,
  hiddenEventReactions: false,
  hiddenEventReactionTombstone: false,
  hiddenEventReactionRedactionTimeline: false,
  hiddenEventOther: false,
};

type FakeEventOptions = {
  id: string;
  type?: string;
  sender?: string;
  content?: Record<string, unknown>;
  prevContent?: Record<string, unknown>;
  relation?: { rel_type: string; event_id: string; key?: string };
  threadRootId?: string;
  ts?: number;
  localTimestamp?: number;
  isRedaction?: boolean;
};

function createEvent({
  id,
  type = EventType.RoomMessage as string,
  sender = OTHER_USER,
  content = { msgtype: 'm.text', body: 'hello' },
  prevContent = {},
  relation,
  threadRootId,
  ts = 1_000_000,
  localTimestamp = ts,
  isRedaction = false,
}: FakeEventOptions): MatrixEvent {
  return {
    getId: () => id,
    getType: () => type,
    getSender: () => sender,
    getContent: () => content,
    getPrevContent: () => prevContent,
    getWireContent: () => content,
    getTs: () => ts,
    localTimestamp,
    isRedacted: () => false,
    isRedaction: () => isRedaction,
    isEncrypted: () => false,
    getAssociatedStatus: () => null,
    getRelation: () => relation ?? null,
    threadRootId,
  } as unknown as MatrixEvent;
}

function createReaction(
  id: string,
  targetId: string,
  ts = 1_000_000,
  localTimestamp = ts
): MatrixEvent {
  const relation = { rel_type: RelationType.Annotation, event_id: targetId, key: '👍' };
  return createEvent({
    id,
    type: EventType.Reaction,
    content: { 'm.relates_to': relation },
    relation,
    ts,
    localTimestamp,
  });
}

function createEdit(id: string, targetId: string): MatrixEvent {
  const relation = { rel_type: RelationType.Replace, event_id: targetId };
  return createEvent({
    id,
    content: {
      msgtype: 'm.text',
      body: '* edited',
      'm.new_content': { msgtype: 'm.text', body: 'edited' },
      'm.relates_to': relation,
    },
    relation,
  });
}

function createThreadReply(id: string, rootId: string): MatrixEvent {
  const relation = { rel_type: RelationType.Thread, event_id: rootId };
  return createEvent({
    id,
    content: { msgtype: 'm.text', body: 'thread reply', 'm.relates_to': relation },
    relation,
    threadRootId: rootId,
  });
}

function createPollResponse(id: string, pollStartId: string): MatrixEvent {
  const relation = { rel_type: RelationType.Reference, event_id: pollStartId };
  return createEvent({
    id,
    type: M_POLL_RESPONSE.name,
    content: { 'm.relates_to': relation },
    relation,
  });
}

function createRedaction(id: string, targetId: string): MatrixEvent {
  return createEvent({
    id,
    type: EventType.RoomRedaction,
    content: { redacts: targetId },
    isRedaction: true,
  });
}

function createMembership(id: string): MatrixEvent {
  return createEvent({
    id,
    type: EventType.RoomMember,
    content: { membership: 'join' },
  });
}

function createTimeline(events: MatrixEvent[], relationEvents: MatrixEvent[] = []): EventTimeline {
  const timelineSet = {
    relations: {
      getChildEventsForEvent: (parentId: string, relationType: string, eventType: string) => {
        const relations = relationEvents.filter(
          (event) =>
            event.getRelation()?.event_id === parentId &&
            event.getRelation()?.rel_type === relationType &&
            event.getType() === eventType
        );
        if (relations.length === 0) return null;
        return {
          getRelations: () => relations,
          getSortedAnnotationsByKey: () => null,
        };
      },
    },
  } as unknown as EventTimelineSet;
  return {
    getEvents: () => events,
    getTimelineSet: () => timelineSet,
  } as unknown as EventTimeline;
}

function processTimeline(
  events: MatrixEvent[],
  readUptoEventId: string | undefined
): ProcessedEvent[] {
  const { result } = renderHook(() =>
    useProcessedTimeline({
      items: events.map((_, i) => i),
      linkedTimelines: [createTimeline(events)],
      ignoredUsersSet: new Set(),
      hiddenEvents,
      mxUserId: MY_USER,
      readUptoEventId,
      hideMembershipEvents: true,
      hideNickAvatarEvents: true,
      isReadOnly: false,
      hideMemberInReadOnly: false,
    })
  );
  return result.current;
}

const renderedIds = (processed: ProcessedEvent[]) => processed.map((e) => e.id);
const dividerIds = (processed: ProcessedEvent[]) =>
  processed.filter((e) => e.willRenderNewDivider).map((e) => e.id);

describe('useProcessedTimeline new-messages divider', () => {
  it('deduplicates events from overlapping timeline windows', () => {
    const event = createEvent({ id: '$duplicate' });

    expect(renderedIds(processTimeline([event, event], undefined))).toEqual(['$duplicate']);
  });

  it('renders an event that is still encrypted', () => {
    const processed = processTimeline(
      [
        createEvent({ id: '$a' }),
        createEvent({
          id: '$encrypted',
          type: EventType.RoomMessageEncrypted as string,
          content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'AwgAEnB...' },
        }),
      ],
      undefined
    );

    expect(renderedIds(processed)).toEqual(['$a', '$encrypted']);
  });

  it('keeps poll start events with default hidden-event settings', () => {
    const processed = processTimeline(
      [
        createEvent({
          id: '$poll',
          type: M_POLL_START.name,
          content: { 'm.poll.start': {} },
        }),
      ],
      undefined
    );

    expect(renderedIds(processed)).toEqual(['$poll']);
  });

  it('processes append-only messages without rebuilding existing rows', () => {
    const events = [
      createEvent({ id: '$a', ts: 1_000_000 }),
      createEvent({ id: '$b', ts: 1_000_500 }),
    ];
    const timeline = createTimeline(events);
    const ignoredUsersSet = new Set<string>();
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) =>
        useProcessedTimeline({
          items: Array.from({ length: count }, (_, index) => index),
          linkedTimelines: [timeline],
          ignoredUsersSet,
          hiddenEvents,
          mxUserId: MY_USER,
          readUptoEventId: undefined,
          hideMembershipEvents: true,
          hideNickAvatarEvents: true,
          isReadOnly: false,
          hideMemberInReadOnly: false,
        }),
      { initialProps: { count: events.length } }
    );
    const existingRows = [...result.current];

    events.push(createEvent({ id: '$c', ts: 1_001_000 }));
    rerender({ count: events.length });

    expect(result.current.slice(0, 2)).toEqual(existingRows);
    expect(result.current[0]).toBe(existingRows[0]);
    expect(result.current[1]).toBe(existingRows[1]);
    expect(result.current[2]).toMatchObject({ id: '$c', collapsed: true });
  });

  it('rebuilds a cached row when its send status changes in place', () => {
    let echoStatus: string | null = 'sending';
    const echo = createEvent({ id: '$echo', ts: 1_000_500, sender: MY_USER });
    Object.defineProperty(echo, 'getAssociatedStatus', { value: () => echoStatus });
    const events = [createEvent({ id: '$a', ts: 1_000_000 }), echo];
    const timeline = createTimeline(events);
    const ignoredUsersSet = new Set<string>();
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) =>
        useProcessedTimeline({
          items: Array.from({ length: count }, (_, index) => index),
          linkedTimelines: [timeline],
          ignoredUsersSet,
          hiddenEvents,
          mxUserId: MY_USER,
          readUptoEventId: undefined,
          hideMembershipEvents: true,
          hideNickAvatarEvents: true,
          isReadOnly: false,
          hideMemberInReadOnly: false,
        }),
      { initialProps: { count: events.length } }
    );
    const existingRows = [...result.current];

    echoStatus = 'not_sent';
    events.push(createEvent({ id: '$c', ts: 1_001_000 }));
    rerender({ count: events.length });

    expect(result.current[1]).not.toBe(existingRows[1]);
    expect(result.current[2]).toMatchObject({ id: '$c' });
  });

  it('rebuilds rows when an event lands mid-prefix instead of being appended', () => {
    const events = [
      createEvent({ id: '$a', ts: 1_000_000 }),
      createEvent({ id: '$b', ts: 1_000_500 }),
      createEvent({ id: '$c', ts: 1_001_000 }),
    ];
    const timeline = createTimeline(events);
    const ignoredUsersSet = new Set<string>();
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) =>
        useProcessedTimeline({
          items: Array.from({ length: count }, (_, index) => index),
          linkedTimelines: [timeline],
          ignoredUsersSet,
          hiddenEvents,
          mxUserId: MY_USER,
          readUptoEventId: undefined,
          hideMembershipEvents: true,
          hideNickAvatarEvents: true,
          isReadOnly: false,
          hideMemberInReadOnly: false,
        }),
      { initialProps: { count: events.length } }
    );

    // Both anchors — the first event and the one at the old last index — survive,
    // so only a full prefix check can tell this from an append.
    events.splice(1, 1, createEvent({ id: '$mid', ts: 1_000_200 }));
    events.push(createEvent({ id: '$d', ts: 1_001_500 }));
    rerender({ count: events.length });

    expect(renderedIds(result.current)).toEqual(['$a', '$mid', '$c', '$d']);
    expect(result.current.map((e) => e.itemIndex)).toEqual([0, 1, 2, 3]);
  });

  it('rebuilds relation state when an appended event can change an existing row', () => {
    const events = [createEvent({ id: '$a' }), createEvent({ id: '$b' })];
    const timeline = createTimeline(events);
    const ignoredUsersSet = new Set<string>();
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) =>
        useProcessedTimeline({
          items: Array.from({ length: count }, (_, index) => index),
          linkedTimelines: [timeline],
          ignoredUsersSet,
          hiddenEvents,
          mxUserId: MY_USER,
          readUptoEventId: undefined,
          hideMembershipEvents: true,
          hideNickAvatarEvents: true,
          isReadOnly: false,
          hideMemberInReadOnly: false,
        }),
      { initialProps: { count: events.length } }
    );
    const firstRow = result.current[0];

    events.push(createReaction('$reaction', '$a'));
    rerender({ count: events.length });

    expect(renderedIds(result.current)).toEqual(['$a', '$b']);
    expect(result.current[0]).not.toBe(firstRow);
  });

  it('preserves absolute event order across linked timelines', () => {
    const first = [createEvent({ id: '$a' }), createEvent({ id: '$b' })];
    const second = [createEvent({ id: '$c' }), createEvent({ id: '$d' })];
    const { result } = renderHook(() =>
      useProcessedTimeline({
        items: [0, 1, 2, 3],
        linkedTimelines: [createTimeline(first), createTimeline(second)],
        ignoredUsersSet: new Set(),
        hiddenEvents,
        mxUserId: MY_USER,
        readUptoEventId: undefined,
        hideMembershipEvents: true,
        hideNickAvatarEvents: true,
        isReadOnly: false,
        hideMemberInReadOnly: false,
      })
    );

    expect(renderedIds(result.current)).toEqual(['$a', '$b', '$c', '$d']);
  });

  it('renders exactly one divider after a receipt anchored on a rendered message', () => {
    const processed = processTimeline([createEvent({ id: '$a' }), createEvent({ id: '$b' })], '$a');

    expect(renderedIds(processed)).toEqual(['$a', '$b']);
    expect(dividerIds(processed)).toEqual(['$b']);
  });

  it.each([
    ['reaction', () => createReaction('$anchor', '$a')],
    ['edit', () => createEdit('$anchor', '$a')],
    ['thread reply', () => createThreadReply('$anchor', '$a')],
    ['hidden membership event', () => createMembership('$anchor')],
  ])('renders the divider when the receipt is anchored on a filtered %s', (_kind, anchor) => {
    const processed = processTimeline(
      [createEvent({ id: '$a' }), anchor(), createEvent({ id: '$b' })],
      '$anchor'
    );

    expect(renderedIds(processed)).toEqual(['$a', '$b']);
    expect(dividerIds(processed)).toEqual(['$b']);
  });

  it('keeps the divider pending across consecutive filtered events', () => {
    const processed = processTimeline(
      [
        createEvent({ id: '$a' }),
        createReaction('$r', '$a'),
        createEdit('$e', '$a'),
        createEvent({ id: '$b' }),
      ],
      '$r'
    );

    expect(renderedIds(processed)).toEqual(['$a', '$b']);
    expect(dividerIds(processed)).toEqual(['$b']);
  });

  it('keeps the divider pending when a filtered event follows a rendered receipt', () => {
    const processed = processTimeline(
      [createEvent({ id: '$a' }), createReaction('$r', '$a'), createEvent({ id: '$b' })],
      '$a'
    );

    expect(renderedIds(processed)).toEqual(['$a', '$b']);
    expect(dividerIds(processed)).toEqual(['$b']);
  });

  it('skips own messages when placing the divider after a filtered anchor', () => {
    const processed = processTimeline(
      [
        createEvent({ id: '$a' }),
        createReaction('$r', '$a'),
        createEvent({ id: '$mine', sender: MY_USER }),
        createEvent({ id: '$b' }),
      ],
      '$r'
    );

    expect(renderedIds(processed)).toEqual(['$a', '$mine', '$b']);
    expect(dividerIds(processed)).toEqual(['$b']);
  });

  it('renders no divider when the receipt is on the newest event', () => {
    const processed = processTimeline(
      [createEvent({ id: '$a' }), createEvent({ id: '$b' }), createReaction('$r', '$b')],
      '$r'
    );

    expect(dividerIds(processed)).toEqual([]);
  });

  it('renders no divider when the receipt event is not in the timeline', () => {
    const processed = processTimeline(
      [createEvent({ id: '$a' }), createEvent({ id: '$b' })],
      '$elsewhere'
    );

    expect(dividerIds(processed)).toEqual([]);
  });

  it('renders exactly one divider when a reaction merges between the anchor and its row', () => {
    const events = [
      createEvent({ id: '$a', ts: 1000 }),
      createEvent({ id: '$b', ts: 3000 }),
      createReaction('$r', '$a'),
    ];
    const { result } = renderHook(() =>
      useProcessedTimeline({
        items: events.map((_, index) => index),
        linkedTimelines: [createTimeline(events)],
        ignoredUsersSet: new Set(),
        hiddenEvents: { ...hiddenEvents, hiddenEventReactions: true },
        mxUserId: MY_USER,
        readUptoEventId: '$a',
        hideMembershipEvents: false,
        hideNickAvatarEvents: false,
        isReadOnly: false,
        hideMemberInReadOnly: false,
      })
    );

    expect(dividerIds(result.current)).toHaveLength(1);
  });

  it('places a reaction whose target is filtered out by timeline order, not at the end', () => {
    const ignored = '@ignored:example.org';
    const events = [
      createEvent({ id: '$a', ts: 1000 }),
      createEvent({ id: '$hidden', ts: 2000, sender: ignored }),
      createReaction('$r', '$hidden'),
      createEvent({ id: '$b', ts: 4000 }),
      createEvent({ id: '$c', ts: 5000 }),
    ];
    const { result } = renderHook(() =>
      useProcessedTimeline({
        items: events.map((_, index) => index),
        linkedTimelines: [createTimeline(events)],
        ignoredUsersSet: new Set([ignored]),
        hiddenEvents: { ...hiddenEvents, hiddenEventReactions: true },
        mxUserId: MY_USER,
        readUptoEventId: undefined,
        hideMembershipEvents: false,
        hideNickAvatarEvents: false,
        isReadOnly: false,
        hideMemberInReadOnly: false,
      })
    );

    expect(renderedIds(result.current)).toEqual(['$a', '$r', '$b', '$c']);
  });

  it('keeps indexed reactions and orphan edits in timeline order', () => {
    const ignored = '@ignored:example.org';
    const events = [
      createEvent({ id: '$a' }),
      createEvent({ id: '$b' }),
      createReaction('$reaction', '$a'),
      createEvent({ id: '$hidden', sender: ignored }),
      createEdit('$edit', '$hidden'),
      createEvent({ id: '$c' }),
    ];
    const { result } = renderHook(() =>
      useProcessedTimeline({
        items: events.map((_, index) => index),
        linkedTimelines: [createTimeline(events)],
        ignoredUsersSet: new Set([ignored]),
        hiddenEvents: {
          ...hiddenEvents,
          hiddenEventReactions: true,
          hiddenEventEdits: true,
        },
        mxUserId: MY_USER,
        readUptoEventId: undefined,
        hideMembershipEvents: false,
        hideNickAvatarEvents: false,
        isReadOnly: false,
        hideMemberInReadOnly: false,
      })
    );

    expect(renderedIds(result.current)).toEqual(['$a', '$b', '$reaction', '$edit', '$c']);
  });

  it('uses raw timeline order when reaction timestamps are equal', () => {
    const events = [
      createEvent({ id: '$a', ts: 1000 }),
      createEvent({ id: '$b', ts: 1000 }),
      createEvent({ id: '$c', ts: 1000 }),
      createReaction('$r', '$a'),
    ];
    const { result } = renderHook(() =>
      useProcessedTimeline({
        items: events.map((_, index) => index),
        linkedTimelines: [createTimeline(events)],
        ignoredUsersSet: new Set(),
        hiddenEvents: { ...hiddenEvents, hiddenEventReactions: true },
        mxUserId: MY_USER,
        readUptoEventId: undefined,
        hideMembershipEvents: false,
        hideNickAvatarEvents: false,
        isReadOnly: false,
        hideMemberInReadOnly: false,
      })
    );

    expect(renderedIds(result.current)).toEqual(['$a', '$b', '$c', '$r']);
  });

  it('keeps an indexed next-day reaction after intervening messages', () => {
    const day24 = Date.UTC(2026, 6, 24, 19, 8);
    const day25 = Date.UTC(2026, 6, 25, 5, 3);
    const events = [
      createEvent({ id: '$parent', ts: day24 }),
      createEvent({ id: '$message-a', ts: day24 + 60_000 }),
      createEvent({ id: '$message-b', ts: day24 + 120_000 }),
      createReaction('$reaction', '$parent', day25),
    ];
    const { result } = renderHook(() =>
      useProcessedTimeline({
        items: events.map((_, index) => index),
        linkedTimelines: [createTimeline(events)],
        ignoredUsersSet: new Set(),
        hiddenEvents: { ...hiddenEvents, hiddenEventReactions: true },
        mxUserId: MY_USER,
        readUptoEventId: undefined,
        hideMembershipEvents: false,
        hideNickAvatarEvents: false,
        isReadOnly: false,
        hideMemberInReadOnly: false,
      })
    );

    expect(renderedIds(result.current)).toEqual([
      '$parent',
      '$message-a',
      '$message-b',
      '$reaction',
    ]);
    expect(
      result.current.filter((event) => event.willRenderDayDivider).map((event) => event.id)
    ).toEqual(['$reaction']);
  });

  it('places fetched reactions chronologically instead of relation insertion order', () => {
    const parent = createEvent({ id: '$parent', ts: 1_000 });
    const events = [
      parent,
      createEvent({ id: '$later-a', ts: 3_000 }),
      createEvent({ id: '$later-b', ts: 5_000 }),
    ];
    const fetchedReactions = [
      createReaction('$newest', '$parent', 6_000),
      createReaction('$middle', '$parent', 2_000),
      createReaction('$oldest', '$parent', 1_500),
    ];
    const timeline = createTimeline(events, fetchedReactions);
    const { result } = renderHook(() =>
      useProcessedTimeline({
        items: events.map((_, index) => index),
        linkedTimelines: [timeline],
        ignoredUsersSet: new Set(),
        hiddenEvents: { ...hiddenEvents, hiddenEventReactions: true },
        mxUserId: MY_USER,
        readUptoEventId: undefined,
        hideMembershipEvents: false,
        hideNickAvatarEvents: false,
        isReadOnly: false,
        hideMemberInReadOnly: false,
      })
    );

    expect(renderedIds(result.current)).toEqual([
      '$parent',
      '$oldest',
      '$middle',
      '$later-a',
      '$later-b',
      '$newest',
    ]);
  });

  it('places an older fetched reaction before a newer indexed reaction in the same gap', () => {
    const parent = createEvent({ id: '$parent', ts: 1_000 });
    const indexedReaction = createReaction('$indexed-newer', '$parent', 2_500);
    const later = createEvent({ id: '$later', ts: 3_000 });
    const fetchedReaction = createReaction('$fetched-older', '$parent', 2_000);
    const events = [parent, indexedReaction, later];
    const timeline = createTimeline(events, [fetchedReaction]);
    const { result } = renderHook(() =>
      useProcessedTimeline({
        items: events.map((_, index) => index),
        linkedTimelines: [timeline],
        ignoredUsersSet: new Set(),
        hiddenEvents: { ...hiddenEvents, hiddenEventReactions: true },
        mxUserId: MY_USER,
        readUptoEventId: undefined,
        hideMembershipEvents: false,
        hideNickAvatarEvents: false,
        isReadOnly: false,
        hideMemberInReadOnly: false,
      })
    );

    expect(renderedIds(result.current)).toEqual([
      '$parent',
      '$fetched-older',
      '$indexed-newer',
      '$later',
    ]);
  });

  it('uses the SDK local timestamp to place a fetched reaction', () => {
    const events = [
      createEvent({ id: '$parent', ts: 1_000 }),
      createEvent({ id: '$later', ts: 3_000 }),
    ];
    const fetchedReaction = createReaction('$reaction', '$parent', 10_000, 2_000);
    const timeline = createTimeline(events, [fetchedReaction]);
    const { result } = renderHook(() =>
      useProcessedTimeline({
        items: events.map((_, index) => index),
        linkedTimelines: [timeline],
        ignoredUsersSet: new Set(),
        hiddenEvents: { ...hiddenEvents, hiddenEventReactions: true },
        mxUserId: MY_USER,
        readUptoEventId: undefined,
        hideMembershipEvents: false,
        hideNickAvatarEvents: false,
        isReadOnly: false,
        hideMemberInReadOnly: false,
      })
    );

    expect(renderedIds(result.current)).toEqual(['$parent', '$reaction', '$later']);
  });

  it('drops a cached row whose event id was rewritten in place by the remote echo', () => {
    let echoId = '~!room:txn1';
    const ignoredUsersSet = new Set<string>();
    const base = createEvent({ id: 'placeholder', ts: 1000 });
    const echo = Object.create(base, {
      getId: { value: () => echoId },
    }) as MatrixEvent;
    const events: MatrixEvent[] = [echo];

    const { result, rerender } = renderHook(() =>
      useProcessedTimeline({
        items: events.map((_, index) => index),
        linkedTimelines: [createTimeline(events)],
        ignoredUsersSet,
        hiddenEvents,
        mxUserId: MY_USER,
        readUptoEventId: undefined,
        hideMembershipEvents: false,
        hideNickAvatarEvents: false,
        isReadOnly: false,
        hideMemberInReadOnly: false,
      })
    );
    expect(renderedIds(result.current)).toEqual(['~!room:txn1']);

    echoId = '$real';
    events.push(createEvent({ id: '$c', ts: 2000 }));
    rerender();

    expect(renderedIds(result.current)).toEqual(['$real', '$c']);
  });

  it('renders no divider without a read receipt', () => {
    const processed = processTimeline(
      [createEvent({ id: '$a' }), createEvent({ id: '$b' })],
      undefined
    );

    expect(dividerIds(processed)).toEqual([]);
  });

  it('renders the divider on a filtered anchor with show-hidden-events enabled', () => {
    const events = [
      createEvent({ id: '$a' }),
      createMembership('$member'),
      createEvent({ id: '$b' }),
      createReaction('$reaction', '$a'),
    ];
    const { result } = renderHook(() =>
      useProcessedTimeline({
        items: events.map((_, index) => index),
        linkedTimelines: [createTimeline(events)],
        ignoredUsersSet: new Set(),
        // Reaction/edit rows merge into their target, which reprocesses every
        // row through a second divider pass.
        hiddenEvents: {
          ...hiddenEvents,
          showHiddenEvents: true,
          hiddenEventReactions: true,
          hiddenEventEdits: true,
        },
        mxUserId: MY_USER,
        readUptoEventId: '$member',
        hideMembershipEvents: true,
        hideNickAvatarEvents: true,
        isReadOnly: false,
        hideMemberInReadOnly: false,
      })
    );

    expect(dividerIds(result.current)).toEqual(['$b']);
  });
});

describe('useProcessedTimeline append-only fast path', () => {
  function appendToTimeline(initial: MatrixEvent[], appended: MatrixEvent) {
    const events = [...initial];
    const timeline = createTimeline(events);
    const ignoredUsersSet = new Set<string>();
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) =>
        useProcessedTimeline({
          items: Array.from({ length: count }, (_, index) => index),
          linkedTimelines: [timeline],
          ignoredUsersSet,
          hiddenEvents,
          mxUserId: MY_USER,
          readUptoEventId: undefined,
          hideMembershipEvents: true,
          hideNickAvatarEvents: true,
          isReadOnly: false,
          hideMemberInReadOnly: false,
        }),
      { initialProps: { count: events.length } }
    );
    const before = [...result.current];

    events.push(appended);
    rerender({ count: events.length });

    return { before, after: result.current };
  }

  // Every relation type can retarget an event already in the cached prefix.
  it.each([
    ['an edit', () => createEdit('$new', '$a')],
    ['a reaction', () => createReaction('$new', '$a')],
    ['a thread reply', () => createThreadReply('$new', '$a')],
    ['a poll response', () => createPollResponse('$new', '$a')],
    ['a redaction', () => createRedaction('$new', '$a')],
  ])('reprocesses the cached prefix when %s arrives', (_label, makeEvent) => {
    const { before, after } = appendToTimeline(
      [createEvent({ id: '$a' }), createEvent({ id: '$b' })],
      makeEvent()
    );

    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
  });

  it.each([
    ['a message', () => createEvent({ id: '$new', ts: 1_000_001 })],
    ['a membership change', () => createMembership('$new')],
    ['a sticker', () => createEvent({ id: '$new', type: EventType.Sticker, ts: 1_000_001 })],
    [
      'a room name change',
      () => createEvent({ id: '$new', type: EventType.RoomName, ts: 1_000_001 }),
    ],
  ])('reuses the cached prefix when %s arrives', (_label, makeEvent) => {
    const { before, after } = appendToTimeline(
      [createEvent({ id: '$a' }), createEvent({ id: '$b' })],
      makeEvent()
    );

    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });
});

describe('getProcessedRowIndexForRawTimelineIndex', () => {
  it('finds the nearest preceding visible row in one pass', () => {
    const processed = processTimeline(
      [createEvent({ id: '$a' }), createReaction('$hidden', '$a'), createEvent({ id: '$b' })],
      undefined
    );

    expect(getProcessedRowIndexForRawTimelineIndex(processed, 1)).toEqual({
      rowIndex: 0,
      focusRawIndex: 0,
    });
    expect(getProcessedRowIndexForRawTimelineIndex(processed, 2)).toEqual({
      rowIndex: 1,
      focusRawIndex: 2,
    });
  });
});

const rowSignature = (rows: ProcessedEvent[]) =>
  rows.map((r) => ({
    id: r.id,
    itemIndex: r.itemIndex,
    collapsed: r.collapsed,
    willRenderNewDivider: r.willRenderNewDivider,
    willRenderDayDivider: r.willRenderDayDivider,
  }));

describe('getProcessedRowIndexForRawTimelineIndex (fuzz)', () => {
  it('matches a filter-based reference over random row maps', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      faker.seed(seed);
      let nextIndex = 0;
      const rows = Array.from(
        { length: faker.number.int({ min: 0, max: 15 }) },
        (): ProcessedEvent => {
          if (faker.datatype.boolean({ probability: 0.25 }))
            return { itemIndex: -1 } as unknown as ProcessedEvent;
          // Real timelines assign each non-sentinel raw index exactly once.
          nextIndex += faker.number.int({ min: 1, max: 3 });
          return { itemIndex: nextIndex } as unknown as ProcessedEvent;
        }
      );
      const start = faker.number.int({ min: -1, max: nextIndex + 2 });

      const candidates = rows
        .map((row, rowIndex) => ({ rowIndex, itemIndex: row.itemIndex }))
        .filter((c) => c.itemIndex >= 0 && c.itemIndex <= start);
      const best = candidates.reduce<(typeof candidates)[number] | undefined>(
        (acc, c) => (acc === undefined || c.itemIndex > acc.itemIndex ? c : acc),
        undefined
      );
      const expected = best
        ? { rowIndex: best.rowIndex, focusRawIndex: best.itemIndex }
        : undefined;

      expect(getProcessedRowIndexForRawTimelineIndex(rows, start), `seed ${seed}`).toEqual(
        expected
      );
    }
  });
});

describe('append-only fast path vs full reprocess (fuzz)', () => {
  it('incremental live appends produce the same rows as a full reprocess', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      faker.seed(seed * 7919);
      const senders = [MY_USER, OTHER_USER, '@carol:test'];

      // Occasional multi-day jumps so day-divider boundaries get crossed.
      const total = faker.number.int({ min: 20, max: 49 });
      let ts = 1_000_000_000_000;
      const events: MatrixEvent[] = [];
      for (let i = 0; i < total; i += 1) {
        ts += faker.datatype.boolean({ probability: 0.08 })
          ? faker.number.int({ min: 1, max: 2 }) * 86_400_000
          : faker.number.int({ min: 0, max: 599_999 });
        const id = `$seed${seed}-e${i}`;
        if (faker.datatype.boolean({ probability: 0.1 })) {
          events.push(
            createEvent({
              id,
              type: EventType.RoomMember as string,
              content: { membership: 'join' },
              ts,
            })
          );
        } else {
          events.push(
            createEvent({
              id,
              type: faker.datatype.boolean({ probability: 0.11 })
                ? (EventType.Sticker as string)
                : undefined,
              sender: faker.helpers.arrayElement(senders),
              ts,
              content: { msgtype: 'm.text', body: `msg ${i}` },
            })
          );
        }
      }
      // Anchor the read marker somewhere arbitrary — possibly on a filtered event.
      const readUptoEventId = faker.datatype.boolean({ probability: 0.4 })
        ? (faker.helpers.arrayElement(events).getId() ?? undefined)
        : undefined;

      const live: MatrixEvent[] = [];
      const timeline = createTimeline(live);
      const ignoredUsersSet = new Set<string>();
      const { result, rerender } = renderHook(
        ({ count }: { count: number }) =>
          useProcessedTimeline({
            items: Array.from({ length: count }, (_, index) => index),
            linkedTimelines: [timeline],
            ignoredUsersSet,
            hiddenEvents,
            mxUserId: MY_USER,
            readUptoEventId,
            hideMembershipEvents: true,
            hideNickAvatarEvents: true,
            isReadOnly: false,
            hideMemberInReadOnly: false,
          }),
        { initialProps: { count: 0 } }
      );

      let cursor = 0;
      while (cursor < events.length) {
        const batch = faker.number.int({ min: 1, max: 5 });
        cursor = Math.min(cursor + batch, events.length);
        live.splice(live.length, 0, ...events.slice(live.length, cursor));
        rerender({ count: cursor });
      }

      // Oracle: a fresh hook instance has no cache, so it always fully reprocesses.
      const fresh = processTimeline(events, readUptoEventId);

      expect(rowSignature(result.current), `seed ${seed}`).toEqual(rowSignature(fresh));
    }
  });

  it('out-of-order (late-delivered) appends force a full reprocess with identical output', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      faker.seed(seed * 104_729);
      const senders = [MY_USER, OTHER_USER, '@carol:test'];

      const total = faker.number.int({ min: 10, max: 25 });
      let ts = 1_000_000_000_000;
      const events: MatrixEvent[] = [];
      for (let i = 0; i < total; i += 1) {
        ts += faker.number.int({ min: 0, max: 599_999 });
        events.push(
          createEvent({
            id: `$late${seed}-e${i}`,
            sender: faker.helpers.arrayElement(senders),
            ts,
            content: { msgtype: 'm.text', body: `msg ${i}` },
          })
        );
      }

      const live = [...events];
      const timeline = createTimeline(live);
      const ignoredUsersSet = new Set<string>();
      const { result, rerender } = renderHook(
        ({ count }: { count: number }) =>
          useProcessedTimeline({
            items: Array.from({ length: count }, (_, index) => index),
            linkedTimelines: [timeline],
            ignoredUsersSet,
            hiddenEvents,
            mxUserId: MY_USER,
            readUptoEventId: undefined,
            hideMembershipEvents: true,
            hideNickAvatarEvents: true,
            isReadOnly: false,
            hideMemberInReadOnly: false,
          }),
        { initialProps: { count: live.length } }
      );

      // A late delivery: appended to the array, but timestamped mid-stream.
      const insertionPoint = faker.number.int({ min: 0, max: events.length - 1 });
      live.push(
        createEvent({
          id: `$late${seed}-straggler`,
          sender: faker.helpers.arrayElement(senders),
          ts: events[insertionPoint]?.getTs() ?? ts,
          content: { msgtype: 'm.text', body: 'late' },
        })
      );
      rerender({ count: live.length });

      const fresh = processTimeline(live, undefined);
      expect(rowSignature(result.current), `seed ${seed}`).toEqual(rowSignature(fresh));
    }
  });

  it('spec-shaped relations and redactions in the stream force reprocessing, output still matches oracle', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      faker.seed(seed * 31_337);
      const senders = [MY_USER, OTHER_USER, '@carol:test'];

      const baseMsg = (id: string, ts: number): MatrixEvent =>
        createEvent({
          id,
          sender: faker.helpers.arrayElement(senders),
          ts,
          content: { msgtype: 'm.text', body: `msg ${id}` },
        });

      const total = faker.number.int({ min: 15, max: 30 });
      let ts = 1_000_000_000_000;
      const all: MatrixEvent[] = [];
      for (let i = 0; i < total; i += 1) {
        ts += faker.number.int({ min: 0, max: 599_999 });
        const id = `$spec${seed}-e${i}`;
        all.push(baseMsg(id, ts));
        if (faker.datatype.boolean({ probability: 0.3 }) && i > 1) {
          const target = faker.helpers.arrayElement(all.slice(0, -1)).getId() ?? id;
          const kind = faker.number.int({ min: 0, max: 3 });
          if (kind === 0) all.push(createReaction(`$spec${seed}-r${i}`, target));
          else if (kind === 1) all.push(createEdit(`$spec${seed}-r${i}`, target));
          else if (kind === 2) all.push(createRedaction(`$spec${seed}-r${i}`, target));
          else all.push(createThreadReply(`$spec${seed}-r${i}`, target));
        }
      }

      const live: MatrixEvent[] = [];
      const timeline = createTimeline(live);
      const ignoredUsersSet = new Set<string>();
      const { result, rerender } = renderHook(
        ({ count }: { count: number }) =>
          useProcessedTimeline({
            items: Array.from({ length: count }, (_, index) => index),
            linkedTimelines: [timeline],
            ignoredUsersSet,
            hiddenEvents,
            mxUserId: MY_USER,
            readUptoEventId: undefined,
            hideMembershipEvents: true,
            hideNickAvatarEvents: true,
            isReadOnly: false,
            hideMemberInReadOnly: false,
          }),
        { initialProps: { count: 0 } }
      );

      let cursor = 0;
      while (cursor < all.length) {
        const batch = faker.number.int({ min: 1, max: 5 });
        cursor = Math.min(cursor + batch, all.length);
        live.splice(live.length, 0, ...all.slice(live.length, cursor));
        rerender({ count: cursor });
      }

      const fresh = processTimeline(all, undefined);
      expect(rowSignature(result.current), `seed ${seed}`).toEqual(rowSignature(fresh));
    }
  });

  it('sliding-sync limited windows replace the stream mid-run and stay consistent', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      faker.seed(seed * 97_403);
      const senders = [MY_USER, OTHER_USER, '@carol:test'];

      const total = faker.number.int({ min: 20, max: 40 });
      let ts = 1_000_000_000_000;
      const all: MatrixEvent[] = [];
      for (let i = 0; i < total; i += 1) {
        ts += faker.number.int({ min: 0, max: 599_999 });
        all.push(
          createEvent({
            id: `$slide${seed}-e${i}`,
            sender: faker.helpers.arrayElement(senders),
            ts,
            content: { msgtype: 'm.text', body: `msg ${i}` },
          })
        );
      }

      const live: MatrixEvent[] = [];
      const timeline = createTimeline(live);
      const ignoredUsersSet = new Set<string>();
      const { result, rerender } = renderHook(
        ({ count }: { count: number }) =>
          useProcessedTimeline({
            items: Array.from({ length: count }, (_, index) => index),
            linkedTimelines: [timeline],
            ignoredUsersSet,
            hiddenEvents,
            mxUserId: MY_USER,
            readUptoEventId: undefined,
            hideMembershipEvents: true,
            hideNickAvatarEvents: true,
            isReadOnly: false,
            hideMemberInReadOnly: false,
          }),
        { initialProps: { count: 0 } }
      );

      let cursor = 0;
      while (cursor < all.length) {
        const batch = faker.number.int({ min: 1, max: 5 });
        cursor = Math.min(cursor + batch, all.length);
        live.splice(live.length, 0, ...all.slice(live.length, cursor));

        // A limited window: the sdk dropped older rows from the live timeline.
        if (cursor < all.length && faker.datatype.boolean({ probability: 0.25 })) {
          const drop = faker.number.int({ min: 1, max: Math.max(1, live.length - 1) });
          const kept = all.slice(drop, cursor);
          // A reset re-instantiates MatrixEvent objects half of the time.
          live.splice(
            0,
            live.length,
            ...(faker.datatype.boolean()
              ? kept.map((e) =>
                  createEvent({
                    id: e.getId() ?? '',
                    sender: e.getSender() ?? '',
                    ts: e.getTs(),
                    content: e.getContent(),
                  })
                )
              : kept)
          );
        }
        rerender({ count: live.length });
      }

      const fresh = processTimeline(live, undefined);
      expect(rowSignature(result.current), `seed ${seed}`).toEqual(rowSignature(fresh));
    }
  });
});

function createEncryptedEvent(id: string, ts: number) {
  const state = {
    type: EventType.RoomMessageEncrypted as string,
    content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'AwgAEnB' } as Record<
      string,
      unknown
    >,
  };
  const mEvent = {
    getId: () => id,
    getType: () => state.type,
    getSender: () => OTHER_USER,
    getContent: () => state.content,
    getPrevContent: () => ({}),
    getWireContent: () => state.content,
    getTs: () => ts,
    isRedacted: () => false,
    isRedaction: () => false,
    getAssociatedStatus: () => null,
    isEncrypted: () => true,
    getRelation: () => null,
    threadRootId: undefined,
  } as unknown as MatrixEvent;
  const decrypt = () => {
    state.type = EventType.RoomMessage as string;
    state.content = { msgtype: 'm.text', body: 'the secret' };
  };
  return { mEvent, decrypt };
}

const bodyOf = (processed: ProcessedEvent[], id: string) =>
  (processed.find((e) => e.id === id)?.content as Record<string, unknown> | undefined)?.body;

describe('useProcessedTimeline decryption', () => {
  // Stable so the append-only fast path is reachable.
  const ignoredUsersSet = new Set<string>();
  const renderTimeline = (
    getEvents: () => MatrixEvent[],
    timelineHiddenEvents: ResolvedHiddenEventSettings = hiddenEvents
  ) =>
    renderHook(() =>
      useProcessedTimeline({
        items: getEvents().map((_, i) => i),
        linkedTimelines: [createTimeline(getEvents())],
        ignoredUsersSet,
        hiddenEvents: timelineHiddenEvents,
        mxUserId: MY_USER,
        readUptoEventId: undefined,
        hideMembershipEvents: true,
        hideNickAvatarEvents: true,
        isReadOnly: false,
        hideMemberInReadOnly: false,
      })
    );

  it('refreshes a row whose event decrypted since it was cached', () => {
    const { mEvent: encrypted, decrypt } = createEncryptedEvent('$enc', 1_000_000);
    let events: MatrixEvent[] = [createEvent({ id: '$a', ts: 999_000 }), encrypted];

    const { result, rerender } = renderTimeline(() => events);
    expect(renderedIds(result.current)).toEqual(['$a', '$enc']);

    decrypt();
    rerender();

    expect(bodyOf(result.current, '$enc')).toBe('the secret');
  });

  it('does not carry a stale encrypted row through the append-only fast path', () => {
    const { mEvent: encrypted, decrypt } = createEncryptedEvent('$enc', 1_000_000);
    let events: MatrixEvent[] = [createEvent({ id: '$a', ts: 999_000 }), encrypted];

    const { result, rerender } = renderTimeline(() => events);

    decrypt();
    events = [...events, createEvent({ id: '$live', ts: 1_001_000 })];
    rerender();

    expect(renderedIds(result.current)).toEqual(['$a', '$enc', '$live']);
    expect(bodyOf(result.current, '$enc')).toBe('the secret');
  });

  it('refreshes a row whose event was redacted since it was cached', () => {
    let redacted = false;
    const event = createEvent({ id: '$redacted' });
    event.isRedacted = () => redacted;
    const { result, rerender } = renderTimeline(() => [event], {
      ...hiddenEvents,
      showTombstoneEvents: true,
    });

    expect(result.current[0]?.isRedacted).toBe(false);

    redacted = true;
    rerender();

    expect(result.current[0]?.isRedacted).toBe(true);
  });

  it('keeps the append-only fast path for unencrypted events', () => {
    let events: MatrixEvent[] = [createEvent({ id: '$a', ts: 999_000 })];
    const { result, rerender } = renderTimeline(() => events);
    const firstRow = result.current[0];

    events = [...events, createEvent({ id: '$b', ts: 1_000_000 })];
    rerender();

    expect(renderedIds(result.current)).toEqual(['$a', '$b']);
    expect(result.current[0]).toBe(firstRow);
  });
});
