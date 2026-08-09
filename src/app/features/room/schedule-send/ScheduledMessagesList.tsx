import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Text, Chip, IconButton, Spinner } from 'folds';
import {
  CaretDown,
  CaretUp,
  chipIcon,
  Clock,
  Lock,
  PencilSimple,
  X,
} from '$components/icons/phosphor';
import type { Room } from '$types/matrix-sdk';
import { EventType, MatrixEvent } from '$types/matrix-sdk';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useMatrixClient } from '$hooks/useMatrixClient';
import {
  getDelayedEvents,
  cancelDelayedEvent,
  type DelayedEventsResponse,
} from '$utils/delayedEvents';
import {
  delayedEventsSupportedAtom,
  getScheduledMessageStateKey,
  roomIdToScheduledTimeAtomFamily,
  roomIdToEditingScheduledDelayIdAtomFamily,
} from '$state/scheduledMessages';
import { timeHourMinute, timeDayMonthYear } from '$utils/time';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { roomScheduleCoordinator } from '$state/room/roomScheduleCoordinator';
import { MessagePreview, useRoomMessagePreviewRenderer } from '$components/message-preview';
import { SchedulePickerDialog } from './SchedulePickerDialog';
import * as css from './ScheduledMessagesList.css';

type ScheduledMessagesListProps = {
  room: Room;
  onEditMessage?: (body: string, formattedBody?: string) => void;
};

type ScheduledEvent = DelayedEventsResponse['delayed_events'][number];

type ScheduledMessageRowProps = {
  room: Room;
  event: ScheduledEvent;
  hour24Clock: boolean;
  onEdit: (delayId: string, body: string, formattedBody?: string, scheduledTs?: number) => void;
  onCancel: (delayId: string) => void;
  cancellationState: CancellationState;
};

type CancellationState = {
  status: 'idle' | 'pending' | 'error';
  error?: string;
};

function ScheduledMessageRow({
  room,
  event,
  hour24Clock,
  onEdit,
  onCancel,
  cancellationState,
}: ScheduledMessageRowProps) {
  const mx = useMatrixClient();
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');
  const renderContent = useRoomMessagePreviewRenderer(room);
  const deliveryTs = 'delay' in event ? event.running_since + event.delay : event.running_since;
  const isEncrypted = event.type === 'm.room.encrypted';
  const body = !isEncrypted && typeof event.content.body === 'string' ? event.content.body : '';
  const formattedBody =
    !isEncrypted && typeof event.content.formatted_body === 'string'
      ? event.content.formatted_body
      : undefined;
  const isCancelling = cancellationState.status === 'pending';
  const cancelIcon = isCancelling ? <Spinner size="100" /> : chipIcon(X);
  const matrixEvent = useMemo(
    () =>
      new MatrixEvent({
        type: event.type,
        content: event.content,
        room_id: room.roomId,
        sender: mx.getSafeUserId(),
        event_id: `$scheduled-${event.delay_id}`,
        origin_server_ts: event.running_since,
      }),
    [event, mx, room.roomId]
  );

  return (
    <Box className={css.ScheduledMessageRow} direction="Column" gap="100">
      {isEncrypted ? (
        <Box direction="Row" gap="100" alignItems="Center">
          {chipIcon(Lock)}
          <Text size="T300" priority="300">
            Encrypted — cancel and resend to edit
          </Text>
        </Box>
      ) : (
        <MessagePreview
          room={room}
          event={matrixEvent}
          renderContent={renderContent}
          actions={
            <Box gap="100" shrink="No">
              <IconButton
                size="300"
                variant="SurfaceVariant"
                radii="300"
                onClick={() => onEdit(event.delay_id, body, formattedBody, deliveryTs)}
                aria-label="Edit scheduled message"
              >
                {chipIcon(PencilSimple)}
              </IconButton>
              <IconButton
                size="300"
                variant="Critical"
                radii="300"
                onClick={() => onCancel(event.delay_id)}
                disabled={isCancelling}
                aria-busy={isCancelling}
                aria-label="Cancel scheduled message"
              >
                {cancelIcon}
              </IconButton>
            </Box>
          }
          hour24Clock={hour24Clock}
          dateFormatString={dateFormatString}
        />
      )}
      <Box justifyContent="SpaceBetween" alignItems="Center" gap="200">
        <Text size="T200" priority="300">
          {timeDayMonthYear(deliveryTs)} at {timeHourMinute(deliveryTs, hour24Clock)}
        </Text>
        {isEncrypted && (
          <IconButton
            size="300"
            variant="Critical"
            radii="300"
            onClick={() => onCancel(event.delay_id)}
            disabled={isCancelling}
            aria-busy={isCancelling}
            aria-label="Cancel scheduled message"
          >
            {cancelIcon}
          </IconButton>
        )}
      </Box>
      {cancellationState.status === 'error' && (
        <Text size="T200" priority="300" role="alert" aria-live="polite">
          {cancellationState.error}
        </Text>
      )}
    </Box>
  );
}

