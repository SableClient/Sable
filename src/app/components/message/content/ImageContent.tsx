import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  Menu,
  MenuItem,
  Modal,
  Spinner,
  Text,
  Tooltip,
  as,
  color,
  config,
  toRem,
} from 'folds';
import { TooltipProvider } from '$components/overlay-stack';
import {
  Eye,
  EyeSlash,
  menuIcon,
  sizedIcon,
  Image,
  Warning,
  Star,
} from '$components/icons/phosphor';
import classNames from 'classnames';
import { BlurhashCanvas } from 'react-blurhash';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import type { IImageInfo } from '$types/matrix/common';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { bytesToSize } from '$utils/common';
import { FALLBACK_MIMETYPE } from '$utils/mimeTypes';
import {
  decryptFile,
  downloadEncryptedMedia,
  mxcUrlToHttp,
  rewriteAuthenticatedMediaUrl,
} from '$utils/matrix';
import { addTauriMediaRetryRevision, getTauriMediaRetryTarget } from '$utils/mediaUrl';
import { setMediaEncryption } from '$utils/tauriMediaEncryption';
import { isTauri } from '@tauri-apps/api/core';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { ModalWide } from '$styles/Modal.css';
import { validBlurHash } from '$utils/blurHash';
import * as css from './style.css';
import {
  MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS,
  MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME,
} from '../../../../unstable/prefixes';
import { useFavoriteGifs } from '$hooks/useFavoriteGifs';
import { useRenderableMediaUrl } from '$hooks/useRenderableMediaUrl';
import { useCreateObjectURL } from '$hooks/useObjectURL';
import { ScreenSize, useScreenSizeOptionally } from '$hooks/useScreenSize';
import { useMobileTapActivation } from '$hooks/useMobileTapActivation';
import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';

export function checkIfGif(url: string, mimetype?: string, body?: string) {
  return (
    mimetype === 'image/avif' ||
    mimetype === 'image/gif' ||
    mimetype === 'image/apng' ||
    mimetype === 'image/webp' ||
    (body ?? '').toLowerCase().endsWith('.avif') ||
    (body ?? '').toLowerCase().endsWith('.gif') ||
    (body ?? '').toLowerCase().endsWith('.apng') ||
    (body ?? '').toLowerCase().endsWith('.webp') ||
    url.toLowerCase().endsWith('.avif') ||
    url.toLowerCase().endsWith('.gif') ||
    url.toLowerCase().endsWith('.apng') ||
    url.toLowerCase().endsWith('.webp') ||
    false
  );
}

