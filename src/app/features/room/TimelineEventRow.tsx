import type { ReactNode } from 'react';
import { Fragment } from 'react';
import type { Room } from '$types/matrix-sdk';
import type { ContainerColor } from 'folds';
import { as, Badge, Box, color, Line, Text, toRem } from 'folds';
import { MessageBase } from '$components/message';
import { RoomIntro } from '$components/room-intro';
import { today, timeDayMonthYear, yesterday } from '$utils/time';
import { MessageLayout, type MessageSpacing } from '$state/settings';
import type { ProcessedEvent } from '$hooks/timeline/useProcessedTimeline';

const TimelineDivider = as<'div', { variant?: ContainerColor | 'Inherit' }>(
  ({ variant, children, ...props }, ref) => (
    <Box gap="100" justifyContent="Center" alignItems="Center" {...props} ref={ref}>
      <Line style={{ flexGrow: 1 }} variant={variant} size="300" />
      {children}
      <Line style={{ flexGrow: 1 }} variant={variant} size="300" />
    </Box>
  )
);

const getDayDividerText = (ts: number) => {
  if (today(ts)) return 'Today';
  if (yesterday(ts)) return 'Yesterday';
  return timeDayMonthYear(ts);
};

export type TimelineEventRowProps = {
  eventData: ProcessedEvent | undefined;
  index: number;
  room: Room;
  messageLayout: MessageLayout;
  messageSpacing: MessageSpacing;
  canPaginateBack: boolean;
  backPagination?: ReactNode;
  renderMatrixEvent: (
    eventType: string,
    isStateEvent: boolean,
    eventId: string,
    event: ProcessedEvent['mEvent'],
    itemIndex: number,
    timelineSet: ProcessedEvent['timelineSet'],
    collapsed: boolean
  ) => ReactNode;
};

export function TimelineEventRow({
  eventData,
  index,
  room,
  messageLayout,
  messageSpacing,
  canPaginateBack,
  backPagination,
  renderMatrixEvent,
}: Readonly<TimelineEventRowProps>) {
  const introPadding = `${toRem(28)} ${toRem(16)} ${toRem(24)} ${
    messageLayout === MessageLayout.Compact ? toRem(16) : toRem(64)
  }`;

  if (!eventData) {
    if (index === 0 && !canPaginateBack) {
      return (
        <Fragment key="intro-and-first">
          {backPagination}
          <div style={{ padding: introPadding }}>
            <RoomIntro room={room} />
          </div>
        </Fragment>
      );
    }
    if (index === 0) return <Fragment key="first">{backPagination}</Fragment>;
    return <Fragment key={index} />;
  }

  const renderedEvent = renderMatrixEvent(
    eventData.mEvent.getType(),
    typeof eventData.mEvent.getStateKey() === 'string',
    eventData.id,
    eventData.mEvent,
    eventData.itemIndex,
    eventData.timelineSet,
    eventData.collapsed
  );

  const dividers = (
    <>
      {eventData.willRenderDayDivider && (
        <MessageBase space={messageSpacing}>
          <TimelineDivider variant="Surface">
            <Badge as="span" size="500" variant="Secondary" fill="None" radii="300">
              <Text size="L400">{getDayDividerText(eventData.mEvent.getTs())}</Text>
            </Badge>
          </TimelineDivider>
        </MessageBase>
      )}
      {eventData.willRenderNewDivider && (
        <MessageBase space={messageSpacing}>
          <TimelineDivider style={{ color: color.Success.Main }} variant="Inherit">
            <Badge as="span" size="500" variant="Success" fill="Solid" radii="300">
              <Text size="L400">New Messages</Text>
            </Badge>
          </TimelineDivider>
        </MessageBase>
      )}
    </>
  );

  if (index === 0) {
    return (
      <Fragment key="first-item-block">
        {!canPaginateBack && (
          <div style={{ padding: introPadding }}>
            <RoomIntro room={room} />
          </div>
        )}
        {backPagination}
        {dividers}
        {renderedEvent}
      </Fragment>
    );
  }

  return (
    <Fragment key={eventData.id}>
      {dividers}
      {renderedEvent}
    </Fragment>
  );
}
