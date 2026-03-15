import { useCallback, useEffect, useRef, useState } from 'react';
import { IPreviewUrlResponse } from '$types/matrix-sdk';
import { Box, Icon, IconButton, Icons, Scroll, Spinner, Text, as, color, config } from 'folds';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import {
  getIntersectionObserverEntry,
  useIntersectionObserver,
} from '$hooks/useIntersectionObserver';
import { mxcUrlToHttp, downloadMedia } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import * as css from './UrlPreviewCard.css';
import { UrlPreview, UrlPreviewContent, UrlPreviewDescription } from './UrlPreview';
import { AudioContent, ImageContent, VideoContent } from '../message';
import { Image, MediaControl, Video } from '../media';
import { ImageViewer } from '../image-viewer';

const linkStyles = { color: color.Success.Main };

const openMediaInNewTab = async (url: string | undefined) => {
  if (!url) {
    console.warn('Attempted to open an empty url');
    return;
  }
  const blob = await downloadMedia(url);
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank');
};

export const UrlPreviewCard = as<'div', { url: string; ts: number; mediaType?: string | null }>(
  ({ url, ts, mediaType, ...props }, ref) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();

    const isDirect = !!mediaType;

    const [previewStatus, loadPreview] = useAsyncCallback(
      useCallback(() => {
        if (isDirect) return Promise.resolve(null);
        return mx.getUrlPreview(url, ts);
      }, [url, ts, mx, isDirect])
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
              {decodeURIComponent(url)}
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
          {prev['og:video'] && (
            <VideoContent
              style={{
                width: '100%',
                aspectRatio:
                  ((prev['og:video:width'] as number) ?? 1) /
                  ((prev['og:video:height'] as number) ?? 1),
              }}
              body={prev['og:title']}
              info={{}}
              url={prev['og:video'] as string}
              mimeType={(prev['og:video:type'] as string) ?? ''}
              renderVideo={(vidProps) => <Video style={{ objectFit: 'contain' }} {...vidProps} />}
              renderThumbnail={() => <Image src={imgUrl ?? undefined} />}
            />
          )}
          {!prev['og:video'] &&
            prev['og:image'] &&
            (() => {
              const ogW = prev['og:image:width'];
              const ogH = prev['og:image:height'];
              const aspectRatio = ogW && ogH ? `${ogW} / ${ogH}` : undefined;
              return (
                <Box
                  style={{
                    width: '100%',
                    maxHeight: '400px',
                    aspectRatio: aspectRatio ?? '16 / 9',
                    flexShrink: 0,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <ImageContent
                    style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
                    autoPlay
                    onAuxClick={handleAuxClick}
                    body={prev['og:title']}
                    url={prev['og:image']}
                    renderViewer={(p) => <ImageViewer {...p} />}
                    renderImage={(p) => (
                      <Image
                        {...p}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          objectPosition: 'center',
                        }}
                      />
                    )}
                  />
                </Box>
              );
            })()}
          {!prev['og:video'] && !prev['og:image'] && prev['og:audio'] && (
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
            {decodeURIComponent(url)}
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
              }
            : undefined
        }
      >
        {previewContent}
      </UrlPreview>
    );
  }
);

export const UrlPreviewHolder = as<'div'>(({ children, ...props }, ref) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const backAnchorRef = useRef<HTMLDivElement>(null);
  const frontAnchorRef = useRef<HTMLDivElement>(null);
  const [backVisible, setBackVisible] = useState(true);
  const [frontVisible, setFrontVisible] = useState(true);

  const intersectionObserver = useIntersectionObserver(
    useCallback((entries) => {
      const backAnchor = backAnchorRef.current;
      const frontAnchor = frontAnchorRef.current;
      const backEntry = backAnchor && getIntersectionObserverEntry(backAnchor, entries);
      const frontEntry = frontAnchor && getIntersectionObserverEntry(frontAnchor, entries);
      if (backEntry) {
        setBackVisible(backEntry.isIntersecting);
      }
      if (frontEntry) {
        setFrontVisible(frontEntry.isIntersecting);
      }
    }, []),
    useCallback(
      () => ({
        root: scrollRef.current,
        rootMargin: '10px',
      }),
      []
    )
  );

  useEffect(() => {
    const backAnchor = backAnchorRef.current;
    const frontAnchor = frontAnchorRef.current;
    if (backAnchor) intersectionObserver?.observe(backAnchor);
    if (frontAnchor) intersectionObserver?.observe(frontAnchor);
    return () => {
      if (backAnchor) intersectionObserver?.unobserve(backAnchor);
      if (frontAnchor) intersectionObserver?.unobserve(frontAnchor);
    };
  }, [intersectionObserver]);

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
          <div ref={backAnchorRef} />
          {!backVisible && (
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
          <Box alignItems="Inherit" gap="200">
            {children}

            {!frontVisible && (
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
            <div ref={frontAnchorRef} />
          </Box>
        </Box>
      </Scroll>
    </Box>
  );
});
