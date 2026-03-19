import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Chip,
  Icon,
  IconButton,
  Icons,
  Scroll,
  Text,
  Tooltip,
  TooltipProvider,
  color,
  config,
  toRem,
} from 'folds';
import { HTMLReactParserOptions } from 'html-react-parser';
import { Play, Pause } from '@phosphor-icons/react';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { Opts as LinkifyOpts } from 'linkifyjs';
import { getReactCustomHtmlParser, LINKIFY_OPTS } from '$plugins/react-custom-html-parser';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';
import { RenderBody } from '$components/message';
import { UploadStatus, UploadSuccess, useBindUploadAtom } from '$state/upload';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { TUploadContent } from '$utils/matrix';
import { bytesToSize, getFileTypeIcon } from '$utils/common';
import { roomUploadAtomFamily, TUploadItem, TUploadMetadata } from '$state/room/roomInputDrafts';
import { useObjectURL } from '$hooks/useObjectURL';
import { useMediaConfig } from '$hooks/useMediaConfig';
import { UploadCard, UploadCardError, UploadCardProgress } from './UploadCard';
import * as css from './UploadCard.css';
import { DescriptionEditor } from './UploadDescriptionEditor';

type PreviewImageProps = {
  fileItem: TUploadItem;
};
function PreviewImage({ fileItem }: Readonly<PreviewImageProps>) {
  const { originalFile, metadata } = fileItem;
  const fileUrl = useObjectURL(originalFile);

  return (
    <img
      style={{
        objectFit: 'contain',
        width: '100%',
        height: toRem(152),
        filter: metadata.markedAsSpoiler ? 'blur(44px)' : undefined,
      }}
      alt={originalFile.name}
      src={fileUrl}
    />
  );
}

type PreviewVideoProps = {
  fileItem: TUploadItem;
};
function PreviewVideo({ fileItem }: Readonly<PreviewVideoProps>) {
  const { originalFile, metadata } = fileItem;
  const fileUrl = useObjectURL(originalFile);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      style={{
        objectFit: 'contain',
        width: '100%',
        height: toRem(152),
        filter: metadata.markedAsSpoiler ? 'blur(44px)' : undefined,
      }}
      src={fileUrl}
    />
  );
}

const BAR_COUNT = 44;

function formatAudioTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

