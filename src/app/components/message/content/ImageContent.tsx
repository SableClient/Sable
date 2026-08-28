import type { CSSProperties, ReactNode, SyntheticEvent } from 'react';
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
import {
  addTauriMediaRetryRevision,
  getTauriMediaRetryTarget,
  prepareLoopbackImageSource,
} from '$utils/mediaUrl';
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

// Matches Element Web's timeline thumbnail budget.
const TIMELINE_THUMBNAIL_WIDTH = 800;
const TIMELINE_THUMBNAIL_HEIGHT = 600;
const THUMBNAIL_MIN_SOURCE_BYTES = 1024 * 1024;

// Follows Element Web's `getThumbUrl`, except that unknown dimensions keep the original: stickers
// and custom emoji render through this component too and routinely omit `info`.
function wantsThumbnail(info: IImageInfo | undefined, width: number, height: number): boolean {
  if (!info?.w || !info.h || !info.size) return false;
  if (info.w <= width && info.h <= height) return false;
  // At 1x the thumbnail is already full quality for the box; denser screens keep the original
  // until the file is big enough that the bytes matter more than the sharpness.
  return window.devicePixelRatio === 1 || info.size > THUMBNAIL_MIN_SOURCE_BYTES;
}

// `info.w`/`info.h` have the source EXIF orientation applied; homeservers that scale raw pixels
// return a transposed thumbnail with no EXIF left for the browser to correct.
function isTransposedThumbnail(info: IImageInfo | undefined, image: HTMLImageElement): boolean {
  const { naturalWidth, naturalHeight } = image;
  if (!info?.w || !info.h || !naturalWidth || !naturalHeight) return false;
  return info.w > info.h !== naturalWidth > naturalHeight;
}