export function ScheduledMessagesList({ room, onEditMessage }: ScheduledMessagesListProps) {
  const mx = useMatrixClient();
  const queryClient = useQueryClient();
  const supported = useAtomValue(delayedEventsSupportedAtom);
  const scheduledStateKey = getScheduledMessageStateKey(mx.getSafeUserId(), room.roomId);
  const setScheduledTime = useSetAtom(roomIdToScheduledTimeAtomFamily(scheduledStateKey));
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [expanded, setExpanded] = useState(false);
  const [editingDelayId, setEditingDelayId] = useAtom(
    roomIdToEditingScheduledDelayIdAtomFamily(scheduledStateKey)
  );
  const [cancellationStates, setCancellationStates] = useState<Record<string, CancellationState>>(
    {}
  );
  const pendingCancellations = useRef(new Set<string>());

  const { data } = useQuery({
    queryKey: ['delayedEvents', room.roomId],
    queryFn: () => getDelayedEvents(mx),
    refetchInterval: 30000,
    enabled: supported,
  });

  const roomEvents = data?.delayed_events.filter(
    (event) =>
      event.room_id === room.roomId &&
      (event.type === (EventType.RoomMessage as string) ||
        event.type === (EventType.RoomMessageEncrypted as string))
  );

  const invalidateEvents = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['delayedEvents', room.roomId] });
  }, [queryClient, room.roomId]);

  const handleCancel = useCallback(
    async (delayId: string) => {
      if (pendingCancellations.current.has(delayId)) return;

      pendingCancellations.current.add(delayId);
      setCancellationStates((states) => ({
        ...states,
        [delayId]: { status: 'pending' },
      }));

      try {
        await roomScheduleCoordinator.run(mx, room.roomId, () => cancelDelayedEvent(mx, delayId));
        invalidateEvents();
        setCancellationStates((states) => {
          const next = { ...states };
          delete next[delayId];
          return next;
        });
      } catch {
        setCancellationStates((states) => ({
          ...states,
          [delayId]: {
            status: 'error',
            error: 'Failed to cancel scheduled message. Try again.',
          },
        }));
      } finally {
        pendingCancellations.current.delete(delayId);
      }
    },
    [mx, room.roomId, invalidateEvents]
  );

  const handleEdit = useCallback(
    (delayId: string, body: string, formattedBody?: string, scheduledTs?: number) => {
      onEditMessage?.(body, formattedBody);
      if (scheduledTs) setScheduledTime(new Date(scheduledTs));
      setEditingDelayId(delayId);
    },
    [onEditMessage, setScheduledTime, setEditingDelayId]
  );

  const handleReschedule = useCallback(
    (scheduledDate: Date) => {
      setScheduledTime(scheduledDate);
      setEditingDelayId(null);
    },
    [setScheduledTime, setEditingDelayId]
  );

  const visibleEvents = roomEvents?.filter((event) => event.delay_id !== editingDelayId) ?? [];
  if (!supported || visibleEvents.length === 0) return null;

  return (
    <Box direction="Column">
      <Box className={css.ScheduledMessagesToggle}>
        <Chip
          variant="SurfaceVariant"
          radii="Pill"
          before={chipIcon(Clock)}
          after={chipIcon(expanded ? CaretUp : CaretDown)}
          onClick={() => setExpanded(!expanded)}
        >
          <Text size="B300">
            {visibleEvents.length} scheduled {visibleEvents.length === 1 ? 'message' : 'messages'}
          </Text>
        </Chip>
      </Box>
      {expanded && (
        <Box direction="Column" className={css.ScheduledMessagesPanel}>
          {visibleEvents.map((event) => (
            <ScheduledMessageRow
              key={event.delay_id}
              room={room}
              event={event}
              hour24Clock={hour24Clock}
              onEdit={handleEdit}
              onCancel={handleCancel}
              cancellationState={cancellationStates[event.delay_id] ?? { status: 'idle' }}
            />
          ))}
        </Box>
      )}
      {editingDelayId && !onEditMessage && (
        <SchedulePickerDialog
          onCancel={() => setEditingDelayId(null)}
          onSubmit={handleReschedule}
        />
      )}
    </Box>
  );
}
