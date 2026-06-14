import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  Menu,
  MenuItem,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  Tooltip,
  TooltipProvider,
  as,
  config,
  toRem,
} from 'folds';
import classNames from 'classnames';
import { BlurhashCanvas } from 'react-blurhash';
import FocusTrap from 'focus-trap-react';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import type { IImageInfo } from '$types/matrix/common';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaUrlCacheContext } from '$hooks/useMediaUrlCacheContext';
import { bytesToSize } from '$utils/common';
import { FALLBACK_MIMETYPE } from '$utils/mimeTypes';
import { stopPropagation } from '$utils/keyboard';
import {
  decryptFileSafe,
  downloadEncryptedMedia,
  downloadMedia,
  mxcUrlToHttp,
} from '$utils/matrix';
import { getDecryptedBlob, storeDecryptedBlob } from '$hooks/useBlobCache';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { ModalWide } from '$styles/Modal.css';
import { validBlurHash } from '$utils/blurHash';
import * as css from './style.css';
import { MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME } from '../../../../unstable/prefixes';
import { Icon, Icons } from '$app/icons';

function thumbnailDimsForMaxEdge(
  maxEdge: number,
  w?: number,
  h?: number
): { tw: number; th: number } {
  const safeEdge = Math.max(1, Math.round(maxEdge));
  const iw = typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : safeEdge;
  const ih = typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : safeEdge;
  const longest = Math.max(iw, ih);
  if (longest <= safeEdge) return { tw: Math.round(iw), th: Math.round(ih) };
  const scale = safeEdge / longest;
  return {
    tw: Math.max(1, Math.round(iw * scale)),
    th: Math.max(1, Math.round(ih * scale)),
  };
}