type RenderViewerProps = {
  src: string;
  alt: string;
  filename?: string;
  requestClose: () => void;
  info?: IImageInfo;
};
type RenderImageProps = {
  alt: string;
  title: string;
  src: string;
  info?: IImageInfo;
  onLoad: () => void;
  onError: () => void;
  onLottieLoad: () => void;
  onLottieError: () => void;
  onClick: () => void;
  tabIndex: number;
  style?: CSSProperties;
};
export type ImageContentProps = {
  body?: string;
  filename?: string;
  mimeType?: string;
  url: string;
  info?: IImageInfo;
  encInfo?: EncryptedAttachmentInfo;
  autoPlay?: boolean;
  markedAsSpoiler?: boolean;
  spoilerReason?: string;
  renderViewer: (props: RenderViewerProps) => ReactNode;
  renderImage: (props: RenderImageProps) => ReactNode;
  /** Opens the room-scoped mobile viewer when this attachment belongs to a timeline.
   *  Returns false when it declines, and the local viewer opens instead. */
  onOpenViewer?: () => boolean;
  matrixThumbnailMaxEdge?: number;
  mediaLayout?: 'default' | 'contained';
  containedStripMinPx?: number;
  fillsPreviewSlot?: boolean;
};
export const ImageContent = as<'div', ImageContentProps>(
  (
    {
      className,
      style,
      body,
      filename,
      mimeType,
      url,
      info,
      encInfo,
      autoPlay,
      markedAsSpoiler,
      spoilerReason,
      renderViewer,
      renderImage,
      onOpenViewer,
      matrixThumbnailMaxEdge,
      mediaLayout = 'default',
      containedStripMinPx,
      fillsPreviewSlot,
      ...props
    },
    ref
  ) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const isMobile = useScreenSizeOptionally() === ScreenSize.Mobile;
    const blurHash = validBlurHash(info?.[MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME]);

    const [load, setLoad] = useState(false);
    const [error, setError] = useState(false);
    // Tauri only: each retry gets a distinct sable-media:// src.
    const retryRevisionRef = useRef(0);
    const [viewer, setViewer] = useState(false);
    const [viewerFullSrc, setViewerFullSrc] = useState<string | null>(null);
    const [blurred, setBlurred] = useState(markedAsSpoiler ?? false);
    const [isHovered, setIsHovered] = useState(false);

    const favoritedContent = useFavoriteGifs();
    const [favorited, setFavorited] = useState(
      favoritedContent.gifs.find((v) => v.url == url) != undefined
    );

    const isGif = checkIfGif(url, info?.mimetype, body);

    const rawMediaUrl = useMemo(() => {
      if (url.startsWith('http')) return url;
      return mxcUrlToHttp(mx, url, useAuthentication) ?? undefined;
    }, [mx, url, useAuthentication]);

    const resolvedMediaUrl = useRenderableMediaUrl(encInfo ? undefined : rawMediaUrl);

    const createObjectURL = useCreateObjectURL();

    const [srcState, loadSrc] = useAsyncCallback(
      useCallback(async () => {
        if (encInfo) {
          if (!rawMediaUrl) throw new Error('Invalid media URL');
          if (isTauri()) {
            // The registration key is the revised target; Rust strips the fragment.
            const attemptedTarget =
              getTauriMediaRetryTarget(rawMediaUrl, retryRevisionRef.current) ?? rawMediaUrl;
            await setMediaEncryption(attemptedTarget, encInfo, mimeType ?? FALLBACK_MIMETYPE);
            return rewriteAuthenticatedMediaUrl(attemptedTarget)!;
          }
          return createObjectURL(
            downloadEncryptedMedia(rawMediaUrl, (encBuf) =>
              decryptFile(encBuf, mimeType ?? FALLBACK_MIMETYPE, encInfo)
            )
          );
        }
        return addTauriMediaRetryRevision(
          resolvedMediaUrl ?? rawMediaUrl ?? url,
          retryRevisionRef.current
        );
      }, [rawMediaUrl, resolvedMediaUrl, url, mimeType, encInfo, createObjectURL])
    );

    useEffect(() => {
      if (!viewer) {
        setViewerFullSrc(null);
        return undefined;
      }
      if (
        typeof matrixThumbnailMaxEdge !== 'number' ||
        matrixThumbnailMaxEdge <= 0 ||
        encInfo ||
        url.startsWith('http')
      ) {
        return undefined;
      }
      let cancelled = false;
      void (async () => {
        const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
        if (!mediaUrl || cancelled) return;
        setViewerFullSrc(mediaUrl);
      })();
      return () => {
        cancelled = true;
      };
    }, [viewer, matrixThumbnailMaxEdge, encInfo, url, mx, useAuthentication]);

    const handleLoad = () => {
      setLoad(true);
    };
    const handleError = () => {
      setLoad(false);
      setError(true);
    };

    const handleRetry = () => {
      setError(false);
      retryRevisionRef.current += 1;
      loadSrc().catch(() => undefined);
    };

    const handleView = async () => {
      if (srcState.status !== AsyncStatus.Idle) return;
      try {
        const src = await loadSrc();
        if (src !== undefined && !onOpenViewer?.()) setViewer(true);
      } catch {
        // The existing error state is handled by the async callback.
      }
    };
    const viewActivation = useMobileTapActivation(isMobile, () => {
      void handleView();
    });

    useEffect(() => {
      if (autoPlay) loadSrc().catch(() => undefined);
    }, [autoPlay, loadSrc]);

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
    const viewerContent =
      srcState.status === AsyncStatus.Success
        ? renderViewer({
            src: viewerFullSrc ?? srcState.data,
            alt: body ?? '',
            filename,
            requestClose: () => setViewer(false),
            info,
          })
        : null;

    return (
      <Box
        className={classNames(rootClass, className)}
        data-gestures="ignore"
        style={{
          ...fillPreviewSlotStyle,
          ...intrinsicSizingStyle,
          ...style,
        }}
        {...props}
        ref={ref}
        onPointerEnter={(evt) => {
          if (evt.pointerType === 'mouse' || evt.pointerType === 'pen') setIsHovered(true);
        }}
        onPointerLeave={(evt) => {
          if (evt.pointerType === 'mouse' || evt.pointerType === 'pen') setIsHovered(false);
        }}
      >
        {srcState.status === AsyncStatus.Success && (
          <ModalOverlay
            open={viewer}
            requestClose={() => setViewer(false)}
            mobile="fullscreen"
            background="#000"
          >
            {isMobile ? (
              viewerContent
            ) : (
              <Modal
                className={ModalWide}
                size="500"
                onContextMenu={(evt: React.MouseEvent) => evt.stopPropagation()}
              >
                {viewerContent}
              </Modal>
            )}
          </ModalOverlay>
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
            {...viewActivation}
          >
            <Button
              variant="Secondary"
              fill="Solid"
              radii="300"
              size="300"
              before={sizedIcon(Image, 'Inherit', { filled: true })}
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
              alt: body ?? '',
              title: body ?? '',
              src: srcState.data,
              info,
              style: { objectFit: isContained ? 'contain' : undefined },
              onLoad: handleLoad,
              onError: handleError,
              onLottieLoad: handleLoad,
              onLottieError: handleError,
              onClick: () => {
                setIsHovered(false);
                if (!onOpenViewer?.()) setViewer(true);
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
          !blurred && (
            <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
              <Spinner variant="Secondary" />
            </Box>
          )}
        {(error || srcState.status === AsyncStatus.Error) && (
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
              <Box>
                <MenuItem
                  size="300"
                  radii="0"
                  fill="Soft"
                  variant="Secondary"
                  title={blurred ? 'Reveal Image' : 'Hide Image'}
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
                {isGif && (
                  <MenuItem
                    size="300"
                    radii="0"
                    fill="Soft"
                    variant="Secondary"
                    title={favorited ? 'Unfavorite gif' : 'Favorite gif'}
                    onClick={async (e) => {
                      e.preventDefault();
                      if (srcState.status === AsyncStatus.Success) {
                        if (!favorited) {
                          setFavorited(true);
                          await mx
                            .setAccountData(MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS, {
                              gifs: [
                                ...favoritedContent.gifs,
                                {
                                  title: body ?? '',
                                  url: url,
                                  width: imageW,
                                  height: imageH,
                                  size: info?.size,
                                  mimetype: info?.mimetype,
                                },
                              ],
                            })
                            .catch(() => setFavorited(false));
                        } else {
                          setFavorited(false);
                          await mx
                            .setAccountData(MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS, {
                              gifs: favoritedContent.gifs.filter((v) => v.url != url),
                            })
                            .catch(() => setFavorited(true));
                        }
                      }
                    }}
                  >
                    {menuIcon(Star, {
                      weight: favorited ? 'fill' : 'regular',
                      color: favorited ? color.Warning.MainHover : color.Secondary.OnContainer,
                    })}
                  </MenuItem>
                )}
              </Box>
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
