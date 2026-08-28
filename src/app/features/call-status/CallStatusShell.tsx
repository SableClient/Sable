import { useCallback, type ReactNode } from 'react';
import { Box, Chip, Spinner, Text } from 'folds';
import classNames from 'classnames';
import { PhoneDisconnect, sizedIcon } from '$components/icons/phosphor';
import type { Room } from '$types/matrix-sdk';
import { useCallMembers, useCallSession } from '$hooks/useCall';
import { useAsyncCallback, AsyncStatus } from '$hooks/useAsyncCallback';
import { ContainerColor } from '$styles/ContainerColor.css';
import { LiveChip } from './LiveChip';
import { CallRoomName } from './CallRoomName';
import { MemberGlance } from './MemberGlance';
import { StatusDivider } from './components';
import * as css from './styles.css';

// Speaker detection belongs to the in-call surface; the bar only needs the
// roster, so it opts out of the highlight.
const noSpeakers = new Set<string>();

export function HangupChip({
  compact,
  onHangup,
}: {
  compact: boolean;
  onHangup: () => Promise<void>;
}) {
  const [hangupState, hangup] = useAsyncCallback(useCallback(() => onHangup(), [onHangup]));
  const exiting =
    hangupState.status === AsyncStatus.Loading || hangupState.status === AsyncStatus.Success;

  return (
    <Chip
      variant="Critical"
      radii="Pill"
      fill="Soft"
      before={
        exiting ? (
          <Spinner variant="Critical" fill="Soft" size="50" />
        ) : (
          sizedIcon(PhoneDisconnect, '50', { filled: true })
        )
      }
      disabled={exiting}
      outlined
      onClick={() => hangup()}
    >
      {!compact && (
        <Text as="span" size="L400">
          End
        </Text>
      )}
    </Chip>
  );
}

/**
 * The persistent call bar both engines render into. Only the control cluster
 * differs, so it is passed in.
 */
export function CallStatusShell({
  room,
  compact,
  connected,
  controls,
}: {
  room: Room;
  compact: boolean;
  connected: boolean;
  controls: ReactNode;
}) {
  const callSession = useCallSession(room);
  const callMembers = useCallMembers(room, callSession);
  const memberVisible = connected && callMembers.length > 0;

  return (
    <Box
      className={classNames(css.CallStatus, ContainerColor({ variant: 'Background' }))}
      shrink="No"
      gap="400"
    >
      <Box grow="Yes" alignItems="Center" gap="200">
        {memberVisible ? (
          <Box shrink="No">
            <LiveChip count={callMembers.length} room={room} members={callMembers} />
          </Box>
        ) : (
          <Spinner variant="Secondary" size="200" />
        )}
        <Box grow="Yes" alignItems="Center" gap="Inherit">
          {!compact && <CallRoomName room={room} />}
        </Box>
        {memberVisible && (
          <Box shrink="No">
            <MemberGlance room={room} members={callMembers} speakers={noSpeakers} />
          </Box>
        )}
      </Box>
      {memberVisible && !compact && <StatusDivider />}
      <Box shrink="No" alignItems="Center" gap="Inherit">
        {compact && (
          <Box grow="Yes">
            <CallRoomName room={room} />
          </Box>
        )}
        {controls}
      </Box>
    </Box>
  );
}
