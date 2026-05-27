import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatrixClient } from '$types/matrix-sdk';
import type { IPreviewUrlResponse } from '$types/matrix-sdk';
import {
  Box,
  Icon,
  IconButton,
  Icons,
  Scroll,
  Spinner,
  Text,
  as,
  color,
  config,
  toRem,
} from 'folds';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { mxcUrlToHttp, downloadMedia } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { safeDecodeUrl } from '$plugins/react-custom-html-parser';
import * as css from './UrlPreviewCard.css';
import * as urlPreviewChrome from './UrlPreview.css';
import { UrlPreview, UrlPreviewContent, UrlPreviewDescription } from './UrlPreview';
import { AudioContent, ImageContent, VideoContent } from '../message';
import { Image, MediaControl, Video } from '../media';
import { ImageViewer } from '../image-viewer';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import type { IImageInfo } from '$types/matrix/common';
import { MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME } from '$unstable/prefixes';

const linkStyles = { color: color.Success.Main };

// Module-level in-flight deduplication: prevents N+1 concurrent requests when a
// large event batch renders many UrlPreviewCard instances for the same URL.
// Scoped by MatrixClient to avoid cross-account dedup if multiple clients exist.
// Inner cache keyed by URL only (not ts) â€” the same URL shows the same preview
// regardless of which message referenced it. Promises are evicted after settling
// so a later render can retry after network recovery.
const previewRequestCache = new WeakMap<MatrixClient, Map<string, Promise<IPreviewUrlResponse>>>();

const getClientCache = (mx: MatrixClient): Map<string, Promise<IPreviewUrlResponse>> => {
  let clientCache = previewRequestCache.get(mx);
  if (!clientCache) {
    clientCache = new Map();
    previewRequestCache.set(mx, clientCache);
  }
  return clientCache;
};

const openMediaInNewTab = async (url: string | undefined) => {
  if (!url) {
    console.warn('Attempted to open an empty url');
    return;
  }
  const blob = await downloadMedia(url);
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank');
};

function ogPositiveDimension(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function isLikelyPlayableOgVideo(prev: IPreviewUrlResponse): boolean {
  const raw = prev['og:video'];
  if (typeof raw !== 'string') return false;
  const url = raw.trim();
  if (!url) return false;
  const mime =
    typeof prev['og:video:type'] === 'string' ? prev['og:video:type'].toLowerCase().trim() : '';
  if (mime.startsWith('video/')) return true;
  if (/^mxc:\/\//i.test(url)) {
    return mime.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url);
  }
  if (/^https?:\/\//i.test(url)) {
    return /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url) || mime.startsWith('video/');
  }
  return false;
}

export const UrlPreviewCard = as<
  'div',
  {
    urlPreview: boolean;
    url: string;
    ts?: number;
    mediaType?: string | null;
    bundle?: IPreviewUrlResponse;
  }
