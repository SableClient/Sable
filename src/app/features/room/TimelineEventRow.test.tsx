import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Room } from '$types/matrix-sdk';
import type { ProcessedEvent } from '$hooks/timeline/useProcessedTimeline';
import { MessageLayout } from '$state/settings';
import { TimelineEventRow } from './TimelineEventRow';

const createProcessedEvent = (): ProcessedEvent =>
  ({
    id: '$event',
    itemIndex: 0,
    mEvent: {
      getType: () => 'm.room.message',
      getStateKey: () => undefined,
      getTs: () => Date.now(),
    },
    timelineSet: {},
    eventSender: null,
    collapsed: false,
    willRenderNewDivider: false,
    willRenderDayDivider: false,
  }) as unknown as ProcessedEvent;

describe('TimelineEventRow', () => {
  it('keeps backward pagination inside the first virtual row before the first event', () => {
    const { container } = render(
      <TimelineEventRow
        eventData={createProcessedEvent()}
        index={0}
        room={{} as Room}
        messageLayout={MessageLayout.Modern}
        messageSpacing="400"
        canPaginateBack
        backPagination={<div>Loading older messages</div>}
        renderMatrixEvent={() => <div>First message</div>}
      />
    );

    expect(screen.getByText('Loading older messages')).toBeInTheDocument();
    expect(screen.getByText('First message')).toBeInTheDocument();
    expect(container.textContent).toBe('Loading older messagesFirst message');
  });
});
