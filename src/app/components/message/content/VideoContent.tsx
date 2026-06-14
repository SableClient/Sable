import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  Menu,
  MenuItem,
  Spinner,
  Text,
  Tooltip,
  TooltipProvider,
  as,
  config,
} from 'folds';
import { Eye, EyeSlash, menuIcon, sizedIcon, Play, Warning } from '$components/icons/phosphor';
import classNames from 'classnames';
import { BlurhashCanvas } from 'react-blurhash';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import type { IThumbnailContent, IVideoInfo } from '$types/matrix/common';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaUrlCacheContext } from '$hooks/useMediaUrlCacheContext';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { bytesToSize, millisecondsToMinutesAndSeconds } from '$utils/common';
import { decryptFileSafe, downloadEncryptedMedia, downloadMedia } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useMediaMetadata } from '$hooks/useMediaMetadata';
import { getScopedMediaCacheKey } from '$utils/mediaTransport';
import { storeMediaMetadataForBlob } from '$utils/mediaMetadata';
import { validBlurHash } from '$utils/blurHash';
import * as css from './style.css';
import { MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME } from '../../../../unstable/prefixes';

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
    const mediaUrlCache = useMediaUrlCacheContext();
    const blurHash = validBlurHash(info.thumbnail_info?.[MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME]);
    const rawMediaUrl = useMemo(() => {
      if (url.startsWith('http')) return url;
      return mediaUrlCache.get(mx, url, useAuthentication) ?? undefined;
    }, [mediaUrlCache, mx, url, useAuthentication]);
    const mediaMetadataKey = encInfo
      ? getScopedMediaCacheKey(url)
      : rawMediaUrl
        ? getScopedMediaCacheKey(rawMediaUrl)
        : undefined;
    const mediaMetadata = useMediaMetadata(mediaMetadataKey);
    const duration =
      typeof info.duration === 'number' && Number.isFinite(info.duration) && info.duration > 0
        ? info.duration
        : mediaMetadata?.duration;
    const byteSize =
      typeof info.size === 'number' && Number.isFinite(info.size) && info.size > 0
        ? info.size
        : mediaMetadata?.byteSize;

    const [load, setLoad] = useState(false);
    const [error, setError] = useState(false);
    const [blurred, setBlurred] = useState(markedAsSpoiler ?? false);
    const [isHovered, setIsHovered] = useState(false);

    const [srcState, loadSrc] = useAsyncCallback(
      useCallback(async () => {
        if (url.startsWith('http')) return url;

        const mediaUrl = rawMediaUrl;
        if (!mediaUrl) throw new Error('Invalid media URL');

        // Check blob cache first
        const isEncrypted = !!encInfo;
        const cachedBlob = mediaUrlCache.getBlob(url, isEncrypted, mimeType);
        if (cachedBlob) return cachedBlob;

        const fileContent = encInfo
          ? await downloadEncryptedMedia(
              mediaUrl,
              (encBuf) => decryptFileSafe(encBuf, mimeType, encInfo, { mediaUrl }),
              mx.getAccessToken()
            )
          : await downloadMedia(mediaUrl, mx.getAccessToken());

        const blobUrl = URL.createObjectURL(fileContent);
        mediaUrlCache.setBlob(url, isEncrypted, blobUrl, mimeType);
        void storeMediaMetadataForBlob(mediaMetadataKey, fileContent, 'video');
        return blobUrl;
      }, [mx, url, rawMediaUrl, mimeType, encInfo, mediaMetadataKey, mediaUrlCache])
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
              before={sizedIcon(Play, 'Inherit', { filled: true })}
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
                  before={sizedIcon(Warning, 'Inherit', { filled: true })}
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
                after={menuIcon(blurred ? Eye : EyeSlash)}
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
        {!load && typeof byteSize === 'number' && (
          <Box
            className={css.AbsoluteFooter}
            justifyContent="SpaceBetween"
            alignContent="Center"
            gap="200"
          >
            <Badge variant="Secondary" fill="Soft">
              <Text size="L400">{millisecondsToMinutesAndSeconds(duration ?? 0)}</Text>
            </Badge>
            <Badge variant="Secondary" fill="Soft">
              <Text size="L400">{bytesToSize(byteSize)}</Text>
            </Badge>
          </Box>
        )}
      </Box>
    );
  }
);
