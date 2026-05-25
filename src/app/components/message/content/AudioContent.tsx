/* oxlint-disable jsx-a11y/media-has-caption */
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Chip, Icon, IconButton, Icons, ProgressBar, Spinner, Text, toRem } from 'folds';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { Range } from 'react-range';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import type { IAudioInfo } from '$types/matrix/common';
import type { PlayTimeCallback } from '$hooks/media';
import {
  useMediaLoading,
  useMediaPlay,
  useMediaPlayTimeCallback,
  useMediaSeek,
  useMediaVolume,
} from '$hooks/media';
import { useThrottle } from '$hooks/useThrottle';
import { secondsToMinutesAndSeconds } from '$utils/common';
import { decryptFile, downloadEncryptedMedia, downloadMedia, mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { MEDIA_VOLUME_KEY } from '$components/media';

const PLAY_TIME_THROTTLE_OPS = {
  wait: 500,
  immediate: true,
};

type RenderMediaControlProps = {
  after: ReactNode;
  leftControl: ReactNode;
  rightControl: ReactNode;
  children: ReactNode;
};
export type AudioContentProps = {
  mimeType: string;
  url: string;
  info: IAudioInfo;
  encInfo?: EncryptedAttachmentInfo;
  renderMediaControl: (props: RenderMediaControlProps) => ReactNode;
};
export function AudioContent({
  mimeType,
  url,
  info,
  encInfo,
  renderMediaControl,
}: AudioContentProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [srcState, loadSrc] = useAsyncCallback(
    useCallback(async () => {
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      const fileContent = encInfo
        ? await downloadEncryptedMedia(mediaUrl, (encBuf) => decryptFile(encBuf, mimeType, encInfo))
        : await downloadMedia(mediaUrl);
      return URL.createObjectURL(fileContent);
    }, [mx, url, useAuthentication, mimeType, encInfo])
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(MEDIA_VOLUME_KEY);
    if (audioRef.current && stored !== null) {
      const parsed = parseFloat(stored);
      if (!Number.isNaN(parsed)) audioRef.current.volume = parsed;
    }
  }, []);

  const [currentTime, setCurrentTime] = useState(0);
  // duration in seconds. (NOTE: info.duration is in milliseconds)
  const infoDurationMs = info.duration ?? 0;
  const initialDurationSec =
    Number.isFinite(infoDurationMs) && infoDurationMs > 0 ? infoDurationMs / 1000 : 0;
  const [duration, setDuration] = useState(initialDurationSec);

  const getAudioRef = useCallback(() => audioRef.current, []);
  const { loading } = useMediaLoading(getAudioRef);
  const { playing, setPlaying } = useMediaPlay(getAudioRef);
  const { seek } = useMediaSeek(getAudioRef);
  const { volume, mute, setMute, setVolume } = useMediaVolume(getAudioRef);
  const handlePlayTimeCallback: PlayTimeCallback = useCallback((d, ct) => {
    if (Number.isFinite(d) && d > 0) setDuration(d);
    if (Number.isFinite(ct) && ct >= 0) setCurrentTime(ct);
  }, []);

  const trackMax = duration > 0 ? duration : 1;
  const trackTime =
    duration > 0 ? Math.min(Number.isFinite(currentTime) ? currentTime : 0, duration) : 0;
  const displayDuration = duration > 0 ? duration : 0;
  const displayCurrentTime = Number.isFinite(currentTime) && currentTime >= 0 ? currentTime : 0;
  useMediaPlayTimeCallback(
    getAudioRef,
    useThrottle(handlePlayTimeCallback, PLAY_TIME_THROTTLE_OPS)
  );

  const handlePlay = () => {
    if (srcState.status === AsyncStatus.Success) {
      setPlaying(!playing);
    } else if (srcState.status !== AsyncStatus.Loading) {
      loadSrc();
    }
  };

  return renderMediaControl({
    after: (
      <Range
        step={1}
        min={0}
        max={trackMax}
        values={[trackTime]}
        onChange={(values) => {
          if (!(duration > 0)) return;
          const next = values[0] ?? 0;
          if (!Number.isFinite(next)) return;
          seek(Math.max(0, Math.min(next, duration)));
        }}
        renderTrack={(params) => {
          const { key, ...restProps } = params.props as unknown as {
            key?: string;
            [key: string]: unknown;
          };
          return (
            <div key={key} {...restProps}>
              {params.children}
              <ProgressBar
                as="div"
                variant="Secondary"
                size="300"
                min={0}
                max={trackMax}
                value={trackTime}
                radii="300"
              />
            </div>
          );
        }}
        renderThumb={(params) => {
          const { key, style, ...restProps } = params.props as unknown as {
            key?: unknown;
            style?: Record<string, unknown>;
            [key: string]: unknown;
          };
          return (
            <Badge
              key={String(key)}
              size="300"
              variant="Secondary"
              fill="Solid"
              radii="Pill"
              outlined
              {...(restProps as Record<string, unknown>)}
              style={{
                ...(style as Record<string, unknown>),
                zIndex: 0,
              }}
            />
          );
        }}
      />
    ),
    leftControl: (
      <>
        <Chip
          onClick={handlePlay}
          variant="Secondary"
          radii="300"
          disabled={srcState.status === AsyncStatus.Loading}
          before={
            srcState.status === AsyncStatus.Loading || loading ? (
              <Spinner variant="Secondary" size="50" />
            ) : (
              <Icon src={playing ? Icons.Pause : Icons.Play} size="50" filled={playing} />
            )
          }
        >
          <Text size="B300">{playing ? 'Pause' : 'Play'}</Text>
        </Chip>

        <Text size="T200">{`${secondsToMinutesAndSeconds(
          displayCurrentTime
        )} / ${secondsToMinutesAndSeconds(displayDuration)}`}</Text>
      </>
    ),
    rightControl: (
      <>
        <IconButton
          variant="SurfaceVariant"
          size="300"
          radii="Pill"
          onClick={() => setMute(!mute)}
          aria-pressed={mute}
        >
          <Icon src={mute ? Icons.VolumeMute : Icons.VolumeHigh} size="50" />
        </IconButton>
        <Range
          step={0.1}
          min={0}
          max={1}
          values={[volume]}
          onChange={(values) => setVolume(values[0] ?? 1)}
          renderTrack={(params) => {
            const { key, ...restProps } = params.props as unknown as {
              key?: string;
              [key: string]: unknown;
            };
            return (
              <div key={key} {...restProps}>
                {params.children}
                <ProgressBar
                  style={{ width: toRem(48) }}
                  variant="Secondary"
                  size="300"
                  min={0}
                  max={1}
                  value={volume}
                  radii="300"
                />
              </div>
            );
          }}
          renderThumb={(params) => {
            const { key, style, ...restProps } = params.props as unknown as {
              key?: unknown;
              style?: Record<string, unknown>;
              [key: string]: unknown;
            };
            return (
              <Badge
                key={String(key)}
                size="300"
                variant="Secondary"
                fill="Solid"
                radii="Pill"
                outlined
                {...(restProps as Record<string, unknown>)}
                style={{
                  ...(style as Record<string, unknown>),
                  zIndex: 0,
                }}
              />
            );
          }}
        />
      </>
    ),
    children: (
      <audio
        controls={false}
        autoPlay
        ref={audioRef}
        onVolumeChange={(e) => {
          localStorage.setItem(MEDIA_VOLUME_KEY, String((e.target as HTMLAudioElement).volume));
        }}
      >
        {srcState.status === AsyncStatus.Success && <source src={srcState.data} type={mimeType} />}
      </audio>
    ),
  });
}
