import { Children, useCallback, useEffect, useRef, useState } from 'react';
import type { MatrixClient } from '$types/matrix-sdk';
import type { IPreviewUrlResponse } from '$types/matrix-sdk';
import { Box, IconButton, Scroll, Text, as, color, config, toRem } from 'folds';
import { ArrowLeft, ArrowRight, sizedIcon } from '$components/icons/phosphor';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { mxcUrlToHttp, downloadMedia } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { safeDecodeUrl } from '$plugins/react-custom-html-parser';
import * as css from './UrlPreviewCard.css';
import * as urlPreviewChrome from './UrlPreview.css';
import { UrlPreview, UrlPreviewContent, UrlPreviewDescription } from './UrlPreview';
import { AudioContent, ImageContent, VideoContent } from '../message';
import { LinePlaceholder } from '../message/placeholder';
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
// Inner cache keyed by URL only (not ts) â€ Ethe same URL shows the same preview
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

// Settled outcomes are kept so a row scrolled back into view renders at its final size.
type SettledPreview = { data: IPreviewUrlResponse } | { failed: true };

const PREVIEW_RESULT_LIMIT = 500;
const previewResultCache = new WeakMap<MatrixClient, Map<string, SettledPreview>>();

const getResultCache = (mx: MatrixClient): Map<string, SettledPreview> => {
  let resultCache = previewResultCache.get(mx);
  if (!resultCache) {
    resultCache = new Map();
    previewResultCache.set(mx, resultCache);
  }
  return resultCache;
};

const rememberPreview = (mx: MatrixClient, url: string, settled: SettledPreview): void => {
  const resultCache = getResultCache(mx);
  resultCache.set(url, settled);
  const oldest = resultCache.keys().next();
  if (resultCache.size > PREVIEW_RESULT_LIMIT && !oldest.done) resultCache.delete(oldest.value);
};

const requestUrlPreview = (
  mx: MatrixClient,
  url: string,
  ts: number
): Promise<IPreviewUrlResponse | null> => {
  const remembered = getResultCache(mx).get(url);
  if (remembered) {
    return 'failed' in remembered
      ? Promise.reject(new Error('preview previously refused'))
      : Promise.resolve(remembered.data);
  }
  const clientCache = getClientCache(mx);
  const cached = clientCache.get(url);
  if (cached !== undefined) return cached;
  const previewResult = mx?.getUrlPreview(url, ts);
  if (!previewResult) return Promise.resolve(null);
  clientCache.set(url, previewResult);
  previewResult
    .then((data) => rememberPreview(mx, url, { data }))
    .catch(() => rememberPreview(mx, url, { failed: true }))
    .finally(() => clientCache.delete(url));
  return previewResult;
};

// A card whose result is already cached renders at its final height, so it never grows in place.
export const prefetchUrlPreview = (mx: MatrixClient, url: string, ts: number): Promise<void> => {
  if (getResultCache(mx).has(url) || getClientCache(mx).has(url)) return Promise.resolve();
  return requestUrlPreview(mx, url, ts).then(
    () => undefined,
    () => undefined
  );
};

const openMediaInNewTab = async (url: string | undefined) => {
  if (!url) {
    console.warn('Attempted to open an empty url');
    return;
  }
  const blob = await downloadMedia(url);
  const blobUrl = URL.createObjectURL(blob);
  const child = window.open(blobUrl, '_blank');
  if (!child) {
    URL.revokeObjectURL(blobUrl);
    return;
  }
  // Retain the URL until the tab closes since video playback can re-fetch it.
  const timer = window.setInterval(() => {
    if (child.closed) {
      window.clearInterval(timer);
      URL.revokeObjectURL(blobUrl);
    }
  }, 1000);
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
    bundle?: IPreviewUrlResponse;
  }
>(({ urlPreview, url, ts, bundle, ...props }, ref) => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [linkPreviewImageMaxHeight] = useSetting(settingsAtom, 'linkPreviewImageMaxHeight');
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');

  const settled = urlPreview && ts ? getResultCache(mx).get(url) : undefined;

  const [previewStatus, loadPreview] = useAsyncCallback(
    useCallback(() => {
      if (!ts && !bundle) return Promise.resolve(null);
      if (urlPreview && ts) return requestUrlPreview(mx, url, ts);
      return Promise.resolve(bundle);
    }, [ts, bundle, urlPreview, mx, url])
  );

  useEffect(() => {
    // A homeserver refusing to preview a URL is an ordinary answer and the card already
    // renders nothing on error, so the rejection must not reach the global handler.
    loadPreview().catch(() => undefined);
  }, [url, loadPreview]);

  const failed = previewStatus.status === AsyncStatus.Error || (settled && 'failed' in settled);

  // Holding space for a card that never arrives leaves a permanent hole in the message.
  if (failed) return null;

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
              autoPlay={mediaAutoLoad}
              onAuxClick={handleAuxClick}
              body={prev['og:title']}
              url={prev['og:image']}
              info={ogImageInfo}
              matrixThumbnailMaxEdge={previewThumbMaxEdge}
              renderViewer={(p) => <ImageViewer {...p} />}
              renderImage={(p) => (
                <Image
                  info={ogImageInfo}
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

  const resolved: IPreviewUrlResponse | null | undefined =
    settled && !('failed' in settled)
      ? settled.data
      : previewStatus.status === AsyncStatus.Success
        ? (previewStatus.data as IPreviewUrlResponse | null)
        : undefined;

  let previewContent;
  if (resolved !== undefined) {
    previewContent = resolved ? (
      renderContent(resolved)
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
    // Kept midway between a refused preview and a text card: whichever lands, the height
    // this was wrong by is as small as it can be.
    previewContent = (
      <Box grow="Yes" direction="Column" style={{ overflow: 'hidden', width: '100%' }}>
        <UrlPreviewContent style={{ minWidth: 0 }}>
          <LinePlaceholder style={{ maxWidth: toRem(160) }} />
          <LinePlaceholder style={{ maxWidth: toRem(240) }} />
        </UrlPreviewContent>
      </Box>
    );
  }
  return (
    <UrlPreview {...props} ref={ref} style={{ alignSelf: 'start' }}>
      {previewContent}
    </UrlPreview>
  );
});

export const UrlPreviewHolder = as<'div'>(({ children, ...props }, ref) => {
  // An empty holder still contributes its top margin, e.g. when every widget kind is disabled.
  const hasCard = Children.toArray(children).length > 0;
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

  if (!hasCard) return null;

  return (
    <Box
      direction="Column"
      {...props}
      ref={ref}
      style={{ marginTop: config.space.S200, position: 'relative' }}
    >
      <Scroll
        ref={scrollRef}
        direction="Horizontal"
        size="0"
        visibility="Hover"
        hideTrack
        data-gestures="scroll"
      >
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
                {sizedIcon(ArrowLeft, '300')}
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
                {sizedIcon(ArrowRight, '300')}
              </IconButton>
            </>
          )}
        </Box>
      </Scroll>
    </Box>
  );
});
