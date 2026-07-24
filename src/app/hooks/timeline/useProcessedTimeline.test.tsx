import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { EventTimeline, EventTimelineSet, MatrixEvent } from '$types/matrix-sdk';
import type { ResolvedHiddenEventSettings } from '$state/hooks/settings';
import type { ProcessedEvent } from './useProcessedTimeline';
import {
  getProcessedRowIndexForRawTimelineIndex,
  useProcessedTimeline,
} from './useProcessedTimeline';

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
};

function createEvent({
  id,
  type = 'm.room.message',
  sender = OTHER_USER,
  content = { msgtype: 'm.text', body: 'hello' },
  prevContent = {},
  relation,
  threadRootId,
  ts = 1_000_000,
}: FakeEventOptions): MatrixEvent {
  return {
    getId: () => id,
    getType: () => type,
    getSender: () => sender,
    getContent: () => content,
    getPrevContent: () => prevContent,
    getWireContent: () => content,
    getTs: () => ts,
    isRedacted: () => false,
    isRedaction: () => false,
    isEncrypted: () => false,
    getRelation: () => relation ?? null,
    threadRootId,
  } as unknown as MatrixEvent;
}

function createReaction(id: string, targetId: string): MatrixEvent {
  const relation = { rel_type: 'm.annotation', event_id: targetId, key: '👍' };
  return createEvent({
    id,
    type: 'm.reaction',
    content: { 'm.relates_to': relation },
    relation,
  });
}

function createEdit(id: string, targetId: string): MatrixEvent {
  const relation = { rel_type: 'm.replace', event_id: targetId };
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
  const relation = { rel_type: 'm.thread', event_id: rootId };
  return createEvent({
    id,
    content: { msgtype: 'm.text', body: 'thread reply', 'm.relates_to': relation },
    relation,
    threadRootId: rootId,
  });
}

function createMembership(id: string): MatrixEvent {
  return createEvent({
    id,
    type: 'm.room.member',
    content: { membership: 'join' },
  });
}

function createTimeline(events: MatrixEvent[]): EventTimeline {
  const timelineSet = {
    relations: {
      getChildEventsForEvent: () => null,
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

  it('renders no divider without a read receipt', () => {
    const processed = processTimeline(
      [createEvent({ id: '$a' }), createEvent({ id: '$b' })],
      undefined
    );

    expect(dividerIds(processed)).toEqual([]);
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
