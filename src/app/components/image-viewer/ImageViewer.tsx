import type { MouseEventHandler } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import {
  Box,
  Chip,
  Header,
  IconButton,
  Menu,
  MenuItem,
  Text,
  as,
  config,
  toRem,
  type RectCords,
} from 'folds';
import {
  ArrowLeft,
  CaretLeft,
  CaretRight,
  ArrowsClockwise,
  Download,
  DownloadSimple,
  DotsThree,
  Image,
  Minus,
  Plus,
  ShareNetwork,
  menuIcon,
  phosphorSizeRem,
  sizedIcon,
} from '$components/icons/phosphor';
import { Image as MediaImage } from '$components/media';
import { useImageGestures } from '$hooks/useImageGestures';
import { useMenuAnchor } from '$hooks/useMenuAnchor';
import { useDismissOnBack } from '$utils/androidBack';
import { useSetting } from '$state/hooks/settings';
import { isPixelatedRendering, settingsAtom } from '$state/settings';
import { showToast } from '$state/toast';
import { downloadMedia } from '$utils/matrix';
import * as css from './ImageViewer.css';
import type { IImageInfo } from '$types/matrix/common';
import { CheckerboardIcon, CopyIcon, ImagesIcon } from '@phosphor-icons/react';
import { copyImageToClipboard } from '$utils/dom';
import {
  getDownloadFilename,
  reportDownloadFailure,
  saveFileToDevice,
  saveMediaToGallery,
} from '$utils/download';
import { ResponsiveMenu } from '$components/ResponsiveMenu';
import { isAndroidTauri, iosApp } from '$utils/platform';
import { setImmersiveMode } from '$generated/tauri/commands';
import { ScreenSize, useScreenSizeOptionally } from '$hooks/useScreenSize';
import { useMobileTapActivation } from '$hooks/useMobileTapActivation';

type ImageViewerProps = {
  alt: string;
  filename?: string;
  src: string;
  requestClose: () => void;
  info?: IImageInfo;
  sender?: string;
  sentAt?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  getDownloadBlob?: () => Promise<Blob>;
};

