import type { MouseEventHandler, ReactNode } from 'react';
import { forwardRef, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MatrixEvent, Room, RoomPinnedEventsEventContent } from '$types/matrix-sdk';
import {
  Box,
  Chip,
  color,
  config,
  Header,
  IconButton,
  Menu,
  Scroll,
  Spinner,
  Text,
  toRem,
} from 'folds';
import { useVirtualizer } from '@tanstack/react-virtual';
import { createLogger } from '$utils/debug';
import { useRoomPinnedEvents } from '$hooks/useRoomPinnedEvents';
import { SequenceCard } from '$components/sequence-card';
import { useRoomEvent } from '$hooks/useRoomEvent';
import { DefaultPlaceholder } from '$components/message';
import { dropzoneIcon, menuIcon, composerIcon, PushPin, X } from '$components/icons/phosphor';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { getStateEvent } from '$utils/room/hierarchy';
import type { StateEvents } from '$types/matrix-sdk';

import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useRoomNavigate } from '$hooks/useRoomNavigate';
import { VirtualTile } from '$components/virtualizer';
import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { ContainerColor } from '$styles/ContainerColor.css';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { MessagePreview, useRoomMessagePreviewRenderer } from '$components/message-preview';
import type { PinReadMarker } from '$features/room/RoomViewHeader';
import * as css from './RoomPinMenu.css';
import { CustomAccountDataEvent } from '$types/matrix/accountData';
import { EventType } from '$types/matrix-sdk';
import { ScreenSize, useScreenSizeOptionally } from '$hooks/useScreenSize';
import { useMobileSheetClose } from '$components/MobileSwipeDownModal';

const log = createLogger('RoomPinMenu');

type PinnedMessageProps = {
  room: Room;
  eventId: string;
  renderContent: ReturnType<typeof useRoomMessagePreviewRenderer>;
  onOpen: (roomId: string, eventId: string) => void;
  canPinEvent: boolean;
  hour24Clock: boolean;
  dateFormatString: string;
  isNew: boolean;
};

function PinnedMessageActiveContent(
  props: PinnedMessageProps & {
    pinnedEvent: MatrixEvent;
    renderOptions: () => ReactNode;
    handleOpenClick: MouseEventHandler;
  }
) {
  const {
    pinnedEvent,
    room,
    renderContent,
    hour24Clock,
    dateFormatString,
    renderOptions,
    handleOpenClick,
  } = props;

  return (
    <MessagePreview
      room={room}
      event={pinnedEvent}
      renderContent={renderContent}
      actions={renderOptions()}
      onOpen={handleOpenClick}
      hour24Clock={hour24Clock}
      dateFormatString={dateFormatString}
    />
  );
}

