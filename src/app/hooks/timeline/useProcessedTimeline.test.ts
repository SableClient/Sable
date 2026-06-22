import { describe, expect, it } from 'vitest';
import type { ProcessedEvent } from './useProcessedTimeline';
import {
  getProcessedRowIndexForRawTimelineIndex,
  getProcessedRowIndexForRawTimelineIndexForward,
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
