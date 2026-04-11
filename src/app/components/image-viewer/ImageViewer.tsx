import { useEffect, useState, useRef } from 'react';
import FileSaver from 'file-saver';
import classNames from 'classnames';
import { Box, Chip, Header, Icon, IconButton, Icons, Text, as } from 'folds';
import { useImageGestures } from '$hooks/useImageGestures';
import { downloadMedia } from '$utils/matrix';
import * as css from './ImageViewer.css';

export type ImageViewerProps = {
  alt: string;
  src: string;
  requestClose: () => void;
};

export const ImageViewer = as<'div', ImageViewerProps>(
  ({ className, alt, src, requestClose, ...props }, ref) => {
    const {
      transforms,
      cursor,
      handleWheel,
      onPointerDown,
      resetTransforms,
      zoomIn,
      zoomOut,
      setZoom,
    } = useImageGestures(true, 0.2);

    const [isImageReady, setIsImageReady] = useState(false);
    const [isEditingZoom, setIsEditingZoom] = useState(false);
    const [fitRatio, setFitRatio] = useState(1);
    const [zoomInput, setZoomInput] = useState('100');
    useEffect(() => {
      setFitRatio(1);
      setIsImageReady(false);
      setIsEditingZoom(false);
      setZoomInput('100');
    }, [src]);

    useEffect(() => {
      if (!isEditingZoom) {
        setZoomInput(Math.round(transforms.zoom * 100).toString());
      }
    }, [isEditingZoom, transforms.zoom]);

    const zoomInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
      if (isEditingZoom) {
        zoomInputRef.current?.focus();
      }
    }, [isEditingZoom]);

    const handleDownload = async () => {
      const fileContent = await downloadMedia(src);
      FileSaver.saveAs(fileContent, alt);
    };

    return (
      <Box
        className={classNames(css.ImageViewer, className)}
        direction="Column"
        {...props}
        ref={ref}
      >
        <Header className={css.ImageViewerHeader} size="400">
          <Box grow="Yes" alignItems="Center" gap="200">
            <IconButton size="300" radii="300" onClick={requestClose}>
              <Icon size="50" src={Icons.ArrowLeft} />
            </IconButton>
            <Text size="T300" truncate>
              {alt}
            </Text>
          </Box>
          <Box shrink="No" alignItems="Center" gap="200">
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
              onClick={() => {
                setZoom(1);
              }}
              aria-label="View Original Size"
            >
              <Icon size="50" src={Icons.Photo} />
            </IconButton>
            <IconButton
              variant="Surface"
              style={{
                // Only show when the image has had any transforms applied (zoom or pan)
                display:
                  transforms.zoom !== fitRatio || transforms.pan.x !== 0 || transforms.pan.y !== 0
                    ? 'flex'
                    : 'none',
              }}
              size="300"
              radii="Pill"
              onClick={() => {
                resetTransforms();
                setZoom(fitRatio);
              }}
              aria-label="Reset Zoom"
            >
              <Icon size="50" src={Icons.Reload} />
            </IconButton>
            <IconButton
              variant={transforms.zoom < 1 ? 'Success' : 'SurfaceVariant'}
              outlined={transforms.zoom < 1}
              size="300"
              radii="Pill"
              onClick={zoomOut}
              aria-label="Zoom Out"
            >
              <Icon size="50" src={Icons.Minus} />
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
              onClick={() => {
                setZoomInput(Math.round(transforms.zoom * 100).toString());
                setIsEditingZoom(true);
              }}
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
              onClick={zoomIn}
              aria-label="Zoom In"
            >
              <Icon size="50" src={Icons.Plus} />
            </IconButton>
            <Chip
              variant="Primary"
              onClick={handleDownload}
              radii="300"
              before={<Icon size="50" src={Icons.Download} />}
            >
              <Text size="B300">Download</Text>
            </Chip>
          </Box>
        </Header>
        <Box
          grow="Yes"
          onWheel={handleWheel}
          className={css.ImageViewerContent}
          data-gestures="ignore"
          justifyContent="Center"
          alignItems="Center"
          style={{ overflow: 'hidden', touchAction: 'none' }}
        >
          <img
            className={css.ImageViewerImg}
            draggable={false}
            data-gestures="ignore"
            style={{
              cursor,
              opacity: isImageReady ? 1 : 0, // Hide image until fit to container
              transform: `translate(${transforms.pan.x}px, ${transforms.pan.y}px) scale(${transforms.zoom})`,
            }}
            src={src}
            alt={alt}
            onPointerDown={(event: React.PointerEvent<HTMLImageElement>) => {
              // Disable transition while dragging the image

              // Note: This disables the smooth zooming when scrolling while dragging
              // or when double-clicking to zoom
              const img = event.currentTarget;
              img.style.transition = 'none';
              onPointerDown(event);
            }}
            onPointerUp={(event: React.PointerEvent<HTMLImageElement>) => {
              // Re-enable transition after dragging
              const img = event.currentTarget;
              img.style.transition = '';
            }}
            onLoad={(event: React.SyntheticEvent<HTMLImageElement>) => {
              // Fit the image to the container on load
              const img = event.currentTarget;

              img.style.transition = 'none';

              const container = img.parentElement;
              if (!container) return;

              const imgHeight = img.naturalHeight;
              const imgWidth = img.naturalWidth;
              const containerHeight = container.clientHeight || 0;
              const containerWidth = container.clientWidth || 0;

              const heightRatio = containerHeight / imgHeight;
              const widthRatio = containerWidth / imgWidth;
              const fitZoom = Math.min(heightRatio, widthRatio, 1);

              setFitRatio(fitZoom);
              setZoom(fitZoom);
              setIsImageReady(true);

              // This should be enough time for the browser to apply the transform
              // without the transition, so we can re-enable it for future interactions
              setTimeout(() => {
                img.style.transition = '';
              }, 15);
            }}
          />
        </Box>
      </Box>
    );
  }
);