>(({ urlPreview, url, ts, mediaType, bundle, ...props }, ref) => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [linkPreviewImageMaxHeight] = useSetting(settingsAtom, 'linkPreviewImageMaxHeight');

  const isDirect = !!mediaType;

  const [previewStatus, loadPreview] = useAsyncCallback(
    useCallback(() => {
      if (isDirect) return Promise.resolve(null);
      if (!ts && !bundle) return Promise.resolve(null);
      if (urlPreview && ts) {
        const clientCache = getClientCache(mx);
        const cached = clientCache.get(url);
        if (cached !== undefined) return cached;
        const previewResult = mx?.getUrlPreview(url, ts);
        clientCache.set(url, previewResult);
        previewResult.finally(() => clientCache.delete(url));
        return previewResult;
      }
      return Promise.resolve(bundle);
    }, [isDirect, ts, bundle, urlPreview, mx, url])
  );

  useEffect(() => {
    loadPreview();
  }, [url, loadPreview]);

  if (previewStatus.status === AsyncStatus.Error) return null;

  const renderContent = (prev: IPreviewUrlResponse) => {
    const siteName = prev['og:site_name'];
    const title = prev['og:title'];
    const description = prev['og:description'];
    const imgUrl = mxcUrlToHttp(
      mx,
      prev['og:image'] || '',
      useAuthentication,
      256,
      256,
      'scale',
      false
    );
    const handleAuxClick = (ev: React.MouseEvent) => {
      if (!prev['og:image']) {
        console.warn('No image');
        return;
      }
      if (ev.button === 1) {
        ev.preventDefault();
        const mxcUrl = mxcUrlToHttp(mx, prev['og:image'], /* useAuthentication */ true);
        if (!mxcUrl) {
          console.error('Error converting mxc:// url.');
          return;
        }
        openMediaInNewTab(mxcUrl);
      }
    };

    const videoW = prev['og:video'] ? ogPositiveDimension(prev['og:video:width']) : undefined;
    const videoH = prev['og:video'] ? ogPositiveDimension(prev['og:video:height']) : undefined;
    const ogImgW = ogPositiveDimension(prev['og:image:width']);
    const ogImgH = ogPositiveDimension(prev['og:image:height']);

    const aspectRatio =
      videoW && videoH
        ? `${videoW} / ${videoH}`
        : ogImgW && ogImgH
          ? `${ogImgW} / ${ogImgH}`
          : undefined;

    const previewBlurRaw =
      typeof prev['matrix:image:blurhash'] === 'string' ? prev['matrix:image:blurhash'].trim() : '';

    const ogImageInfo: IImageInfo | undefined = (() => {
      const matrixSize = prev['matrix:image:size'];
      const size =
        typeof matrixSize === 'number' && Number.isFinite(matrixSize) ? matrixSize : undefined;
      if (ogImgW && ogImgH) {
        return {
          w: ogImgW,
          h: ogImgH,
          ...(size !== undefined ? { size } : {}),
          ...(previewBlurRaw ? { [MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME]: previewBlurRaw } : {}),
        };
      }
      if (previewBlurRaw || size !== undefined) {
        return {
          w: 16,
          h: 9,
          ...(size !== undefined ? { size } : {}),
          ...(previewBlurRaw ? { [MATRIX_UNSTABLE_BLUR_HASH_PROPERTY_NAME]: previewBlurRaw } : {}),
        };
      }
      return undefined;
    })();

    const previewThumbMaxEdge = Math.min(
      2048,
      Math.max(1, Math.round(Math.max(1, linkPreviewImageMaxHeight) * 2))
    );
    const showOgVideo = isLikelyPlayableOgVideo(prev);

    return (
      <Box
        grow="Yes"
        direction="Column"
        style={{
          overflow: 'hidden',
          width: '100%',
        }}
      >
        <UrlPreviewContent
          style={{
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <Text
            style={linkStyles}
            truncate
            as="a"
            href={url}
            target="_blank"
            rel="noreferrer"
            size="T200"
            priority="300"
          >
            {typeof siteName === 'string' && `${siteName} | `}
            {safeDecodeUrl(url)}
          </Text>
          {title && (
            <Text truncate priority="400">
              <b>{title}</b>
            </Text>
          )}
          {description && (
            <Text size="T200" priority="300">
              <UrlPreviewDescription>{description}</UrlPreviewDescription>
            </Text>
          )}
        </UrlPreviewContent>
        {showOgVideo && (
          <Box
            shrink="No"
            className={urlPreviewChrome.UrlPreviewMediaWell}
            style={{
              width: '100%',
              maxHeight: toRem(linkPreviewImageMaxHeight),
              aspectRatio: aspectRatio ?? '16 / 9',
              flexShrink: 1,
              minHeight: 0,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <VideoContent
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
              }}
              body={prev['og:title']}
              info={{}}
              url={(prev['og:video'] as string).trim()}
              mimeType={(prev['og:video:type'] as string) ?? ''}
              renderVideo={(vidProps) => (
                <Video
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  {...vidProps}
                />
              )}
              renderThumbnail={() => <Image src={imgUrl ?? undefined} />}
            />
          </Box>
        )}
        {!showOgVideo && prev['og:image'] && (
          <Box
            shrink="No"
            className={urlPreviewChrome.UrlPreviewMediaWell}
            style={{
              width: '100%',
              maxHeight: toRem(linkPreviewImageMaxHeight),
              aspectRatio: aspectRatio ?? '16 / 9',
              flexShrink: 1,
              minHeight: 0,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <ImageContent
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
              }}
              mediaLayout="contained"
              fillsPreviewSlot
              autoPlay
              onAuxClick={handleAuxClick}
              body={prev['og:title']}
              url={prev['og:image']}
              info={ogImageInfo}
              matrixThumbnailMaxEdge={previewThumbMaxEdge}
              renderViewer={(p) => <ImageViewer {...p} />}
              renderImage={(p) => (
                <Image
                  {...p}
                  style={{
                    display: 'block',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                    objectPosition: 'center',
                  }}
                />
              )}
            />
          </Box>
        )}
        {!showOgVideo && !prev['og:image'] && prev['og:audio'] && (
          <Box className={css.UrlPreviewAudio} style={{ flexShrink: 0 }}>
            <AudioContent
              url={(prev['og:audio'] as string) ?? ''}
              mimeType={(prev['og:audio:type'] as string) ?? ''}
              info={{}}
              renderMediaControl={(p) => <MediaControl {...p} />}
            />
          </Box>
        )}
      </Box>
    );
  };

  let previewContent;
  if (previewStatus.status === AsyncStatus.Success) {
    previewContent = previewStatus.data ? (
      renderContent(previewStatus.data)
    ) : (
      <UrlPreviewContent>
        <Text
          style={linkStyles}
          truncate
          as="a"
          href={url}
          target="_blank"
          rel="noreferrer"
          size="T200"
          priority="300"
        >
          {safeDecodeUrl(url)}
        </Text>
      </UrlPreviewContent>
    );
  } else {
    previewContent = (
      <Box grow="Yes" alignItems="Center" justifyContent="Center">
        <Spinner variant="Secondary" size="400" />
      </Box>
    );
  }
  return (
    <UrlPreview
      {...props}
      ref={ref}
      style={
        isDirect
          ? {
              background: 'transparent',
              border: 'none',
              padding: 0,
              boxShadow: 'none',
              display: 'inline-block',
              verticalAlign: 'middle',
              width: 'max-content',
              minWidth: 0,
              maxWidth: '100%',
              margin: 0,
              alignSelf: 'start',
            }
          : {
              alignSelf: 'start',
            }
      }
    >
      {previewContent}
    </UrlPreview>
  );
});

export const UrlPreviewHolder = as<'div'>(({ children, ...props }, ref) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerBoxRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const { scrollLeft, scrollWidth, clientWidth } = scroll;
    setCanScrollLeft(scrollLeft > 1);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return undefined;

    updateArrows();
    scroll.addEventListener('scroll', updateArrows, { passive: true });

    const resizeObserver = new ResizeObserver(updateArrows);
    resizeObserver.observe(scroll);
    if (innerBoxRef.current) resizeObserver.observe(innerBoxRef.current);

    return () => {
      scroll.removeEventListener('scroll', updateArrows);
      resizeObserver.disconnect();
    };
  }, [updateArrows]);

  const handleScrollBack = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const { offsetWidth, scrollLeft } = scroll;
    scroll.scrollTo({
      left: scrollLeft - offsetWidth / 1.3,
      behavior: 'smooth',
    });
  };
  const handleScrollFront = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const { offsetWidth, scrollLeft } = scroll;
    scroll.scrollTo({
      left: scrollLeft + offsetWidth / 1.3,
      behavior: 'smooth',
    });
  };

  return (
    <Box
      direction="Column"
      {...props}
      ref={ref}
      style={{ marginTop: config.space.S200, position: 'relative' }}
    >
      <Scroll ref={scrollRef} direction="Horizontal" size="0" visibility="Hover" hideTrack>
        <Box shrink="No" alignItems="Center">
          {canScrollLeft && (
            <>
              <div className={css.UrlPreviewHolderGradient({ position: 'Left' })} />
              <IconButton
                className={css.UrlPreviewHolderBtn({ position: 'Left' })}
                variant="Secondary"
                radii="Pill"
                size="300"
                outlined
                onClick={handleScrollBack}
              >
                <Icon size="300" src={Icons.ArrowLeft} />
              </IconButton>
            </>
          )}
          <Box
            ref={innerBoxRef}
            alignItems="Inherit"
            gap="200"
            style={{
              alignItems: 'baseline',
            }}
          >
            {children}
          </Box>
          {canScrollRight && (
            <>
              <div className={css.UrlPreviewHolderGradient({ position: 'Right' })} />
              <IconButton
                className={css.UrlPreviewHolderBtn({ position: 'Right' })}
                variant="Primary"
                radii="Pill"
                size="300"
                outlined
                onClick={handleScrollFront}
              >
                <Icon size="300" src={Icons.ArrowRight} />
              </IconButton>
            </>
          )}
        </Box>
      </Scroll>
    </Box>
  );
});
