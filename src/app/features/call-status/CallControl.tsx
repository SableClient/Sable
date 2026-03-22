import { Box, Chip, IconButton, Spinner, Text, Tooltip, TooltipProvider } from 'folds';
import { HeadphonesIcon } from '@phosphor-icons/react/dist/csr/Headphones';
import { MicrophoneIcon } from '@phosphor-icons/react/dist/csr/Microphone';
import { MicrophoneSlashIcon } from '@phosphor-icons/react/dist/csr/MicrophoneSlash';
import { PhoneSlashIcon } from '@phosphor-icons/react/dist/csr/PhoneSlash';
import { PresentationIcon } from '@phosphor-icons/react/dist/csr/Presentation';
import { SpeakerXIcon } from '@phosphor-icons/react/dist/csr/SpeakerX';
import { VideoCameraIcon } from '@phosphor-icons/react/dist/csr/VideoCamera';
import { VideoCameraSlashIcon } from '@phosphor-icons/react/dist/csr/VideoCameraSlash';
import { useCallback } from 'react';
import { useSetAtom } from 'jotai';
import { PhosphorIcon } from '$components/PhosphorIcon';
import { StatusDivider } from './components';
import { CallEmbed, useCallControlState } from '../../plugins/call';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { callEmbedAtom } from '../../state/callEmbed';

type MicrophoneButtonProps = {
  enabled: boolean;
  onToggle: () => Promise<unknown>;
  disabled?: boolean;
};
function MicrophoneButton({ enabled, onToggle, disabled }: MicrophoneButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? 'Turn Off Microphone' : 'Turn On Microphone'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Surface' : 'Warning'}
          fill="Soft"
          radii="300"
          size="300"
          onClick={() => onToggle()}
          outlined
          disabled={disabled}
        >
          <PhosphorIcon
            size="100"
            as={enabled ? MicrophoneIcon : MicrophoneSlashIcon}
            weight={!enabled ? 'fill' : 'regular'}
          />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type SoundButtonProps = {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
};
function SoundButton({ enabled, onToggle, disabled }: SoundButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? 'Turn Off Sound' : 'Turn On Sound'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Surface' : 'Warning'}
          fill="Soft"
          radii="300"
          size="300"
          onClick={() => onToggle()}
          outlined
          disabled={disabled}
        >
          <PhosphorIcon
            size="100"
            as={enabled ? HeadphonesIcon : SpeakerXIcon}
            weight={!enabled ? 'fill' : 'regular'}
          />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type VideoButtonProps = {
  enabled: boolean;
  onToggle: () => Promise<unknown>;
  disabled?: boolean;
};
function VideoButton({ enabled, onToggle, disabled }: VideoButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? 'Stop Camera' : 'Start Camera'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Success' : 'Surface'}
          fill="Soft"
          radii="300"
          size="300"
          onClick={() => onToggle()}
          outlined
          disabled={disabled}
        >
          <PhosphorIcon
            size="100"
            as={enabled ? VideoCameraIcon : VideoCameraSlashIcon}
            weight={enabled ? 'fill' : 'regular'}
          />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type ScreenShareButtonProps = {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
};
function ScreenShareButton({ enabled, onToggle, disabled }: ScreenShareButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? 'Stop Screenshare' : 'Start Screenshare'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Success' : 'Surface'}
          fill="Soft"
          radii="300"
          size="300"
          onClick={onToggle}
          outlined
          disabled={disabled}
        >
          <PhosphorIcon size="100" as={PresentationIcon} weight={enabled ? 'fill' : 'regular'} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

export function CallControl({
  callEmbed,
  compact,
  callJoined,
}: {
  callEmbed: CallEmbed;
  compact: boolean;
  callJoined: boolean;
}) {
  const { microphone, video, sound, screenshare } = useCallControlState(callEmbed.control);
  const setCallEmbed = useSetAtom(callEmbedAtom);

  const [hangupState, hangup] = useAsyncCallback(
    useCallback(() => callEmbed.hangup(), [callEmbed])
  );
  const exiting =
    hangupState.status === AsyncStatus.Loading || hangupState.status === AsyncStatus.Success;

  const handleHangup = () => {
    if (!callJoined) {
      setCallEmbed(undefined);
      return;
    }
    hangup();
  };

  return (
    <Box shrink="No" alignItems="Center" gap="300">
      <Box alignItems="Inherit" gap="200">
        <MicrophoneButton
          enabled={microphone}
          onToggle={() => callEmbed.control.toggleMicrophone()}
          disabled={!callJoined}
        />
        <SoundButton
          enabled={sound}
          onToggle={() => callEmbed.control.toggleSound()}
          disabled={!callJoined}
        />
        {!compact && <StatusDivider />}
        <VideoButton
          enabled={video}
          onToggle={() => callEmbed.control.toggleVideo()}
          disabled={!callJoined}
        />
        {!compact && (
          <ScreenShareButton
            enabled={screenshare}
            onToggle={() => callEmbed.control.toggleScreenshare()}
            disabled={!callJoined}
          />
        )}
      </Box>
      <StatusDivider />
      <Chip
        variant="Critical"
        radii="Pill"
        fill="Soft"
        before={
          exiting ? (
            <Spinner variant="Critical" fill="Soft" size="50" />
          ) : (
            <PhosphorIcon as={PhoneSlashIcon} size="50" weight="fill" />
          )
        }
        disabled={exiting}
        outlined
        onClick={handleHangup}
      >
        {!compact && (
          <Text as="span" size="L400">
            End
          </Text>
        )}
      </Chip>
    </Box>
  );
}
