import { useEffect, useMemo, useRef } from 'react';
import { Box, Text, config, toRem } from 'folds';
import { useMediaDeviceSelect, usePreviewTracks, useTrackVolume } from '@livekit/components-react';
import { Track, type LocalAudioTrack, type LocalVideoTrack } from 'livekit-client';
import { VideoCameraSlash, sizedIcon } from '$components/icons/phosphor';
import * as css from './CallDevicePreview.css';

type DeviceSelectProps = {
  label: string;
  kind: MediaDeviceKind;
  deviceId?: string;
  onChange: (deviceId: string) => void;
  hasTrack: boolean;
};

function DeviceSelect({ label, kind, deviceId, onChange, hasTrack }: DeviceSelectProps) {
  const { devices } = useMediaDeviceSelect({ kind, requestPermissions: hasTrack });
  const namedDevices = devices.filter((device) => device.deviceId !== '');

  return (
    <Box direction="Column" gap="100" grow="Yes" style={{ minWidth: 0 }}>
      <Text size="T200">{label}</Text>
      <select
        className={css.DeviceSelect}
        aria-label={label}
        value={deviceId ?? ''}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">System default</option>
        {namedDevices.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `${label} ${index + 1}`}
          </option>
        ))}
      </select>
    </Box>
  );
}

function MicrophoneLevel({ track }: { track?: LocalAudioTrack }) {
  const volume = useTrackVolume(track);
  const level = Math.min(1, volume * 3);

  return (
    <Box direction="Column" gap="100">
      <Text size="T200">Microphone level</Text>
      <div
        className={css.LevelTrack}
        role="meter"
        aria-label="Microphone level"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={Number(level.toFixed(2))}
      >
        <div className={css.LevelFill} style={{ transform: `scaleX(${level})` }} />
      </div>
    </Box>
  );
}

function VideoPreview({ track }: { track?: LocalVideoTrack }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!track || !element) return undefined;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  if (!track) {
    return (
      <Box className={css.PreviewSurface} alignItems="Center" justifyContent="Center" gap="200">
        {sizedIcon(VideoCameraSlash, '400')}
        <Text size="T300">Camera is off</Text>
      </Box>
    );
  }

  return (
    <Box className={css.PreviewSurface}>
      <video ref={videoRef} className={css.PreviewVideo} muted playsInline autoPlay />
    </Box>
  );
}

export type CallDevicePreviewProps = {
  microphone: boolean;
  video: boolean;
  audioDeviceId?: string;
  videoDeviceId?: string;
  onAudioDeviceChange: (deviceId: string) => void;
  onVideoDeviceChange: (deviceId: string) => void;
};

export function CallDevicePreview({
  microphone,
  video,
  audioDeviceId,
  videoDeviceId,
  onAudioDeviceChange,
  onVideoDeviceChange,
}: CallDevicePreviewProps) {
  const tracks = usePreviewTracks({
    audio: microphone ? { deviceId: audioDeviceId } : false,
    video: video ? { deviceId: videoDeviceId } : false,
  });

  const videoTrack = useMemo(
    () => tracks?.find((track) => track.kind === Track.Kind.Video) as LocalVideoTrack | undefined,
    [tracks]
  );
  const audioTrack = useMemo(
    () => tracks?.find((track) => track.kind === Track.Kind.Audio) as LocalAudioTrack | undefined,
    [tracks]
  );

  return (
    <Box direction="Column" gap="300" style={{ width: '100%', maxWidth: toRem(382) }}>
      <VideoPreview track={videoTrack} />
      {microphone && <MicrophoneLevel track={audioTrack} />}
      <Box direction="Column" gap="200" style={{ paddingBottom: config.space.S100 }}>
        <DeviceSelect
          label="Microphone"
          kind="audioinput"
          deviceId={audioDeviceId}
          onChange={onAudioDeviceChange}
          hasTrack={!!audioTrack}
        />
        <DeviceSelect
          label="Camera"
          kind="videoinput"
          deviceId={videoDeviceId}
          onChange={onVideoDeviceChange}
          hasTrack={!!videoTrack}
        />
      </Box>
    </Box>
  );
}
