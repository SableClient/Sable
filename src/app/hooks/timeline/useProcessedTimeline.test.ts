import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EventType } from '$types/matrix-sdk';
import type { ProcessedEvent } from './useProcessedTimeline';
import {
  getProcessedRowIndexForRawTimelineIndex,
  getProcessedRowIndexForRawTimelineIndexForward,
  useProcessedTimeline,
} from './useProcessedTimeline';

const makeProcessedEvent = (itemIndex: number, id: string): ProcessedEvent =>
  ({
    id,
    itemIndex,
    mEvent: { getId: () => id } as never,
    timelineSet: {} as never,
    eventSender: null,
    collapsed: false,
    willRenderNewDivider: false,
    willRenderDayDivider: false,
  }) satisfies ProcessedEvent;

describe('raw timeline row fallbacks', () => {
  const processedEvents = [
    makeProcessedEvent(0, '$zero'),
    makeProcessedEvent(3, '$three'),
    makeProcessedEvent(5, '$five'),
  ];

  it('walks backward to the previous visible row', () => {
    expect(getProcessedRowIndexForRawTimelineIndex(processedEvents, 4)).toEqual({
      rowIndex: 1,
      focusRawIndex: 3,
    });
  });

  it('walks forward to the next visible row', () => {
    expect(getProcessedRowIndexForRawTimelineIndexForward(processedEvents, 4)).toEqual({
      rowIndex: 2,
      focusRawIndex: 5,
    });
  });

  it('keeps an exact visible row match when one exists', () => {
    expect(getProcessedRowIndexForRawTimelineIndexForward(processedEvents, 3)).toEqual({
      rowIndex: 1,
      focusRawIndex: 3,
    });
  });

  it('returns undefined when there is no later visible row', () => {
    expect(getProcessedRowIndexForRawTimelineIndexForward(processedEvents, 6)).toBeUndefined();
  });
});

const hiddenEvents = {
  showHiddenEvents: false,
  showTombstoneEvents: false,
  hiddenEventEdits: false,
  hiddenEventRedactionTimeline: false,
  hiddenEventReactions: false,
  hiddenEventReactionTombstone: false,
  hiddenEventReactionRedactionTimeline: false,
  hiddenEventOther: false,
} as const;

const makeMatrixEvent = (params: {
  id: string;
  ts: number;
  type: string;
  sender?: string;
  content?: Record<string, unknown>;
}) =>
  ({
    getId: () => params.id,
    getTs: () => params.ts,
    getType: () => params.type,
    getSender: () => params.sender ?? '@bob:test',
    getContent: () => params.content ?? {},
    getRelation: () => undefined,
    isRedaction: () => false,
    isRedacted: () => false,
  }) as never;

describe('useProcessedTimeline unread divider', () => {
  it('keeps the unread divider when the read marker event is hidden', () => {
    const hiddenReadMarker = makeMatrixEvent({
      id: '$read',
      ts: 1,
      type: EventType.Reaction as string,
      content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$root', key: 'a' } },
    });
    const firstUnread = makeMatrixEvent({
      id: '$unread',
      ts: 2,
      type: EventType.RoomMessage as string,
      content: { body: 'hello', msgtype: 'm.text' },
    });
    const timeline = {
      getEvents: () => [hiddenReadMarker, firstUnread],
      getTimelineSet: () => ({}),
    } as never;

    const { result } = renderHook(() =>
      useProcessedTimeline({
        items: [0, 1],
        linkedTimelines: [timeline],
        ignoredUsersSet: new Set<string>(),
        hiddenEvents,
        mxUserId: '@alice:test',
        readUptoEventId: '$read',
        hideMembershipEvents: false,
        hideNickAvatarEvents: false,
        isReadOnly: false,
        hideMemberInReadOnly: false,
        messageGroupingThreshold: 2,
      })
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.id).toBe('$unread');
    expect(result.current[0]?.willRenderNewDivider).toBe(true);
  });
});