type RenderViewerProps = {
  src: string;
  alt: string;
  filename?: string;
  requestClose: () => void;
  info?: IImageInfo;
  getDownloadBlob?: () => Promise<Blob>;
};
type RenderImageProps = {
  alt: string;
  title: string;
  src: string;
  info?: IImageInfo;
  onLoad: (event?: SyntheticEvent<HTMLImageElement>) => void;
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
  favoriteShareUrl?: string;
  loadLabel?: string;
  loadDescription?: string;
  deferMediaLoad?: boolean;
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
      favoriteShareUrl,
      loadLabel,
      loadDescription,
      deferMediaLoad = false,
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
    const [loadRequested, setLoadRequested] = useState(autoPlay ?? false);
    // Tauri only: each retry gets a distinct sable-media:// src.
    const retryRevisionRef = useRef(0);
    const [viewer, setViewer] = useState(false);
    const [viewerFullSrc, setViewerFullSrc] = useState<string | null>(null);
    const [blurred, setBlurred] = useState(markedAsSpoiler ?? false);
    const [isHovered, setIsHovered] = useState(false);

    const favoritedContent = useFavoriteGifs();
    const [favorited, setFavorited] = useState(
      favoritedContent.gifs.find((v) => v.mediaUrl == url) != undefined
    );

    const isGif = checkIfGif(url, info?.mimetype, body);

    const [thumbnailFailed, setThumbnailFailed] = useState(false);
    // A caller-supplied edge means it already decided it wants a thumbnail of that size.
    const explicitEdge = typeof matrixThumbnailMaxEdge === 'number' && matrixThumbnailMaxEdge > 0;
    // Synapse rejects non-integer dimensions with a 400.
    const thumbWidth = Math.round(explicitEdge ? matrixThumbnailMaxEdge : TIMELINE_THUMBNAIL_WIDTH);
    const thumbHeight = Math.round(
      explicitEdge ? matrixThumbnailMaxEdge : TIMELINE_THUMBNAIL_HEIGHT
    );
    const usesThumbnail =
      !encInfo && // the homeserver cannot scale media it cannot decrypt
      !isGif && // scaling drops the animation
      !url.startsWith('http') &&
      !thumbnailFailed &&
      (explicitEdge || wantsThumbnail(info, thumbWidth, thumbHeight));

    const rawMediaUrl = useMemo(() => {
      if (url.startsWith('http')) return url;
      if (usesThumbnail) {
        return (
          mxcUrlToHttp(mx, url, useAuthentication, thumbWidth, thumbHeight, 'scale') ?? undefined
        );
      }
      return mxcUrlToHttp(mx, url, useAuthentication) ?? undefined;
    }, [mx, url, useAuthentication, usesThumbnail, thumbWidth, thumbHeight]);

    const shouldResolveMedia = !deferMediaLoad || autoPlay || loadRequested;
    const tauri = isTauri();
    // Tauri resolves the source inside `loadSrc` instead.
    const resolvedMediaUrl = useRenderableMediaUrl(
      encInfo || tauri || !shouldResolveMedia ? undefined : rawMediaUrl
    );

    const createObjectURL = useCreateObjectURL();

    const [srcState, loadSrc] = useAsyncCallback(
      useCallback(async () => {
        if (encInfo) {
          if (!rawMediaUrl) throw new Error('Invalid media URL');
          if (tauri) {
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
        const source = addTauriMediaRetryRevision(
          resolvedMediaUrl ?? rawMediaUrl ?? url,
          retryRevisionRef.current
        );
        return tauri && rawMediaUrl ? prepareLoopbackImageSource(source) : source;
      }, [rawMediaUrl, resolvedMediaUrl, tauri, url, mimeType, encInfo, createObjectURL])
    );

    useEffect(() => {
      if (!viewer) {
        setViewerFullSrc(null);
        return undefined;
      }
      // The timeline shows a scaled rendition, so the viewer has to re-fetch the original.
      if (!usesThumbnail) {
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
    }, [viewer, usesThumbnail, url, mx, useAuthentication]);

    const handleLoad = (event?: SyntheticEvent<HTMLImageElement>) => {
      if (usesThumbnail && event && isTransposedThumbnail(info, event.currentTarget)) {
        setThumbnailFailed(true);
        return;
      }
      setLoad(true);
    };
    const handleError = () => {
      setLoad(false);
      // Homeservers 4xx thumbnail requests for media they cannot scale; the original still works.
      if (usesThumbnail) {
        setThumbnailFailed(true);
        return;
      }
      setError(true);
    };

    const handleRetry = () => {
      setLoadRequested(true);
      setError(false);
      retryRevisionRef.current += 1;
      loadSrc().catch(() => undefined);
    };

    const handleView = async () => {
      setLoadRequested(true);
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

    // Guarded by a ref rather than `loadSrc` identity: `loadSrc` changes on every render when the
    // caller passes `info`/`encInfo` inline, which would otherwise re-fetch in a loop.
    const fallbackLoadedRef = useRef(false);
    useEffect(() => {
      if (!thumbnailFailed || fallbackLoadedRef.current) return;
      fallbackLoadedRef.current = true;
      loadSrc().catch(() => undefined);
    }, [thumbnailFailed, loadSrc]);

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
            getDownloadBlob:
              encInfo && rawMediaUrl
                ? () =>
                    downloadEncryptedMedia(rawMediaUrl, (buffer) =>
                      decryptFile(buffer, mimeType ?? FALLBACK_MIMETYPE, encInfo)
                    )
                : undefined,
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
            respectSafeArea={false}
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
            direction="Column"
            gap="200"
            {...viewActivation}
          >
            {loadDescription && <Text size="T300">{loadDescription}</Text>}
            <Button
              variant="Secondary"
              fill="Solid"
              radii="300"
              size="300"
              before={sizedIcon(Image, 'Inherit', { filled: true })}
            >
              <Text size="B300">{loadLabel ?? 'View'}</Text>
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
              setLoadRequested(true);
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
                setLoadRequested(true);
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
                      setLoadRequested(true);
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
                                  shareUrl: favoriteShareUrl ?? url,
                                  mediaUrl: url,
                                  width: imageW,
                                  height: imageH,
                                  size: info?.size,
                                  mimetype: info?.mimetype,
                                  ...(info?.[MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME]
                                    ? {
                                        blurhash: info[MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME],
                                      }
                                    : {}),
                                },
                              ],
                            })
                            .catch(() => setFavorited(false));
                        } else {
                          setFavorited(false);
                          await mx
                            .setAccountData(MATRIX_SABLE_UNSTABLE_FAVORITE_GIFS, {
                              gifs: favoritedContent.gifs.filter((v) => v.mediaUrl != url),
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