function PinnedMessage(props: PinnedMessageProps) {
  const { room, eventId, onOpen, canPinEvent } = props;
  const pinnedEvent = useRoomEvent(room, eventId);
  const mx = useMatrixClient();

  const [unpinState, unpin] = useAsyncCallback(
    useCallback(() => {
      const pinEvent = getStateEvent(room, EventType.RoomPinnedEvents);
      const content = pinEvent?.getContent<RoomPinnedEventsEventContent>() ?? { pinned: [] };
      const newContent: RoomPinnedEventsEventContent = {
        pinned: content.pinned.filter((id: string) => id !== eventId),
      };

      return mx.sendStateEvent(
        room.roomId,
        EventType.RoomPinnedEvents as keyof StateEvents,
        newContent
      );
    }, [room, eventId, mx])
  );

  const handleOpenClick: MouseEventHandler = useCallback(
    (evt) => {
      evt.stopPropagation();
      onOpen(room.roomId, eventId);
    },
    [onOpen, room.roomId, eventId]
  );

  const handleUnpinClick: MouseEventHandler = useCallback(
    (evt) => {
      evt.stopPropagation();
      unpin().catch((err) => {
        log.warn('Failed to unpin room event:', err);
      });
    },
    [unpin]
  );

  const renderOptions = () => (
    <Box shrink="No" gap="200" alignItems="Center">
      <Chip data-event-id={eventId} onClick={handleOpenClick} radii="Pill">
        <Text size="T200">Jump</Text>
      </Chip>
      {canPinEvent && (
        <IconButton
          data-event-id={eventId}
          size="300"
          radii="Pill"
          onClick={unpinState.status === AsyncStatus.Loading ? undefined : handleUnpinClick}
          aria-disabled={unpinState.status === AsyncStatus.Loading}
        >
          {unpinState.status === AsyncStatus.Loading ? <Spinner size="100" /> : menuIcon(X)}
        </IconButton>
      )}
    </Box>
  );

  if (pinnedEvent === undefined) return <DefaultPlaceholder variant="Secondary" />;

  if (pinnedEvent === null) {
    return (
      <Box gap="300" justifyContent="SpaceBetween" alignItems="Center">
        <Box>
          <Text style={{ color: color.Critical.Main }}>Failed to load message!</Text>
        </Box>
        {renderOptions()}
      </Box>
    );
  }

  return (
    <PinnedMessageActiveContent
      {...props}
      pinnedEvent={pinnedEvent}
      renderOptions={renderOptions}
      handleOpenClick={handleOpenClick}
    />
  );
}

type RoomPinMenuProps = {
  room: Room;
  requestClose: () => void;
  currentHash: string;
};

