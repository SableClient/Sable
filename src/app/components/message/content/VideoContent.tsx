import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  as,
  config,
} from 'folds';
import { TooltipProvider } from '$components/overlay-stack';
import { Eye, EyeSlash, menuIcon, sizedIcon, Play, Warning } from '$components/icons/phosphor';
import classNames from 'classnames';
import { isTauri } from '@tauri-apps/api/core';
import { BlurhashCanvas } from 'react-blurhash';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import type { IThumbnailContent, IVideoInfo } from '$types/matrix/common';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { bytesToSize, millisecondsToMinutesAndSeconds } from '$utils/common';
import {
  decryptFile,
  downloadEncryptedMedia,
  downloadMedia,
  mxcUrlToHttp,
  rewriteAuthenticatedMediaUrl,
} from '$utils/matrix';
import { addTauriMediaRetryRevision, getTauriMediaRetryTarget } from '$utils/mediaUrl';
import { setMediaEncryption } from '$utils/tauriMediaEncryption';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useCreateObjectURL } from '$hooks/useObjectURL';
import { validBlurHash } from '$utils/blurHash';
import * as css from './style.css';
import { MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME } from '../../../../unstable/prefixes';
import { probeSWMediaAuthSupport } from '$utils/swMediaAuth';

type RenderVideoProps = {
  title: string;
  src: string;
  onLoadedMetadata: () => void;
  onError: () => void;
  autoPlay: boolean;
  controls: boolean;
  crossOrigin?: 'anonymous';
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
    const blurHash = validBlurHash(info.thumbnail_info?.[MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME]);

    const [load, setLoad] = useState(false);
    const [error, setError] = useState(false);
    // Tauri only: each retry gets a distinct sable-media:// src.
    const retryRevisionRef = useRef(0);
    const [blurred, setBlurred] = useState(markedAsSpoiler ?? false);
    const [isHovered, setIsHovered] = useState(false);

    const createObjectURL = useCreateObjectURL();
    // Set when the streaming URL already failed once for this attachment; any
    // further load uses the token-attached blob path instead of the SW.
    const preferBlobRef = useRef(false);

    useEffect(() => {
      preferBlobRef.current = false;
    }, [url]);

    const [srcState, loadSrc] = useAsyncCallback(
      useCallback(async () => {
        if (url.startsWith('http')) return url;

        const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
        if (!mediaUrl) throw new Error('Invalid media URL');
        if (!encInfo) {
          if (isTauri()) {
            return addTauriMediaRetryRevision(mediaUrl, retryRevisionRef.current);
          }
          // Stream through the service worker only after it proved media-auth
          // support; a stale SW build would otherwise serve the bare URL to
          // the homeserver and the element would fail with a 4xx.
          if (!preferBlobRef.current && (await probeSWMediaAuthSupport())) return mediaUrl;
          return createObjectURL(downloadMedia(mediaUrl, { forceDirectAuth: true }));
        }
        if (isTauri()) {
          const attemptedTarget =
            getTauriMediaRetryTarget(mediaUrl, retryRevisionRef.current) ?? mediaUrl;
          await setMediaEncryption(attemptedTarget, encInfo, mimeType);
          return rewriteAuthenticatedMediaUrl(attemptedTarget)!;
        }
        return createObjectURL(
          downloadEncryptedMedia(mediaUrl, (encBuf) => decryptFile(encBuf, mimeType, encInfo))
        );
      }, [mx, url, useAuthentication, mimeType, encInfo, createObjectURL])
    );

    // When the source download succeeds, reset video-element error state so the
    // Retry button doesn't flash before the <video> has had a chance to load.
    useEffect(() => {
      if (srcState.status === AsyncStatus.Success) {
        setError(false);
      }
    }, [srcState.status]);

    const streamsAuthenticatedMedia =
      srcState.status === AsyncStatus.Success &&
      !url.startsWith('http') &&
      !srcState.data.startsWith('blob:');

    const handleLoad = () => {
      setLoad(true);
      setError(false);
    };
    const handleError = () => {
      // Only show the error if the source download already succeeded — if
      // it's still loading the video element may fire a transient error
      // before the blob URL is ready.
      if (srcState.status === AsyncStatus.Success) {
        // The streaming URL failed (e.g. a stale service worker acknowledged
        // the probe but still cannot serve the media): retry once through the
        // blob path, which attaches the access token in JavaScript.
        if (
          !preferBlobRef.current &&
          !isTauri() &&
          !url.startsWith('http') &&
          !srcState.data.startsWith('blob:')
        ) {
          preferBlobRef.current = true;
          loadSrc().catch(() => undefined);
          return;
        }
        setLoad(false);
        setError(true);
      }
    };

    const handleRetry = () => {
      setError(false);
      retryRevisionRef.current += 1;
      loadSrc().catch(() => undefined);
    };

    useEffect(() => {
      if (autoPlay) loadSrc().catch(() => undefined);
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
              // Firefox blocks media Range responses it cannot sniff as audio/video (mozilla bug
              // 1880289); requesting with CORS opts out. External URLs are left alone since we
              // cannot assume they send Access-Control-Allow-Origin.
              crossOrigin: streamsAuthenticatedMedia ? 'anonymous' : undefined,
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
                loadSrc().catch(() => undefined);
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
                  loadSrc().catch(() => undefined);
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
                radii="300"
                fill="Soft"
                variant="Secondary"
                title={blurred ? 'Reveal Video' : 'Hide Video'}
                onClick={(e) => {
                  e.preventDefault();
                  if (srcState.status === AsyncStatus.Idle) {
                    loadSrc().catch(() => undefined);
                    setBlurred(false);
                  } else setBlurred(!blurred);
                }}
              >
                {menuIcon(blurred ? Eye : EyeSlash)}
              </MenuItem>
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