export const ImageViewer = as<'div', ImageViewerProps>(
  (
    {
      className,
      alt,
      filename,
      src,
      requestClose,
      info,
      sender,
      sentAt,
      onPrevious,
      onNext,
      getDownloadBlob,
      ...props
    },
    ref
  ) => {
    const zoomInputRef = useRef<HTMLInputElement>(null);
    const [pixelatedImageRendering] = useSetting(settingsAtom, 'pixelatedImageRendering');
    const isMobile = useScreenSizeOptionally() === ScreenSize.Mobile;

    useEffect(() => {
      if (!isMobile || !isAndroidTauri()) return undefined;
      void setImmersiveMode({ enabled: true });
      return () => {
        void setImmersiveMode({ enabled: false });
      };
    }, [isMobile]);

    // Android back closes the viewer instead of navigating away.
    useDismissOnBack(requestClose);

    const [isImageReady, setIsImageReady] = useState(false);
    const [isEditingZoom, setIsEditingZoom] = useState(false);
    const [zoomInput, setZoomInput] = useState('100');
    const [isPixelated, setIsPixelated] = useState(
      isPixelatedRendering(pixelatedImageRendering, info)
    );

    const {
      transforms,
      cursor,
      handleWheel,
      onPointerDown,
      resetTransforms,
      zoomIn,
      zoomOut,
      setZoom,
      fitRatio,
      imageRef,
      containerRef,
      handleImageLoad,
      handleImageDimensions,
      enableResizeWithWindow,
    } = useImageGestures(
      true,
      0.2,
      0.1,
      500,
      isMobile ? { onDismiss: requestClose, onPrevious, onNext } : undefined
    );
    useEffect(() => {
      setIsImageReady(false);
      enableResizeWithWindow();
      setIsEditingZoom(false);
      setZoomInput('100');
      resetTransforms();
      if (imageRef.current) {
        imageRef.current = null;
      }
    }, [src, enableResizeWithWindow, imageRef, resetTransforms]);

    // When not actively editing the zoom input, keep it in sync with the current zoom level.
    useEffect(() => {
      if (!isEditingZoom) {
        setZoomInput(Math.round(transforms.zoom * 100).toString());
      }
    }, [isEditingZoom, transforms.zoom]);

    // When entering zoom edit mode, focus the input automatically.
    useEffect(() => {
      if (isEditingZoom) {
        zoomInputRef.current?.focus();
      }
    }, [isEditingZoom]);

    const galleryMimeType = info?.mimetype?.toLowerCase();
    // On iOS the primary action saves trusted images straight to Photos (PhotoKit).
    const iosSaveToPhotos = iosApp() && (galleryMimeType?.startsWith('image/') ?? false);
    const downloadFilename = getDownloadFilename(filename, alt, 'image', galleryMimeType);
    const canSaveToGallery = isAndroidTauri() && (galleryMimeType?.startsWith('image/') ?? false);

    const loadDownloadBlob = () => (getDownloadBlob ? getDownloadBlob() : downloadMedia(src));

    const saveToGallery = async () => {
      try {
        await saveMediaToGallery(await loadDownloadBlob(), downloadFilename, galleryMimeType!);
      } catch (error) {
        reportDownloadFailure(error, 'fetch', downloadFilename, galleryMimeType);
        const message = error instanceof Error ? error.message : 'unknown error';
        showToast(`Failed to save to gallery: ${message}`);
      }
    };

    const handleDownload = async () => {
      if (iosSaveToPhotos) {
        await saveToGallery();
        return;
      }
      let fileContent: Blob;
      try {
        fileContent = await loadDownloadBlob();
      } catch (error) {
        reportDownloadFailure(error, 'fetch', downloadFilename, galleryMimeType);
        const message = error instanceof Error ? error.message : 'unknown error';
        showToast(`Failed to download file: ${message}`);
        return;
      }
      await saveFileToDevice(
        fileContent,
        getDownloadFilename(filename, alt, 'image', fileContent.type),
        galleryMimeType || fileContent.type || undefined
      );
    };

    const menu = useMenuAnchor<HTMLElement>();
    const [mobileMenuAnchor, setMobileMenuAnchor] = useState<RectCords>();
    const closeMenu = useCallback(() => {
      menu.close();
      setMobileMenuAnchor(undefined);
    }, [menu]);

    const closeActivation = useMobileTapActivation(isMobile, requestClose);
    const menuActivation = useMobileTapActivation(isMobile, (evt) => {
      if (isMobile) {
        const rect = evt.currentTarget.getBoundingClientRect();
        setMobileMenuAnchor({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      } else menu.openAt(evt.currentTarget);
    });
    const pixelatedActivation = useMobileTapActivation(isMobile, () =>
      setIsPixelated(!isPixelated)
    );
    const originalSizeActivation = useMobileTapActivation(isMobile, () => setZoom(1));
    const resetZoomActivation = useMobileTapActivation(isMobile, () => {
      resetTransforms();
      enableResizeWithWindow();
      setZoom(fitRatio);
    });
    const zoomOutActivation = useMobileTapActivation(isMobile, zoomOut);
    const zoomInputActivation = useMobileTapActivation(isMobile, () => {
      setZoomInput(Math.round(transforms.zoom * 100).toString());
      setIsEditingZoom(true);
    });
    const zoomInActivation = useMobileTapActivation(isMobile, zoomIn);
    const downloadActivation = useMobileTapActivation(isMobile, () => {
      void handleDownload();
    });
    const canShare = isMobile && typeof navigator.share === 'function';
    const shareActivation = useMobileTapActivation(isMobile, () => {
      void (async () => {
        try {
          const blob = await loadDownloadBlob();
          const file = new File([blob], downloadFilename, {
            type: blob.type || galleryMimeType || 'application/octet-stream',
          });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: filename ?? alt });
            return;
          }
          await navigator.share({ title: filename ?? alt, text: filename ?? alt });
        } catch {}
      })();
    });
    const copyImageActivation = useMobileTapActivation(isMobile, () => {
      closeMenu();
      void loadDownloadBlob().then(copyImageToClipboard);
    });
    const pixelatedMenuActivation = useMobileTapActivation(isMobile, () => {
      setIsPixelated(!isPixelated);
      closeMenu();
    });
    const originalSizeMenuActivation = useMobileTapActivation(isMobile, () => {
      setZoom(1);
      closeMenu();
    });
    const previousActivation = useMobileTapActivation(isMobile, () => onPrevious?.());
    const nextActivation = useMobileTapActivation(isMobile, () => onNext?.());
    const galleryActivation = useMobileTapActivation(isMobile, () => {
      closeMenu();
      void saveToGallery();
    });
    const resetZoomMenuActivation = useMobileTapActivation(isMobile, () => {
      resetTransforms();
      enableResizeWithWindow();
      setZoom(fitRatio);
      closeMenu();
    });

    const handleContextMenu: MouseEventHandler<HTMLDivElement> = (evt) => {
      if (evt.altKey || !window.getSelection()?.isCollapsed) return;
      const tag = (evt.target as HTMLElement).tagName;
      if (typeof tag === 'string' && tag.toLowerCase() === 'a') return;
      menu.triggerProps.onContextMenu(evt);
    };

    return (
      <>
        <ResponsiveMenu
          anchor={isMobile ? mobileMenuAnchor : menu.anchor}
          requestClose={closeMenu}
          align="Start"
          offset={0}
          mobile="inline-dialog"
          menu={
            <Menu
              variant="Surface"
              data-gestures="ignore"
              style={{
                maxWidth: toRem(160),
                width: isMobile ? 'auto' : '100vw',
                paddingTop: isMobile ? '0.5rem' : undefined,
              }}
            >
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                {isMobile && (
                  <MenuItem
                    as="button"
                    radii="300"
                    size="300"
                    after={
                      <CheckerboardIcon
                        size={phosphorSizeRem(20)}
                        weight={isPixelated ? 'duotone' : 'fill'}
                      />
                    }
                    {...pixelatedMenuActivation}
                  >
                    <Text size="T300" style={{ flexGrow: 1 }}>
                      {isPixelated ? 'Turn anti-aliasing on' : 'Turn pixelation on'}
                    </Text>
                  </MenuItem>
                )}
                {isMobile && fitRatio !== 1 && transforms.zoom !== 1 && (
                  <MenuItem
                    as="button"
                    radii="300"
                    size="300"
                    after={sizedIcon(Image, '200')}
                    {...originalSizeMenuActivation}
                  >
                    <Text size="T300" style={{ flexGrow: 1 }}>
                      View original size
                    </Text>
                  </MenuItem>
                )}
                {isMobile &&
                  (transforms.zoom !== fitRatio ||
                    transforms.pan.x !== 0 ||
                    transforms.pan.y !== 0) && (
                    <MenuItem
                      as="button"
                      radii="300"
                      size="300"
                      after={sizedIcon(ArrowsClockwise, '200')}
                      {...resetZoomMenuActivation}
                    >
                      <Text size="T300" style={{ flexGrow: 1 }}>
                        Reset zoom
                      </Text>
                    </MenuItem>
                  )}
                <MenuItem
                  as="button"
                  radii="300"
                  size="300"
                  after={menuIcon(CopyIcon)}
                  {...copyImageActivation}
                >
                  <Text size="T300" style={{ flexGrow: 1 }}>
                    Copy Image
                  </Text>
                </MenuItem>
                {canSaveToGallery && (
                  <MenuItem
                    as="button"
                    radii="300"
                    size="300"
                    after={menuIcon(ImagesIcon)}
                    {...galleryActivation}
                  >
                    <Text size="T300" style={{ flexGrow: 1 }}>
                      Save to Gallery
                    </Text>
                  </MenuItem>
                )}
              </Box>
            </Menu>
          }
        />
        <Box
          className={classNames(css.ImageViewer, className)}
          direction="Column"
          data-gestures="ignore"
          {...props}
          ref={ref}
        >
          <Header
            className={classNames(css.ImageViewerHeader, isMobile && css.ImageViewerMobileHeader)}
            size="400"
            style={
              isMobile
                ? {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 1,
                    minHeight: `calc(64px + ${css.safeAreaTop})`,
                    paddingTop: `calc(${config.space.S200} + ${css.safeAreaTop})`,
                    paddingBottom: config.space.S200,
                    paddingLeft: `calc(${config.space.S200} + ${css.safeAreaLeft})`,
                    paddingRight: `calc(${config.space.S200} + ${css.safeAreaRight})`,
                    borderBottomWidth: 0,
                    color: '#fff',
                    flexWrap: 'nowrap',
                  }
                : undefined
            }
          >
            {isMobile ? (
              <>
                <Box grow="Yes" basis="No" alignItems="Center" gap="100">
                  <IconButton
                    className={css.ImageViewerMobileControl}
                    fill="None"
                    aria-label="Close"
                    size="500"
                    radii="300"
                    style={{ flexShrink: 0 }}
                    {...closeActivation}
                  >
                    {sizedIcon(ArrowLeft, '300')}
                  </IconButton>
                  <Box direction="Column">
                    <Text size="T300" truncate style={{ fontWeight: config.fontWeight.W600 }}>
                      {sender ?? alt}
                    </Text>
                    {sentAt && (
                      <Text size="T200" truncate style={{ opacity: 0.66 }}>
                        {sentAt}
                      </Text>
                    )}
                  </Box>
                </Box>
                <Box shrink="No" alignItems="Center">
                  {canShare && (
                    <IconButton
                      className={css.ImageViewerMobileControl}
                      fill="None"
                      aria-label="Share"
                      size="500"
                      radii="300"
                      {...shareActivation}
                    >
                      {sizedIcon(ShareNetwork, '300')}
                    </IconButton>
                  )}
                  <IconButton
                    className={css.ImageViewerMobileControl}
                    fill="None"
                    aria-label={iosSaveToPhotos ? 'Save to Photos' : 'Download'}
                    size="500"
                    radii="300"
                    {...downloadActivation}
                  >
                    {sizedIcon(DownloadSimple, '300')}
                  </IconButton>
                  <IconButton
                    className={css.ImageViewerMobileControl}
                    fill="None"
                    aria-label="More options"
                    size="500"
                    radii="300"
                    {...menuActivation}
                  >
                    {sizedIcon(DotsThree, '300')}
                  </IconButton>
                </Box>
              </>
            ) : (
              <>
                <Box grow="Yes" alignItems="Center" gap="200">
                  <IconButton size="300" radii="300" {...closeActivation}>
                    {sizedIcon(ArrowLeft, '200')}
                  </IconButton>
                  <Text size="T300" truncate>
                    {alt}
                  </Text>
                </Box>
                <Box shrink="No" alignItems="Center" gap="200">
                  <IconButton
                    variant="Surface"
                    size="300"
                    radii="Pill"
                    {...pixelatedActivation}
                    aria-label="Toggle Pixelation"
                    title={`Turn ${isPixelated ? 'Anti-aliasing' : 'Pixelation'} on`}
                  >
                    <CheckerboardIcon
                      size={phosphorSizeRem(20)}
                      weight={isPixelated ? 'duotone' : 'fill'}
                    />
                  </IconButton>
                  <IconButton
                    variant="Surface"
                    style={{
                      // Only show when the image isn't already larger than the container
                      // and isn't already at 100% zoom
                      // (Otherwise, the Reset Zoom button does the same thing)
                      display: fitRatio !== 1 && transforms.zoom !== 1 ? 'flex' : 'none',
                    }}
                    size="300"
                    radii="Pill"
                    {...originalSizeActivation}
                    aria-label="View Original Size"
                    title="View Original Size"
                  >
                    {sizedIcon(Image, '200')}
                  </IconButton>
                  <IconButton
                    variant="Surface"
                    style={{
                      // Only show when the image has had any transforms applied (zoom or pan)
                      display:
                        transforms.zoom !== fitRatio ||
                        transforms.pan.x !== 0 ||
                        transforms.pan.y !== 0
                          ? 'flex'
                          : 'none',
                    }}
                    size="300"
                    radii="Pill"
                    {...resetZoomActivation}
                    aria-label="Reset Zoom"
                    title="Zoom to Fill Container"
                  >
                    {sizedIcon(ArrowsClockwise, '200')}
                  </IconButton>
                  <IconButton
                    variant={transforms.zoom < 1 ? 'Success' : 'SurfaceVariant'}
                    outlined={transforms.zoom < 1}
                    size="300"
                    radii="Pill"
                    {...zoomOutActivation}
                    aria-label="Zoom Out"
                    title="Zoom Out"
                  >
                    {sizedIcon(Minus, '50')}
                  </IconButton>
                  <Chip
                    variant="SurfaceVariant"
                    radii="Pill"
                    style={{
                      // For zoom levels below 100%, keep the pill at the same size as it would be at 100% zoom.
                      // This prevents the Zoom Out button from moving from the pill changing size.
                      // 4em should be generous enough to fit without manually determining the width of the text.
                      minWidth: '4em',
                    }}
                    {...zoomInputActivation}
                    title="Update Zoom"
                  >
                    <Text
                      size="B300"
                      style={{
                        cursor: 'text',
                        margin: 'auto',
                      }}
                    >
                      {isEditingZoom ? (
                        <span>
                          <input
                            className={css.ImageViewerInput}
                            ref={zoomInputRef}
                            type="text"
                            aria-label="Set Zoom Level"
                            value={zoomInput}
                            onChange={(e) => {
                              setZoomInput(e.target.value);
                            }}
                            onBlur={() => {
                              const next = parseInt(zoomInput, 10);
                              if (!Number.isNaN(next)) {
                                setZoom(next / 100);
                              }
                              setIsEditingZoom(false);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const next = parseInt(zoomInput, 10);
                                if (!Number.isNaN(next)) {
                                  setZoom(next / 100);
                                }
                                setIsEditingZoom(false);
                              }
                            }}
                          />
                          <span>%</span>
                        </span>
                      ) : (
                        `${Math.round(transforms.zoom * 100)}%`
                      )}
                    </Text>
                  </Chip>
                  <IconButton
                    variant={transforms.zoom > 1 ? 'Success' : 'SurfaceVariant'}
                    outlined={transforms.zoom > 1}
                    size="300"
                    radii="Pill"
                    {...zoomInActivation}
                    aria-label="Zoom In"
                    title="Zoom In"
                  >
                    {sizedIcon(Plus, '50')}
                  </IconButton>
                  <Chip
                    variant="Primary"
                    {...downloadActivation}
                    radii="300"
                    before={sizedIcon(Download, '50')}
                    outlined
                  >
                    <Text size="B300">{iosSaveToPhotos ? 'Save to Photos' : 'Download'}</Text>
                  </Chip>
                </Box>
              </>
            )}
          </Header>
          <Box
            grow="Yes"
            ref={containerRef}
            onWheel={handleWheel}
            className={classNames(css.ImageViewerContent, isMobile && css.ImageViewerContentMobile)}
            data-gestures="ignore"
            justifyContent="Center"
            alignItems="Center"
            style={{ overflow: 'hidden', touchAction: 'none', cursor }}
            onPointerDown={onPointerDown}
            onContextMenu={handleContextMenu}
            onTouchStart={menu.triggerProps.onTouchStart}
            onTouchEnd={menu.triggerProps.onTouchEnd}
            onTouchMove={menu.triggerProps.onTouchMove}
            onTouchCancel={menu.triggerProps.onTouchCancel}
          >
            {isMobile && onPrevious && (
              <IconButton
                className={css.ImageViewerPrevious}
                aria-label="Previous image"
                size="400"
                radii="300"
                {...previousActivation}
              >
                {sizedIcon(CaretLeft, '200')}
              </IconButton>
            )}
            {isMobile && onNext && (
              <IconButton
                className={css.ImageViewerNext}
                aria-label="Next image"
                size="400"
                radii="300"
                {...nextActivation}
              >
                {sizedIcon(CaretRight, '200')}
              </IconButton>
            )}
            <MediaImage
              ref={imageRef}
              className={classNames(css.ImageViewerImg, isPixelated && css.ImageViewerImgPixelated)}
              draggable={false}
              data-gestures="ignore"
              style={{
                cursor,
                opacity: isImageReady ? 1 : 0, // Hide image until fit to container
                transform: `translate(${transforms.pan.x}px, ${transforms.pan.y}px) scale(${transforms.zoom})`,
              }}
              src={src}
              alt={alt}
              info={info}
              pixelated={isPixelated}
              onPointerDown={onPointerDown}
              onLoad={(event: React.SyntheticEvent<HTMLImageElement>) => {
                handleImageLoad(event);
                setIsImageReady(true);
              }}
              onLottieLoad={(canvas) => {
                handleImageDimensions(
                  info?.w ?? canvas?.width ?? 0,
                  info?.h ?? canvas?.height ?? 0
                );
                setIsImageReady(true);
              }}
            />
            {isMobile && sender && alt && (
              <Text className={css.ImageViewerMobileCaption} size="T200">
                {alt}
              </Text>
            )}
          </Box>
        </Box>
      </>
    );
  }
);
