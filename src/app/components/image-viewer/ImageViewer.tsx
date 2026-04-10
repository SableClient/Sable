import { useEffect, useState } from 'react';
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
    useEffect(() => {
      setIsImageReady(false);
    }, [src]);

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
              variant={transforms.zoom < 1 ? 'Success' : 'SurfaceVariant'}
              outlined={transforms.zoom < 1}
              size="300"
              radii="Pill"
              onClick={zoomOut}
              aria-label="Zoom Out"
            >
              <Icon size="50" src={Icons.Minus} />
            </IconButton>
            <Chip variant="SurfaceVariant" radii="Pill" onClick={resetTransforms}>
              <Text size="B300">{Math.round(transforms.zoom * 100)}%</Text>
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
