import { VoiceRecorder } from '$plugins/voice-recorder-kit';
import FocusTrap from 'focus-trap-react';
import { Box, Icon, Icons, Text, color, config } from 'folds';
import { useRef } from 'react';

type AudioMessageRecorderProps = {
  onRecordingComplete: (audioBlob: Blob) => void;
  onRequestClose: () => void;
  onWaveformUpdate: (waveform: number[]) => void;
  onAudioLengthUpdate: (length: number) => void;
  onAudioCodecUpdate?: (codec: string) => void;
};

// We use a react voice recorder library to handle the recording of audio messages, as it provides a simple API and handles the complexities of recording audio in the browser.
// The component is wrapped in a focus trap to ensure that keyboard users can easily navigate and interact with the recorder without accidentally losing focus or interacting with other parts of the UI.
// The styling is kept simple and consistent with the rest of the app, using Folds' design tokens for colors, spacing, and typography.
// we use a modified version of https://www.npmjs.com/package/react-voice-recorder-kit for the recording
export function AudioMessageRecorder({
  onRecordingComplete,
  onRequestClose,
  onWaveformUpdate,
  onAudioLengthUpdate,
  onAudioCodecUpdate,
}: AudioMessageRecorderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDismissedRef = useRef(false);

  // uses default styling, we use at other places
  return (
    <FocusTrap
      focusTrapOptions={{
        returnFocusOnDeactivate: false,
        initialFocus: false,
        onDeactivate: () => {
          isDismissedRef.current = true;
          onRequestClose();
        },
        clickOutsideDeactivates: true,
        allowOutsideClick: true,
        fallbackFocus: () => containerRef.current!,
      }}
    >
      <div ref={containerRef} tabIndex={-1} style={{ outline: 'none' }}>
        <Box
          direction="Column"
          gap="200"
          alignItems="Center"
          style={{
            backgroundColor: color.Surface.Container,
            color: color.Surface.OnContainer,
            border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
            borderRadius: config.radii.R400,
            boxShadow: config.shadow.E200,
            padding: config.space.S400,
            width: 300,
          }}
        >
          <Text size="H4">Audio Message Recorder</Text>
          <VoiceRecorder
            autoStart
            onStop={({
              audioFile,
              waveform,
              audioLength,
              audioCodec,
            }: {
              audioFile: Blob;
              waveform: number[];
              audioLength: number;
              audioCodec: string;
            }) => {
              if (isDismissedRef.current) return;
              // closes the recorder and sends the audio file back to the parent component to be uploaded and sent as a message
              onRecordingComplete(audioFile);
              onWaveformUpdate(waveform);
              onAudioLengthUpdate(audioLength);
              // Pass the audio codec to the parent component
              if (onAudioCodecUpdate) onAudioCodecUpdate(audioCodec);
            }}
            buttonBackgroundColor={color.SurfaceVariant.Container}
            buttonHoverBackgroundColor={color.SurfaceVariant.ContainerHover}
            iconColor={color.Primary.Main}
            // icons for the recorder, we use Folds' icon library to keep the styling consistent with the rest of the app
            customPauseIcon={<Icon src={Icons.Pause} size="200" color={color.Primary.Main} />}
            customPlayIcon={<Icon src={Icons.Play} size="200" color={color.Primary.Main} />}
            customDeleteIcon={<Icon src={Icons.Delete} size="200" color={color.Primary.Main} />}
            customStopIcon={<Icon src={Icons.Send} size="200" color={color.Primary.Main} />}
            customRepeatIcon={<Icon src={Icons.Reload} size="200" color={color.Primary.Main} />}
            customResumeIcon={<Icon src={Icons.Mic} size="200" color={color.Primary.Main} />}
            style={{
              backgroundColor: color.Surface.ContainerActive,
            }}
          />
        </Box>
      </div>
    </FocusTrap>
  );
}
