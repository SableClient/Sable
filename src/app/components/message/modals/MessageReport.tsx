import { FormEventHandler, MouseEvent, useCallback, useEffect } from 'react';
import { Room, MatrixEvent } from '$types/matrix-sdk';
import { useSetAtom } from 'jotai';
import {
  Box,
  Dialog,
  Header,
  IconButton,
  Icon,
  Icons,
  Text,
  Input,
  Button,
  Spinner,
  MenuItem,
  config,
  color,
} from 'folds';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import * as css from '$features/room/message/styles.css';
import { modalAtom, ModalType } from '$state/modal';
import { createDebugLogger } from '$utils/debugLogger';
import * as Sentry from '@sentry/react';

const debugLog = createDebugLogger('MessageReport');

export function MessageReportItem({ room, mEvent }: { room: Room; mEvent: MatrixEvent }) {
  const setModal = useSetAtom(modalAtom);

  return (
    <MenuItem
      size="300"
      variant="Critical"
      fill="None"
      after={<Icon size="100" src={Icons.Warning} />}
      radii="300"
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setModal({
          type: ModalType.Report,
          room,
          mEvent,
        });
      }}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        Report
      </Text>
    </MenuItem>
  );
}

type MessageReportInternalProps = {
  room: Room;
  mEvent: MatrixEvent;
  onClose: () => void;
};

export function MessageReportInternal({ room, mEvent, onClose }: MessageReportInternalProps) {
  const mx = useMatrixClient();

  const [reportState, reportMessage] = useAsyncCallback(
    useCallback(
      (eventId: string, score: number, reason: string) =>
        mx.reportEvent(room.roomId, eventId, score, reason),
      [mx, room]
    )
  );

  useEffect(() => {
    if (reportState.status === AsyncStatus.Success) {
      debugLog.info('ui', 'Message reported successfully', { roomId: room.roomId });
      Sentry.metrics.count('sable.message.report.success', 1);
    }
    if (reportState.status === AsyncStatus.Error) {
      debugLog.error('ui', 'Message report failed', { roomId: room.roomId });
      Sentry.metrics.count('sable.message.report.error', 1);
    }
  }, [reportState.status, room.roomId]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const eventId = mEvent.getId();
    if (
      !eventId ||
      reportState.status === AsyncStatus.Loading ||
      reportState.status === AsyncStatus.Success
    )
      return;

    const target = evt.target as HTMLFormElement | undefined;
    const reasonInput = target?.reasonInput as HTMLInputElement | undefined;
    const reason = reasonInput && reasonInput.value.trim();

    debugLog.info('ui', 'Reporting message', { eventId, hasReason: !!reason });
    Sentry.metrics.count('sable.message.report.attempt', 1);
    reportMessage(eventId, reason ? -100 : -50, reason || 'No reason provided');
  };

  return (
    <Dialog variant="Surface">
      <Header
        style={{
          padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
          borderBottomWidth: config.borderWidth.B300,
        }}
        variant="Surface"
        size="500"
      >
        <Box grow="Yes">
          <Text size="H4">Report Message</Text>
        </Box>
        <IconButton size="300" onClick={onClose} radii="300">
          <Icon src={Icons.Cross} />
        </IconButton>
      </Header>
      <Box
        as="form"
        onSubmit={handleSubmit}
        style={{ padding: config.space.S400 }}
        direction="Column"
        gap="400"
      >
        <Text priority="400">
          Report this message to the server, which may then notify the appropriate people to take
          action.
        </Text>
        <Box direction="Column" gap="100">
          <Text size="L400">Reason</Text>
          <Input name="reasonInput" variant="Background" required />

          {reportState.status === AsyncStatus.Error && (
            <Text style={{ color: color.Critical.Main }} size="T300">
              Failed to report message! Please try again.
            </Text>
          )}
          {reportState.status === AsyncStatus.Success && (
            <Text style={{ color: color.Success.Main }} size="T300">
              Message has been reported to server.
            </Text>
          )}
        </Box>
        <Button
          type="submit"
          variant="Critical"
          before={
            reportState.status === AsyncStatus.Loading ? (
              <Spinner fill="Solid" variant="Critical" size="200" />
            ) : undefined
          }
          aria-disabled={
            reportState.status === AsyncStatus.Loading || reportState.status === AsyncStatus.Success
          }
        >
          <Text size="B400">
            {reportState.status === AsyncStatus.Loading ? 'Reporting...' : 'Report'}
          </Text>
        </Button>
      </Box>
    </Dialog>
  );
}
