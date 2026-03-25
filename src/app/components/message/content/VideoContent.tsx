import { ReactNode, useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  Icon,
  Icons,
  Menu,
  MenuItem,
  Spinner,
  Text,
  Tooltip,
  TooltipProvider,
  as,
  config,
} from 'folds';
import classNames from 'classnames';
import { BlurhashCanvas } from 'react-blurhash';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import {
  IThumbnailContent,
  IVideoInfo,
  MATRIX_BLUR_HASH_PROPERTY_NAME,
} from '$types/matrix/common';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { bytesToSize, millisecondsToMinutesAndSeconds } from '$utils/common';
import { decryptFile, downloadEncryptedMedia, downloadMedia, mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useMediaDownloadToken } from '$hooks/useMediaSrc';
import { validBlurHash } from '$utils/blurHash';
import * as css from './style.css';

type RenderVideoProps = {
  title: string;
  src: string;
  onLoadedMetadata: () => void;
  onError: () => void;
  autoPlay: boolean;
  controls: boolean;
};
type VideoContentProps = {
  body: string;
  mimeType: string;
  url: string;
  info: IVideoInfo & IThumbnailContent;
  encInfo?: EncryptedAttachmentInfo;
  autoPlay?: boolean;
  markedAsSpoiler?: boolean;
  spoilerReason?: string;
  renderThumbnail?: () => ReactNode;
  renderVideo: (props: RenderVideoProps) => ReactNode;
};
export const VideoContent = as<'div', VideoContentProps>(
  (
    {
      className,
      body,
      mimeType,
      url,
      info,
      encInfo,
      autoPlay,
      markedAsSpoiler,
      spoilerReason,
      renderThumbnail,
      renderVideo,
      ...props
    },
    ref
  ) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const mediaToken = useMediaDownloadToken();
    const blurHash = validBlurHash(info.thumbnail_info?.[MATRIX_BLUR_HASH_PROPERTY_NAME]);

    const [load, setLoad] = useState(false);
    const [error, setError] = useState(false);
    const [blurred, setBlurred] = useState(markedAsSpoiler ?? false);
    const [isHovered, setIsHovered] = useState(false);

    const [srcState, loadSrc] = useAsyncCallback(
      useCallback(async () => {
        if (url.startsWith('http')) return url;

        const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
        if (!mediaUrl) throw new Error('Invalid media URL');
        const fileContent = encInfo
          ? await downloadEncryptedMedia(
              mediaUrl,
              (encBuf) => decryptFile(encBuf, mimeType, encInfo),
              mediaToken
            )
          : await downloadMedia(mediaUrl, mediaToken);
        return URL.createObjectURL(fileContent);
      }, [mx, url, useAuthentication, mimeType, encInfo, mediaToken])
    );

    // When the source download succeeds, reset video-element error state so the
    // Retry button doesn't flash before the <video> has had a chance to load.
    useEffect(() => {
      if (srcState.status === AsyncStatus.Success) {
        setError(false);
      }
    }, [srcState.status]);

    const handleLoad = () => {
      setLoad(true);
      setError(false);
    };
    const handleError = () => {
      // Only show the error if the source download already succeeded — if
      // it's still loading the video element may fire a transient error
      // before the blob URL is ready.
      if (srcState.status === AsyncStatus.Success) {
        setLoad(false);
        setError(true);
      }
    };

    const handleRetry = () => {
      setError(false);
      loadSrc();
    };

    useEffect(() => {
      if (autoPlay) loadSrc();
    }, [autoPlay, loadSrc]);

    return (
      <Box
        className={classNames(css.RelativeBase, className)}
        {...props}
        ref={ref}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
      >
        {typeof blurHash === 'string' && !load && (
          <BlurhashCanvas
            style={{ width: '100%', height: '100%' }}
            width={32}
            height={32}
            hash={blurHash}
            punch={1}
          />
        )}
        {renderThumbnail && !load && (
          <Box
            className={classNames(css.AbsoluteContainer, blurred && css.Blur)}
            alignItems="Center"
            justifyContent="Center"
          >
            {renderThumbnail()}
          </Box>
        )}
        {!autoPlay && !blurred && srcState.status === AsyncStatus.Idle && (
          <Box
            className={css.AbsoluteContainer}
            alignItems="Center"
            justifyContent="Center"
            onClick={loadSrc}
          >
            <Button
              variant="Secondary"
              fill="Solid"
              radii="300"
              size="300"
              onClick={loadSrc}
              before={<Icon size="Inherit" src={Icons.Play} filled />}
            >
              <Text size="B300">Watch</Text>
            </Button>
          </Box>
        )}
        {srcState.status === AsyncStatus.Success && (
          <Box className={classNames(css.AbsoluteContainer, blurred && css.Blur)}>
            {renderVideo({
              title: body,
              src: srcState.data,
              onLoadedMetadata: handleLoad,
              onError: handleError,
              autoPlay: false,
              controls: true,
            })}
          </Box>
        )}
        {blurred && !error && srcState.status !== AsyncStatus.Error && (
          <Box
            className={css.AbsoluteContainer}
            alignItems="Center"
            justifyContent="Center"
            onClick={() => {
              setBlurred(false);
              if (srcState.status === AsyncStatus.Idle) {
                loadSrc();
              }
            }}
          >
            <Chip
              variant="Secondary"
              radii="Pill"
              size="500"
              outlined
              onClick={() => {
                setBlurred(false);
                if (srcState.status === AsyncStatus.Idle) {
                  loadSrc();
                }
              }}
            >
              <Text size="B300">
                {typeof spoilerReason === 'string' && spoilerReason.length > 0
                  ? `Spoiler reason: ${spoilerReason}`
                  : `Spoilered`}
              </Text>
            </Chip>
          </Box>
        )}
        {(srcState.status === AsyncStatus.Loading || srcState.status === AsyncStatus.Success) &&
          !load &&
          !error &&
          !blurred && (
            <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
              <Spinner variant="Secondary" />
            </Box>
          )}
        {!load && (error || srcState.status === AsyncStatus.Error) && (
          <Box
            className={css.AbsoluteContainer}
            alignItems="Center"
            justifyContent="Center"
            onClick={handleRetry}
          >
            <TooltipProvider
              tooltip={
                <Tooltip variant="Critical">
                  <Text>Failed to load video!</Text>
                </Tooltip>
              }
              position="Top"
              align="Center"
            >
              {(triggerRef) => (
                <Button
                  ref={triggerRef}
                  size="300"
                  variant="Critical"
                  fill="Soft"
                  outlined
                  radii="300"
                  onClick={handleRetry}
                  before={<Icon size="Inherit" src={Icons.Warning} filled />}
                >
                  <Text size="B300">Retry</Text>
                </Button>
              )}
            </TooltipProvider>
          </Box>
        )}
        {isHovered && (
          <Box style={{ padding: config.space.S200, right: 0, position: 'absolute' }}>
            <Menu style={{ padding: config.space.S0 }}>
              <MenuItem
                size="300"
                after={<Icon size="200" src={blurred ? Icons.Eye : Icons.EyeBlind} />}
                radii="300"
                fill="Soft"
                variant="Secondary"
                title={blurred ? 'Reveal Video' : 'Hide Video'}
                onClick={(e) => {
                  e.preventDefault();
                  if (srcState.status === AsyncStatus.Idle) {
                    loadSrc();
                    setBlurred(false);
                  } else setBlurred(!blurred);
                }}
              />
            </Menu>
          </Box>
        )}
        {!load && typeof info.size === 'number' && (
          <Box
            className={css.AbsoluteFooter}
            justifyContent="SpaceBetween"
            alignContent="Center"
            gap="200"
          >
            <Badge variant="Secondary" fill="Soft">
              <Text size="L400">{millisecondsToMinutesAndSeconds(info.duration ?? 0)}</Text>
            </Badge>
            <Badge variant="Secondary" fill="Soft">
              <Text size="L400">{bytesToSize(info.size)}</Text>
            </Badge>
          </Box>
        )}
      </Box>
    );
  }
);
