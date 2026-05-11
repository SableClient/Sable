import {
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type TouchEvent,
  type WheelEvent,
} from 'react';
import type { Room } from '$types/matrix-sdk';
import type { VListHandle } from 'virtua';
import { VList } from 'virtua';
import classNames from 'classnames';
import { as, Box, Chip, Icon, Icons, Text, config } from 'folds';
import type { ProcessedEvent } from '$hooks/timeline/useProcessedTimeline';
import type { MessageLayout, MessageSpacing } from '$state/settings';
import type { TimelineScrollDirection } from './timelineViewportModel';
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

const getDirectionFromDelta = (deltaY: number): TimelineScrollDirection | undefined => {
  if (deltaY > 0) return 'forward';
  if (deltaY < 0) return 'backward';
  return undefined;
};

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
  onUserScrollIntent: (direction?: TimelineScrollDirection) => void;
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
  const lastTouchYRef = useRef<number | undefined>(undefined);

  const handleWheelIntent = (event: WheelEvent<HTMLDivElement>) => {
    onUserScrollIntent(getDirectionFromDelta(event.deltaY));
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    lastTouchYRef.current = event.touches[0]?.clientY;
  };

  const handleTouchMoveIntent = (event: TouchEvent<HTMLDivElement>) => {
    const nextY = event.touches[0]?.clientY;
    const prevY = lastTouchYRef.current;
    lastTouchYRef.current = nextY;
    if (nextY === undefined || prevY === undefined) {
      onUserScrollIntent();
      return;
    }
    onUserScrollIntent(getDirectionFromDelta(prevY - nextY));
  };

  const handleKeyboardScrollIntent = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'Home') {
      onUserScrollIntent('backward');
      return;
    }
    if (
      event.key === 'ArrowDown' ||
      event.key === 'PageDown' ||
      event.key === 'End' ||
      event.key === ' ' ||
      event.key === 'Spacebar'
    ) {
      onUserScrollIntent('forward');
    }
  };

  return (
    <Box grow="Yes" style={{ position: 'relative' }}>
      {unreadBanner}

      <div
        ref={messageListRef}
        onWheelCapture={handleWheelIntent}
        onTouchStartCapture={handleTouchStart}
        onTouchMoveCapture={handleTouchMoveIntent}
        onKeyDownCapture={handleKeyboardScrollIntent}
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
              backPagination={index === 0 ? backPagination : undefined}
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