type PreviewAudioProps = {
  fileItem: TUploadItem;
};
function PreviewAudio({ fileItem }: PreviewAudioProps) {
  const { originalFile, metadata } = fileItem;
  const audioUrl = useObjectURL(originalFile);
  const { waveform, audioDuration } = metadata;
  const duration = audioDuration ?? 0;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const bars = useMemo(() => {
    if (!waveform || waveform.length === 0) {
      return Array(BAR_COUNT).fill(0.3);
    }
    if (waveform.length <= BAR_COUNT) {
      const step = (waveform.length - 1) / (BAR_COUNT - 1);
      return Array.from({ length: BAR_COUNT }, (_, i) => {
        const position = i * step;
        const lower = Math.floor(position);
        const upper = Math.min(Math.ceil(position), waveform.length - 1);
        const fraction = position - lower;
        if (lower === upper) {
          return waveform[lower] ?? 0.3;
        }
        return (waveform[lower] ?? 0.3) * (1 - fraction) + (waveform[upper] ?? 0.3) * fraction;
      });
    }
    const step = waveform.length / BAR_COUNT;
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      const start = Math.floor(i * step);
      const end = Math.floor((i + 1) * step);
      const slice = waveform.slice(start, end);
      return slice.length > 0 ? Math.max(...slice) : 0.3;
    });
  }, [waveform]);

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  useEffect(() => {
    if (!audioUrl) {
      return undefined;
    }
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    return () => {
      audio.pause();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [audioUrl]);

  const startRaf = (audio: HTMLAudioElement) => {
    const tick = () => {
      setCurrentTime(audio.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const stopRaf = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      stopRaf();
    } else {
      audio.play().catch(() => {});
      setIsPlaying(true);
      startRaf(audio);
    }
  };

  const handleScrubClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const SEEK_STEP = 5;
    let newTime = currentTime;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      newTime = Math.max(0, currentTime - SEEK_STEP);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      newTime = Math.min(duration, currentTime + SEEK_STEP);
    } else if (e.key === 'Home') {
      e.preventDefault();
      newTime = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      newTime = duration;
    } else {
      return;
    }

    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  return (
    <Box alignItems="Center" gap="200" className={css.AudioPreviewContainer}>
      <IconButton
        variant="Secondary"
        size="400"
        radii="300"
        onClick={handlePlayPause}
        title={isPlaying ? 'Pause' : 'Play voice message'}
        aria-label={isPlaying ? 'Pause' : 'Play voice message'}
        aria-pressed={isPlaying}
      >
        {isPlaying ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
      </IconButton>

      <Box
        grow="Yes"
        alignItems="Center"
        gap="100"
        onClick={handleScrubClick}
        onKeyDown={handleKeyDown}
        className={css.AudioWaveformContainer}
        tabIndex={0}
        role="slider"
        aria-label="Audio position"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.floor(currentTime)}
        title="Seek"
      >
        {bars.map((level, i) => {
          const barRatio = i / BAR_COUNT;
          const played = progress > 0 && barRatio <= progress;
          return (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              className={`${css.AudioWaveformBar} ${played ? css.AudioWaveformBarPlayed : css.AudioWaveformBarUnplayed}`}
              style={{ height: Math.max(3, Math.round(level * 24)) }}
            />
          );
        })}
      </Box>

      <Text size="T200" className={css.AudioTimeDisplay}>
        {formatAudioTime(isPlaying ? currentTime : duration)}
      </Text>
    </Box>
  );
}

type MediaPreviewProps = {
  fileItem: TUploadItem;
  onSpoiler: (marked: boolean) => void;
  children: ReactNode;
};
function MediaPreview({ fileItem, onSpoiler, children }: MediaPreviewProps) {
  const { originalFile, metadata } = fileItem;
  const fileUrl = useObjectURL(originalFile);

  return fileUrl ? (
    <Box
      style={{
        borderRadius: config.radii.R300,
        overflow: 'hidden',
        backgroundColor: 'black',
        position: 'relative',
      }}
    >
      {children}
      <Box
        justifyContent="End"
        style={{
          position: 'absolute',
          bottom: config.space.S100,
          left: config.space.S100,
          right: config.space.S100,
        }}
      >
        <Chip
          variant={metadata.markedAsSpoiler ? 'Warning' : 'Secondary'}
          fill="Soft"
          radii="Pill"
          aria-pressed={metadata.markedAsSpoiler}
          before={<Icon src={Icons.EyeBlind} size="50" />}
          onClick={() => onSpoiler(!metadata.markedAsSpoiler)}
        >
          <Text size="B300">Spoiler</Text>
        </Chip>
      </Box>
    </Box>
  ) : null;
}

type UploadCardRendererProps = {
  isEncrypted?: boolean;
  fileItem: TUploadItem;
  setMetadata: (fileItem: TUploadItem, metadata: TUploadMetadata) => void;
  setDesc: (fileItem: TUploadItem, body: string, formatted_body: string) => void;
  onRemove: (file: TUploadContent) => void;
  onComplete?: (upload: UploadSuccess) => void;
  roomId: string;
};
export function UploadCardRenderer({
  isEncrypted,
  fileItem,
  setMetadata,
  setDesc,
  onRemove,
  onComplete,
  roomId,
}: Readonly<UploadCardRendererProps>) {
  const mx = useMatrixClient();
  const mediaConfig = useMediaConfig();
  const allowSize = mediaConfig['m.upload.size'] || Infinity;

  const uploadAtom = roomUploadAtomFamily(fileItem.file);
  const { metadata } = fileItem;
  const { upload, startUpload, cancelUpload } = useBindUploadAtom(mx, uploadAtom, isEncrypted);
  const { file } = upload;
  const fileSizeExceeded = file.size >= allowSize;

  const [isDescribed, setIsDescribed] = useState(false);

  if (upload.status === UploadStatus.Idle && !fileSizeExceeded) {
    startUpload();
  }

  const handleSpoiler = (marked: boolean) => {
    setMetadata(fileItem, { ...metadata, markedAsSpoiler: marked });
  };

  const removeUpload = () => {
    cancelUpload();
    onRemove(file);
  };

  useEffect(() => {
    if (upload.status === UploadStatus.Success) {
      onComplete?.(upload);
    }
  }, [upload, onComplete]);

  const linkifyOpts = useMemo<LinkifyOpts>(() => ({ ...LINKIFY_OPTS }), []);

  const spoilerClickHandler = useSpoilerClickHandler();
  const useAuthentication = useMediaAuthentication();
  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, roomId, {
        linkifyOpts,
        useAuthentication,
        handleSpoilerClick: spoilerClickHandler,
      }),
    [linkifyOpts, mx, roomId, spoilerClickHandler, useAuthentication]
  );
  return (
    <UploadCard
      radii="300"
      before={<Icon src={getFileTypeIcon(Icons, file.type)} />}
      after={
        <>
          {upload.status === UploadStatus.Error && (
            <Chip
              as="button"
              onClick={startUpload}
              aria-label="Retry Upload"
              variant="Critical"
              radii="Pill"
              outlined
            >
              <Text size="B300">Retry</Text>
            </Chip>
          )}
          {!isDescribed && (
            <IconButton
              onClick={() => {
                setIsDescribed(true);
              }}
              aria-label="Add Upload Description"
              variant="SurfaceVariant"
              radii="Pill"
              size="300"
            >
              <Icon src={Icons.Pencil} size="50" />
            </IconButton>
          )}
          {isDescribed && (
            <TooltipProvider
              delay={400}
              position="Top"
              style={{ textAlign: 'center' }}
              tooltip={
                <Tooltip>
                  <Text size="H5">
                    Don&apos;t forget to save your description before sending the message!
                  </Text>
                </Tooltip>
              }
            >
              {(triggerRef) => <Icon ref={triggerRef} src={Icons.Info} size="50" />}
            </TooltipProvider>
          )}

          <IconButton
            onClick={removeUpload}
            aria-label="Cancel Upload"
            variant="SurfaceVariant"
            radii="Pill"
            size="300"
          >
            <Icon src={Icons.Cross} size="200" />
          </IconButton>
        </>
      }
      bottom={
        <>
          {fileItem.originalFile.type.startsWith('image') && (
            <MediaPreview fileItem={fileItem} onSpoiler={handleSpoiler}>
              <PreviewImage fileItem={fileItem} />
            </MediaPreview>
          )}
          {fileItem.originalFile.type.startsWith('video') && (
            <MediaPreview fileItem={fileItem} onSpoiler={handleSpoiler}>
              <PreviewVideo fileItem={fileItem} />
            </MediaPreview>
          )}
          {fileItem.metadata.waveform && <PreviewAudio fileItem={fileItem} />}
          {upload.status === UploadStatus.Idle && !fileSizeExceeded && (
            <UploadCardProgress sentBytes={0} totalBytes={file.size} />
          )}
          {upload.status === UploadStatus.Loading && (
            <UploadCardProgress sentBytes={upload.progress.loaded} totalBytes={file.size} />
          )}
          {upload.status === UploadStatus.Error && (
            <UploadCardError>
              <Text size="T200">{upload.error.message}</Text>
            </UploadCardError>
          )}
          {upload.status === UploadStatus.Idle && fileSizeExceeded && (
            <UploadCardError>
              <Text size="T200">
                The file size exceeds the limit. Maximum allowed size is{' '}
                <b>{bytesToSize(allowSize)}</b>, but the uploaded file is{' '}
                <b>{bytesToSize(file.size)}</b>.
              </Text>
            </UploadCardError>
          )}

          {isDescribed && (
            <DescriptionEditor
              value={fileItem.formatted_body || fileItem.body}
              onSave={(plainText, htmlContent) => {
                setDesc(fileItem, plainText, htmlContent);
                setIsDescribed(false);
              }}
              onCancel={() => setIsDescribed(false)}
            />
          )}
          {!isDescribed && fileItem.body && fileItem.body.length > 0 && (
            <Scroll
              direction="Vertical"
              variant="SurfaceVariant"
              visibility="Always"
              size="300"
              style={{
                backgroundColor: 'var(--sable-bg-container)',
                borderRadius: config.radii.R400,
                maxHeight: '180px',
                marginTop: config.space.S0,
                overflowY: 'auto',
              }}
            >
              <Box style={{ padding: config.space.S200, wordBreak: 'break-word' }}>
                <Text size="T200" priority="400" as="div">
                  <RenderBody
                    body={fileItem.body}
                    customBody={fileItem.formatted_body}
                    htmlReactParserOptions={htmlReactParserOptions}
                    linkifyOpts={linkifyOpts}
                  />
                </Text>
              </Box>
            </Scroll>
          )}
        </>
      }
    >
      <Text size="H6" truncate>
        {file.name}
      </Text>
      {upload.status === UploadStatus.Success && (
        <Icon style={{ color: color.Success.Main }} src={Icons.Check} size="100" />
      )}
    </UploadCard>
  );
}