type RenderViewerProps = {
  src: string;
  alt: string;
  requestClose: () => void;
  info?: IImageInfo;
};
type RenderImageProps = {
  alt: string;
  title: string;
  src: string;
  width?: number;
  height?: number;
  onLoad: () => void;
  onError: () => void;
  onClick: () => void;
  tabIndex: number;
};
export type ImageContentProps = {
  body: string;
  mimeType?: string;
  url: string;
  info?: IImageInfo;
  encInfo?: EncryptedAttachmentInfo;
  autoPlay?: boolean;
  markedAsSpoiler?: boolean;
  spoilerReason?: string;
  renderViewer: (props: RenderViewerProps) => ReactNode;
  renderImage: (props: RenderImageProps) => ReactNode;
  matrixThumbnailMaxEdge?: number;
  mediaLayout?: 'default' | 'contained';
  containedStripMinPx?: number;
  fillsPreviewSlot?: boolean;
  onError?: () => void;
  suppressErrorUI?: boolean;
};
export const ImageContent = as<'div', ImageContentProps>(
  (
    {
      className,
      style,
      body,
      mimeType,
      url,
      info,
      encInfo,
      autoPlay,
      markedAsSpoiler,
      spoilerReason,
      renderViewer,
      renderImage,
      matrixThumbnailMaxEdge,
      mediaLayout = 'default',
      containedStripMinPx,
      fillsPreviewSlot,
      onError,
      suppressErrorUI,
      ...props
    },
    ref
  ) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const mediaUrlCache = useMediaUrlCacheContext();
    const blurHash = validBlurHash(info?.[MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME]);

    const [load, setLoad] = useState(false);
    const [error, setError] = useState(false);
    const [viewer, setViewer] = useState(false);
    const [viewerFullSrc, setViewerFullSrc] = useState<string | null>(null);
    const [blurred, setBlurred] = useState(markedAsSpoiler ?? false);
    const [isHovered, setIsHovered] = useState(false);

    const rawMediaUrl = useMemo(() => {
      if (url.startsWith('http')) return url;
      return mxcUrlToHttp(mx, url, useAuthentication) ?? undefined;
    }, [mx, url, useAuthentication]);

    const [srcState, loadSrc] = useAsyncCallback(
      useCallback(async () => {
        if (url.startsWith('http')) return url;

        if (typeof matrixThumbnailMaxEdge === 'number' && matrixThumbnailMaxEdge > 0 && !encInfo) {
          const { tw, th } = thumbnailDimsForMaxEdge(matrixThumbnailMaxEdge, info?.w, info?.h);
          const thumbUrl = mediaUrlCache.get(mx, url, useAuthentication, tw, th, 'scale', false);
          if (thumbUrl) {
            const cachedBlob = mediaUrlCache.getBlob(url, false, `thumb:${tw}x${th}:scale`);
            if (cachedBlob) return cachedBlob;

            const thumbContent = await downloadMedia(thumbUrl, mx.getAccessToken());
            const thumbBlobUrl = URL.createObjectURL(thumbContent);
            mediaUrlCache.setBlob(url, false, thumbBlobUrl, `thumb:${tw}x${th}:scale`);
            return thumbBlobUrl;
          }
        }

        const mediaUrl = rawMediaUrl;
        if (!mediaUrl) throw new Error('Invalid media URL');

        if (encInfo) {
          // Check blob cache first to avoid redundant downloads/decryption
          const cachedBlob = mediaUrlCache.getBlob(url, true, mimeType);
          if (cachedBlob) return cachedBlob;

          const persistedBlob = await getDecryptedBlob(url);
          if (persistedBlob) {
            const blobUrl = URL.createObjectURL(persistedBlob);
            mediaUrlCache.setBlob(url, true, blobUrl, mimeType);
            return blobUrl;
          }

          const fileContent = await downloadEncryptedMedia(
            mediaUrl,
            (encBuf) =>
              decryptFileSafe(encBuf, mimeType ?? FALLBACK_MIMETYPE, encInfo, { mediaUrl }),
            mx.getAccessToken()
          );
          const blobUrl = URL.createObjectURL(fileContent);
          mediaUrlCache.setBlob(url, true, blobUrl, mimeType);
          // Persist the decrypted blob so subsequent loads skip decrypt
          void storeDecryptedBlob(url, fileContent);
          return blobUrl;
        }
        const cachedBlob = mediaUrlCache.getBlob(url, false, mimeType);
        if (cachedBlob) return cachedBlob;

        const fileContent = await downloadMedia(mediaUrl, mx.getAccessToken());
        const blobUrl = URL.createObjectURL(fileContent);
        mediaUrlCache.setBlob(url, false, blobUrl, mimeType);
        return blobUrl;
      }, [
        encInfo,
        info?.h,
        info?.w,
        matrixThumbnailMaxEdge,
        mediaUrlCache,
        mimeType,
        mx,
        rawMediaUrl,
        url,
        useAuthentication,
      ])
    );

    useEffect(() => {
      if (!viewer) {
        setViewerFullSrc(null);
        return;
      }
      if (
        typeof matrixThumbnailMaxEdge !== 'number' ||
        matrixThumbnailMaxEdge <= 0 ||
        encInfo ||
        url.startsWith('http')
      ) {
        return;
      }
      setViewerFullSrc(rawMediaUrl ?? null);
    }, [viewer, matrixThumbnailMaxEdge, encInfo, url, rawMediaUrl]);

    // When the source download succeeds, reset image-element error state so the
    // Retry button doesn't flash before the <img> has had a chance to load.
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
      setLoad(false);
      setError(true);
      onError?.();
    };

    const handleRetry = () => {
      setError(false);
      loadSrc();
    };

    useEffect(() => {
      if (autoPlay) loadSrc();
    }, [autoPlay, loadSrc]);

    // Safety timeout: if the image src is ready but hasn't loaded within 30s,
    // treat it as an error. This prevents infinite spinners when the browser
    // silently fails to load the image (e.g. bad URL, CORS issue).
    useEffect(() => {
      if (srcState.status !== AsyncStatus.Success || load || error) return undefined;
      const timeoutId = setTimeout(() => {
        if (!load && !error) {
          // eslint-disable-next-line no-console
          console.warn('[ImageContent] Image load timeout after 30s:', url);
          setError(true);
          onError?.();
        }
      }, 30000);
      return () => clearTimeout(timeoutId);
    }, [srcState.status, load, error, url, onError]);

    const imageW = info?.w;
    const imageH = info?.h;
    const hasDimensions = typeof imageW === 'number' && typeof imageH === 'number';
    const isContained = mediaLayout === 'contained';
    const fillsSlot = Boolean(fillsPreviewSlot && isContained);
    const containedReserveStrip =
      !fillsSlot &&
      isContained &&
      (srcState.status === AsyncStatus.Loading ||
        srcState.status === AsyncStatus.Error ||
        error ||
        (srcState.status === AsyncStatus.Success && !load));

    const rootClass = isContained ? css.ContainedMediaRoot : css.RelativeBase;
    const stripMin = containedStripMinPx ?? 56;
    const intrinsicSizingStyle = fillsSlot
      ? {}
      : isContained
        ? { minHeight: containedReserveStrip ? toRem(stripMin) : undefined }
        : hasDimensions
          ? { aspectRatio: `${imageW} / ${imageH}` }
          : { minHeight: '150px' };

    const fillPreviewSlotStyle = fillsSlot
      ? ({ width: '100%', height: '100%' } as const)
      : undefined;

    return (
      <Box
        className={classNames(rootClass, className)}
        style={{
          ...fillPreviewSlotStyle,
          ...intrinsicSizingStyle,
          ...style,
        }}
        {...props}
        ref={ref}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
      >
        {srcState.status === AsyncStatus.Success && (
          <Overlay open={viewer} backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  onDeactivate: () => setViewer(false),
                  clickOutsideDeactivates: true,
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Modal
                  className={ModalWide}
                  size="500"
                  onContextMenu={(evt: React.MouseEvent) => evt.stopPropagation()}
                >
                  {renderViewer({
                    src: viewerFullSrc ?? srcState.data,
                    alt: body,
                    requestClose: () => setViewer(false),
                    info: info,
                  })}
                </Modal>
              </FocusTrap>
            </OverlayCenter>
          </Overlay>
        )}
        {typeof blurHash === 'string' && !load && (
          <BlurhashCanvas
            style={{ width: '100%', height: '100%' }}
            width={32}
            height={32}
            hash={blurHash}
            punch={1}
          />
        )}
        {!autoPlay && !markedAsSpoiler && srcState.status === AsyncStatus.Idle && (
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
              before={<Icon size="Inherit" src={Icons.Photo} filled />}
            >
              <Text size="B300">View</Text>
            </Button>
          </Box>
        )}
        {srcState.status === AsyncStatus.Success && (
          <Box
            className={classNames(
              hasDimensions && !isContained ? css.AbsoluteContainer : undefined,
              blurred && css.Blur
            )}
            style={{ width: '100%' }}
          >
            {renderImage({
              alt: body,
              title: body,
              src: srcState.data,
              ...(typeof info?.w === 'number' && Number.isFinite(info.w) ? { width: info.w } : {}),
              ...(typeof info?.h === 'number' && Number.isFinite(info.h) ? { height: info.h } : {}),
              onLoad: handleLoad,
              onError: handleError,
              onClick: () => {
                setIsHovered(false);
                setViewer(true);
              },
              tabIndex: 0,
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
        {!suppressErrorUI && (error || srcState.status === AsyncStatus.Error) && (
          <Box
            className={css.AbsoluteContainer}
            alignItems="Center"
            justifyContent="Center"
            onClick={handleRetry}
          >
            <TooltipProvider
              tooltip={
                <Tooltip variant="Critical">
                  <Text>Failed to load image!</Text>
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
                title={blurred ? 'Reveal Image' : 'Hide Image'}
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
        {!load && typeof info?.size === 'number' && (
          <Box className={css.AbsoluteFooter} justifyContent="End" alignContent="Center" gap="200">
            <Badge variant="Secondary" fill="Soft">
              <Text size="L400">{bytesToSize(info.size)}</Text>
            </Badge>
          </Box>
        )}
      </Box>
    );
  }
);
