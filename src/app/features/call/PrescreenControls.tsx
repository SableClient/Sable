import { Box, Button, Icon, Icons, Spinner, Text, toRem } from 'folds';
import { SequenceCard } from '../../components/sequence-card';
import * as css from './styles.css';
import { ChatButton, ControlDivider, MicrophoneButton, SoundButton, VideoButton } from './Controls';
import { useIsDirectRoom, useRoom } from '../../hooks/useRoom';
import { useCallEmbed, useCallJoined, useCallStart } from '../../hooks/useCallEmbed';
import { useCallPreferences } from '../../state/hooks/callPreferences';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';

type PrescreenControlsProps = {
  canJoin?: boolean;
};
export function PrescreenControls({ canJoin }: PrescreenControlsProps) {
  const room = useRoom();
  const callEmbed = useCallEmbed();
  const callJoined = useCallJoined(callEmbed);
  const direct = useIsDirectRoom();

  const screenSize = useScreenSizeContext();
  const compact = screenSize === ScreenSize.Mobile;

  const inOtherCall = callEmbed && callEmbed.roomId !== room.roomId;

  const startCall = useCallStart(direct);
  const joining = callEmbed?.roomId === room.roomId && !callJoined;

  const disabled = inOtherCall || !canJoin;

  const { microphone, video, sound, toggleMicrophone, toggleVideo, toggleSound } =
    useCallPreferences();

  return (
    <Box
      justifyContent="Center"
      alignItems="Center"
      style={{
        maxWidth: '100%',
        padding: compact ? `0 ${toRem(8)}` : undefined,
        overflowX: 'auto',
      }}
    >
      <SequenceCard
        className={css.ControlCard}
        variant="SurfaceVariant"
        gap={compact ? '100' : '200'}
        radii="500"
        alignItems="Center"
        justifyContent="Center"
        direction="Row"
      >
        <Box
          shrink="No"
          alignItems="Center"
          justifyContent="Center"
          gap={compact ? '100' : '200'}
          direction="Row"
        >
          <MicrophoneButton enabled={microphone} onToggle={toggleMicrophone} />
          <SoundButton enabled={sound} onToggle={toggleSound} />
        </Box>

        {!compact && <ControlDivider />}

        <Box
          shrink="No"
          alignItems="Center"
          justifyContent="Center"
          gap={compact ? '100' : '200'}
          direction="Row"
        >
          <VideoButton enabled={video} onToggle={toggleVideo} />
          {room?.isCallRoom() && <ChatButton />}
        </Box>

        <Box shrink="No" alignItems="Center" justifyContent="Center" direction="Row">
          <Button
            style={{ minWidth: compact ? toRem(48) : toRem(88), padding: compact ? 0 : undefined }}
            variant={disabled ? 'Secondary' : 'Success'}
            fill={disabled ? 'Soft' : 'Solid'}
            onClick={() => startCall(room, { microphone, video, sound })}
            disabled={disabled || joining}
            before={
              joining ? (
                <Spinner variant="Success" fill="Solid" size="200" />
              ) : (
                <Icon src={Icons.Phone} size="200" filled />
              )
            }
          >
            {!compact && <Text size="B400">Join</Text>}
          </Button>
        </Box>
      </SequenceCard>
    </Box>
  );
}