export const RoomPinMenu = forwardRef<HTMLDivElement, RoomPinMenuProps>(
  ({ room, requestClose, currentHash }, ref) => {
    const isMobile = useScreenSizeOptionally() === ScreenSize.Mobile;
    const mobileSheetClose = useMobileSheetClose();
    const mx = useMatrixClient();
    const userId = mx.getUserId()!;
    const powerLevels = usePowerLevelsContext();
    const creators = useRoomCreators(room);

    const permissions = useRoomPermissions(creators, powerLevels);
    const canPinEvent = permissions.stateEvent(EventType.RoomPinnedEvents, userId);

    const pinnedEvents = useRoomPinnedEvents(room);
    const sortedPinnedEvent = useMemo(() => Array.from(pinnedEvents).reverse(), [pinnedEvents]);
    const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
    const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

    const { navigateRoom } = useRoomNavigate();
    const scrollRef = useRef<HTMLDivElement>(null);

    const pinMarker = useMemo(
      () =>
        room.getAccountData(CustomAccountDataEvent.SablePinStatus)?.getContent() as PinReadMarker,
      [room]
    );

    const lastSeenIndex = useMemo(() => {
      if (!pinMarker?.last_seen_id) return -1;
      return pinnedEvents.indexOf(pinMarker.last_seen_id);
    }, [pinnedEvents, pinMarker]);

    const virtualizer = useVirtualizer({
      count: sortedPinnedEvent.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => 75,
      overscan: 4,
    });

    // Rows re-measure as dynamic content lands (decrypts, lazy media, replies),
    // nudging the total size back and forth across the sheet's max height. The
    // sheet sizes itself off this list, so latch the largest size seen for the
    // current set of pins. Structural changes rebase the latch so removals do
    // not leave stale empty space.
    const totalSize = virtualizer.getTotalSize();
    const pinListKey = JSON.stringify(sortedPinnedEvent);
    const [latchedSize, setLatchedSize] = useState({ pinListKey, size: 0 });
    useLayoutEffect(() => {
      setLatchedSize((prev) => {
        if (prev.pinListKey !== pinListKey) return { pinListKey, size: totalSize };
        if (totalSize <= prev.size) return prev;
        return { pinListKey, size: totalSize };
      });
    }, [pinListKey, totalSize]);
    const currentLatchedSize = latchedSize.pinListKey === pinListKey ? latchedSize.size : totalSize;
    const mobileMaxHeight = 'calc(85dvh - 4rem)';

    const renderMatrixEvent = useRoomMessagePreviewRenderer(room);

    const handleOpen = (roomId: string, eventId: string) => {
      navigateRoom(roomId, eventId);
      (mobileSheetClose ?? requestClose)();
    };

    return (
      <Menu ref={ref} className={css.PinMenu}>
        <Box grow="Yes" direction="Column">
          <Header className={css.PinMenuHeader} size="500">
            <Box grow="Yes">
              <Text size="H5">Pinned Messages</Text>
            </Box>
            <Box shrink="No">
              <IconButton size="300" onClick={mobileSheetClose ?? requestClose} radii="300">
                {composerIcon(X)}
              </IconButton>
            </Box>
          </Header>
          <Box grow="Yes">
            <Scroll
              ref={scrollRef}
              size="300"
              hideTrack
              visibility="Hover"
              style={{
                minHeight: isMobile ? `min(${currentLatchedSize}px, ${mobileMaxHeight})` : 0,
                flex: isMobile ? '0 1 auto' : 1,
                maxHeight: isMobile ? mobileMaxHeight : undefined,
                overflowY: 'auto',
                touchAction: 'pan-y',
              }}
            >
              <Box className={css.PinMenuContent} direction="Column" gap="100">
                {sortedPinnedEvent.length > 0 ? (
                  <div
                    style={{
                      position: 'relative',
                      height: virtualizer.getTotalSize(),
                    }}
                  >
                    {virtualizer.getVirtualItems().map((vItem) => {
                      const eventId = sortedPinnedEvent[vItem.index];
                      if (!eventId) return null;

                      const originalIndex = pinnedEvents.indexOf(eventId);
                      let isNew = false;
                      if (pinMarker?.hash !== currentHash) {
                        if (lastSeenIndex !== -1) {
                          isNew = originalIndex > lastSeenIndex;
                        } else {
                          const oldCount = pinMarker?.count ?? 0;
                          isNew = originalIndex >= oldCount - 1;
                        }
                      }

                      return (
                        <VirtualTile
                          virtualItem={vItem}
                          style={{ paddingBottom: config.space.S200 }}
                          ref={virtualizer.measureElement}
                          key={vItem.index}
                        >
                          <SequenceCard
                            style={{
                              padding: config.space.S400,
                              borderRadius: config.radii.R300,
                              border: isNew
                                ? `${config.borderWidth.B700} solid ${color.Secondary.ContainerActive}`
                                : undefined,
                            }}
                            variant="Background"
                            direction="Column"
                          >
                            <PinnedMessage
                              room={room}
                              eventId={eventId}
                              renderContent={renderMatrixEvent}
                              onOpen={handleOpen}
                              canPinEvent={canPinEvent}
                              hour24Clock={hour24Clock}
                              isNew={isNew}
                              dateFormatString={dateFormatString}
                            />
                          </SequenceCard>
                        </VirtualTile>
                      );
                    })}
                  </div>
                ) : (
                  <Box
                    className={ContainerColor({ variant: 'SurfaceVariant' })}
                    style={{
                      marginBottom: config.space.S200,
                      padding: `${config.space.S700} ${config.space.S400} ${toRem(60)}`,
                      borderRadius: config.radii.R300,
                    }}
                    grow="Yes"
                    direction="Column"
                    gap="400"
                    justifyContent="Center"
                    alignItems="Center"
                  >
                    {dropzoneIcon(PushPin)}
                    <Box
                      style={{ maxWidth: toRem(300) }}
                      direction="Column"
                      gap="200"
                      alignItems="Center"
                    >
                      <Text size="H4" align="Center">
                        No Pinned Messages
                      </Text>
                      <Text size="T400" align="Center">
                        Users with sufficient power level can pin messages from the context menu.
                      </Text>
                    </Box>
                  </Box>
                )}
              </Box>
            </Scroll>
          </Box>
        </Box>
      </Menu>
    );
  }
);

RoomPinMenu.displayName = 'RoomPinMenu';
