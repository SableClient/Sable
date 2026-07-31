import { Box, Button, Spinner, Text } from 'folds';
import classNames from 'classnames';
import { sizedIcon, Phone } from '$components/icons/phosphor';
import { SequenceCard } from '../../components/sequence-card';
import * as css from './styles.css';
import { ChatButton, ControlDivider, MicrophoneButton, SoundButton, VideoButton } from './Controls';
import { useIsDirectRoom, useRoom } from '../../hooks/useRoom';
import { useCallEmbed, useCallJoined, useCallStart } from '../../hooks/useCallEmbed';
import { useCallPreferences } from '../../state/hooks/callPreferences';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import { CallDevicePreview } from './CallDevicePreview';

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

  const {
    microphone,
    video,
    sound,
    audioDeviceId,
    videoDeviceId,
    toggleMicrophone,
    toggleVideo,
    toggleSound,
    setAudioDeviceId,
    setVideoDeviceId,
  } = useCallPreferences();
  // Only the new-call path applies the chosen devices; Element Call picks its
  // own, so previewing there would promise something we cannot honour.
  const [newCallsEnabled] = useSetting(settingsAtom, 'newCallsEnabled');
  const showPreview = newCallsEnabled && !disabled && !joining && !compact;

  return (
    <Box direction="Column" gap="300" alignItems="Center" style={{ width: '100%' }}>
      {showPreview && (
        <CallDevicePreview
          microphone={microphone}
          video={video}
          audioDeviceId={audioDeviceId}
          videoDeviceId={videoDeviceId}
          onAudioDeviceChange={setAudioDeviceId}
          onVideoDeviceChange={setVideoDeviceId}
        />
      )}
      <Box
        justifyContent="Center"
        alignItems="Center"
        className={css.PrescreenBox}
        style={{
          maxWidth: '100%',
          overflowX: 'auto',
        }}
      >
        <SequenceCard
          className={classNames(css.ControlCard, css.PrescreenGroup)}
          variant="SurfaceVariant"
          radii="500"
          alignItems="Center"
          justifyContent="Center"
          direction="Row"
        >
          <Box
            shrink="No"
            alignItems="Center"
            justifyContent="Center"
            className={css.PrescreenGroup}
            direction="Row"
          >
            <MicrophoneButton enabled={microphone} onToggle={toggleMicrophone} />
            {!compact && <SoundButton enabled={sound} onToggle={toggleSound} />}
          </Box>

          {!compact && <ControlDivider />}

          <Box
            shrink="No"
            alignItems="Center"
            justifyContent="Center"
            className={css.PrescreenGroup}
            direction="Row"
          >
            <VideoButton enabled={video} onToggle={toggleVideo} />
            {room?.isCallRoom() && <ChatButton />}
          </Box>

          <Box shrink="No" alignItems="Center" justifyContent="Center" direction="Row">
            <Button
              className={css.PrescreenJoinButton}
              variant={disabled ? 'Secondary' : 'Success'}
              fill={disabled ? 'Soft' : 'Solid'}
              onClick={() =>
                startCall(room, { microphone, video, sound, audioDeviceId, videoDeviceId })
              }
              disabled={disabled || joining}
              before={
                joining ? (
                  <Spinner variant="Success" fill="Solid" size="200" />
                ) : (
                  sizedIcon(Phone, '200', { filled: true })
                )
              }
            >
              {!compact && <Text size="B400">Join</Text>}
            </Button>
          </Box>
        </SequenceCard>
      </Box>
    </Box>
  );
}
