import type { ReactNode, RefObject } from 'react';
import type { Room } from '$types/matrix-sdk';
import type { VListHandle } from 'virtua';
import { VList } from 'virtua';
import classNames from 'classnames';
import { as, Box, Chip, Icon, Icons, Text, config } from 'folds';
import type { ProcessedEvent } from '$hooks/timeline/useProcessedTimeline';
import type { MessageLayout, MessageSpacing } from '$state/settings';
import * as css from './RoomTimeline.css';
import { TimelineEventRow } from './TimelineEventRow';
import { TimelineLoadingPlaceholders } from './TimelineLoadingPlaceholders';

const TimelineFloat = as<'div', css.TimelineFloatVariants>(
  ({ position, className, ...props }, ref) => (
    <Box
      className={classNames(css.TimelineFloat({ position }), className)}
      justifyContent="Center"
      alignItems="Center"
      gap="200"
      {...props}
      ref={ref}
    />
  )
);

export type TimelineViewportProps = {
  room: Room;
  isReady: boolean;
  atBottom: boolean;
  unreadBanner?: ReactNode;
  messageListRef: RefObject<HTMLDivElement>;
  vListRef: RefObject<VListHandle>;
  data: Array<ProcessedEvent | undefined>;
  bufferSize: number;
  shift: boolean;
  topSpacerHeight: number;
  messageLayout: MessageLayout;
  messageSpacing: MessageSpacing;
  canPaginateBack: boolean;
  backPagination: ReactNode;
  frontPagination: ReactNode;
  onScroll: (offset: number) => void;
  onUserScrollIntent: () => void;
  onJumpLatest: () => void;
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

export function TimelineViewport({
  room,
  isReady,
  atBottom,
  unreadBanner,
  messageListRef,
  vListRef,
  data,
  bufferSize,
  shift,
  topSpacerHeight,
  messageLayout,
  messageSpacing,
  canPaginateBack,
  backPagination,
  frontPagination,
  onScroll,
  onUserScrollIntent,
  onJumpLatest,
  renderMatrixEvent,
}: Readonly<TimelineViewportProps>) {
  return (
    <Box grow="Yes" style={{ position: 'relative' }}>
      {unreadBanner}
      {backPagination && (
        <Box
          justifyContent="Center"
          alignItems="Center"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 5,
            pointerEvents: 'none',
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>{backPagination}</div>
        </Box>
      )}

      <div
        ref={messageListRef}
        onWheelCapture={onUserScrollIntent}
        onTouchStartCapture={onUserScrollIntent}
        onPointerDownCapture={onUserScrollIntent}
        onKeyDownCapture={onUserScrollIntent}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          position: 'relative',
          opacity: isReady ? 1 : 0,
        }}
      >
        <VList<ProcessedEvent | undefined>
          ref={vListRef}
          data={data}
          bufferSize={bufferSize}
          shift={shift}
          className={css.messageList}
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            paddingTop:
              topSpacerHeight > 0
                ? `calc(${config.space.S600} + ${topSpacerHeight}px)`
                : config.space.S600,
            paddingBottom: config.space.S600,
          }}
          onScroll={onScroll}
        >
          {(eventData, index) => (
            <TimelineEventRow
              eventData={eventData}
              index={index}
              room={room}
              messageLayout={messageLayout}
              messageSpacing={messageSpacing}
              canPaginateBack={canPaginateBack}
              renderMatrixEvent={renderMatrixEvent}
            />
          )}
        </VList>
      </div>

      {!isReady && (
        <TimelineLoadingPlaceholders
          messageLayout={messageLayout}
          messageSpacing={messageSpacing}
        />
      )}

      {frontPagination}

      {!atBottom && isReady && (
        <TimelineFloat position="Bottom">
          <Chip
            variant="SurfaceVariant"
            radii="Pill"
            outlined
            before={<Icon size="50" src={Icons.ArrowBottom} />}
            onClick={onJumpLatest}
          >
            <Text size="L400">Jump to Latest</Text>
          </Chip>
        </TimelineFloat>
      )}
    </Box>
  );
}

export { TimelineFloat };
