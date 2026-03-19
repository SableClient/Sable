import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVoiceRecorder } from '$plugins/voice-recorder-kit';
import type { VoiceRecorderStopPayload } from '$plugins/voice-recorder-kit';
import { Box, Text } from 'folds';
import * as css from './AudioMessageRecorder.css';

export type AudioRecordingCompletePayload = {
  audioBlob: Blob;
  waveform: number[];
  audioLength: number;
  audioCodec: string;
};

export type AudioMessageRecorderHandle = {
  stop: () => void;
  cancel: () => void;
};

type AudioMessageRecorderProps = {
  onRecordingComplete: (payload: AudioRecordingCompletePayload) => void;
  onRequestClose: () => void;
  onWaveformUpdate: (waveform: number[]) => void;
  onAudioLengthUpdate: (length: number) => void;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const AudioMessageRecorder = forwardRef<
  AudioMessageRecorderHandle,
  AudioMessageRecorderProps
>(({ onRecordingComplete, onRequestClose, onWaveformUpdate, onAudioLengthUpdate }, ref) => {
  const isDismissedRef = useRef(false);
  const userRequestedStopRef = useRef(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [announcedTime, setAnnouncedTime] = useState(0);

  const onRecordingCompleteRef = useRef(onRecordingComplete);
  onRecordingCompleteRef.current = onRecordingComplete;
  const onRequestCloseRef = useRef(onRequestClose);
  onRequestCloseRef.current = onRequestClose;
  const onWaveformUpdateRef = useRef(onWaveformUpdate);
  onWaveformUpdateRef.current = onWaveformUpdate;
  const onAudioLengthUpdateRef = useRef(onAudioLengthUpdate);
  onAudioLengthUpdateRef.current = onAudioLengthUpdate;

  const stableOnStop = useCallback((payload: VoiceRecorderStopPayload) => {
    if (!userRequestedStopRef.current) return;
    if (isDismissedRef.current) return;
    onRecordingCompleteRef.current({
      audioBlob: payload.audioFile,
      waveform: payload.waveform,
      audioLength: payload.audioLength,
      audioCodec: payload.audioCodec,
    });
    onWaveformUpdateRef.current(payload.waveform);
    onAudioLengthUpdateRef.current(payload.audioLength);
  }, []);

  const stableOnDelete = useCallback(() => {
    isDismissedRef.current = true;
    onRequestCloseRef.current();
  }, []);

  const { levels, seconds, error, handleStop, handleDelete } = useVoiceRecorder({
    autoStart: true,
    onStop: stableOnStop,
    onDelete: stableOnDelete,
  });

  const doStop = useCallback(() => {
    if (isDismissedRef.current) return;
    userRequestedStopRef.current = true;
    handleStop();
  }, [handleStop]);

  const doCancel = useCallback(() => {
    if (isDismissedRef.current) return;
    setIsCanceling(true);
    setTimeout(() => {
      isDismissedRef.current = true;
      handleDelete();
    }, 180);
  }, [handleDelete]);

  useImperativeHandle(ref, () => ({ stop: doStop, cancel: doCancel }), [doStop, doCancel]);

  useEffect(() => {
    if (seconds > 0 && seconds % 30 === 0 && seconds !== announcedTime) {
      setAnnouncedTime(seconds);
    }
  }, [seconds, announcedTime]);

  const BAR_COUNT = 28;
  const bars = useMemo(() => {
    if (levels.length === 0) {
      return Array(BAR_COUNT).fill(0.15);
    }
    if (levels.length <= BAR_COUNT) {
      const step = (levels.length - 1) / (BAR_COUNT - 1);
      return Array.from({ length: BAR_COUNT }, (_, i) => {
        const position = i * step;
        const lower = Math.floor(position);
        const upper = Math.min(Math.ceil(position), levels.length - 1);
        const fraction = position - lower;
        if (lower === upper) {
          return levels[lower] ?? 0.15;
        }
        return (levels[lower] ?? 0.15) * (1 - fraction) + (levels[upper] ?? 0.15) * fraction;
      });
    }
    const step = levels.length / BAR_COUNT;
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      const start = Math.floor(i * step);
      const end = Math.floor((i + 1) * step);
      const slice = levels.slice(start, end);
      return slice.length > 0 ? Math.max(...slice) : 0.15;
    });
  }, [levels]);

  const containerClassName = [css.Container, isCanceling ? css.ContainerCanceling : null]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {error && (
        <Text size="T200" style={{ color: 'var(--color-critical-main)' }}>
          {error}
        </Text>
      )}
      <Box grow="Yes" alignItems="Center" gap="200" className={containerClassName}>
        <div aria-hidden className={css.RecDot} />

        <Box grow="Yes" alignItems="Center" gap="100" className={css.WaveformContainer}>
          {bars.map((level, i) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              className={css.WaveformBar}
              style={{ height: Math.max(3, Math.round(level * 20)) }}
            />
          ))}
        </Box>

        <Text size="T200" className={css.Timer} aria-live="polite" aria-atomic="true">
          {formatTime(seconds)}
        </Text>
        {announcedTime > 0 && announcedTime === seconds && (
          <span className={css.SrOnly} aria-live="polite">
            Recording duration: {formatTime(announcedTime)}
          </span>
        )}
      </Box>
    </>
  );
});
