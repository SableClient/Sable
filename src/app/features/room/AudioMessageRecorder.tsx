import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useElementSizeObserver } from '$hooks/useElementSizeObserver';
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

const MAX_BAR_COUNT = 28;
const MIN_BAR_COUNT = 8;
const BAR_WIDTH_PX = 2;
const BAR_GAP_PX = 4;
const RECORDER_CHROME_PX = 72;

export const AudioMessageRecorder = forwardRef<
  AudioMessageRecorderHandle,
  AudioMessageRecorderProps
>(({ onRecordingComplete, onRequestClose, onWaveformUpdate, onAudioLengthUpdate }, ref) => {
  const isDismissedRef = useRef(false);
  const userRequestedStopRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [announcedTime, setAnnouncedTime] = useState(0);
  const [barCount, setBarCount] = useState(MAX_BAR_COUNT);

  const onRecordingCompleteRef = useRef(onRecordingComplete);
  onRecordingCompleteRef.current = onRecordingComplete;
  const onRequestCloseRef = useRef(onRequestClose);
  onRequestCloseRef.current = onRequestClose;
  const onWaveformUpdateRef = useRef(onWaveformUpdate);
  onWaveformUpdateRef.current = onWaveformUpdate;
  const onAudioLengthUpdateRef = useRef(onAudioLengthUpdate);
  onAudioLengthUpdateRef.current = onAudioLengthUpdate;

  const stableOnStop = useCallback((payload: VoiceRecorderStopPayload) => {
    // useVoiceRecorder also stops during cancel/teardown paths, so only surface a completed
    // recording after an explicit user stop.
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

  useElementSizeObserver(
    useCallback(() => containerRef.current, []),
    useCallback((width) => {
      const availableWaveformWidth = Math.max(0, width - RECORDER_CHROME_PX);
      const nextBarCount = Math.max(
        MIN_BAR_COUNT,
        Math.min(
          MAX_BAR_COUNT,
          Math.floor((availableWaveformWidth + BAR_GAP_PX) / (BAR_WIDTH_PX + BAR_GAP_PX))
        )
      );
      setBarCount((current) => (current === nextBarCount ? current : nextBarCount));
    }, [])
  );

  const bars = useMemo(() => {
    if (levels.length === 0) {
      return Array(barCount).fill(0.15);
    }
    if (levels.length <= barCount) {
      const step = (levels.length - 1) / (barCount - 1);
      return Array.from({ length: barCount }, (_, i) => {
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
    const step = levels.length / barCount;
    return Array.from({ length: barCount }, (_, i) => {
      const start = Math.floor(i * step);
      const end = Math.floor((i + 1) * step);
      const slice = levels.slice(start, end);
      return slice.length > 0 ? Math.max(...slice) : 0.15;
    });
  }, [barCount, levels]);
  const waveformBars = useMemo(
    () =>
      bars.map((level, index) => ({
        id: `recording-waveform-bar-${index}`,
        level,
      })),
    [bars]
  );

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
      <Box ref={containerRef} alignItems="Center" gap="200" className={containerClassName}>
        <div aria-hidden className={css.RecDot} />

        <Box
          grow="Yes"
          alignItems="Center"
          justifyContent="SpaceBetween"
          className={css.WaveformContainer}
        >
          {waveformBars.map((bar) => (
            <div
              key={bar.id}
              className={css.WaveformBar}
              style={{ height: Math.max(3, Math.round(bar.level * 20)) }}
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
