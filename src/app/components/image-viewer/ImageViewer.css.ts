import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const ImageViewer = style([
  DefaultReset,
  {
    height: '100%',
  },
]);

export const ImageViewerHeader = style([
  DefaultReset,
  {
    paddingLeft: config.space.S200,
    paddingRight: config.space.S200,
    borderBottomWidth: config.borderWidth.B300,
    flexShrink: 0,
    gap: config.space.S200,
    flexWrap: 'wrap',
    justifyContent: 'center',
    height: 'auto',
    minHeight: config.space.S400,
    paddingTop: config.space.S100,
    paddingBottom: config.space.S100,
    '@media': {
      '(max-width: 600px)': {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1,
        borderBottomWidth: 0,
        color: '#fff',
        flexWrap: 'nowrap',
      },
    },
  },
]);

const scrimStops = (from: string) =>
  `linear-gradient(to ${from}, rgba(0,0,0,0.58) 0%, rgba(0,0,0,0.5) 22%, rgba(0,0,0,0.33) 46%, rgba(0,0,0,0.15) 72%, rgba(0,0,0,0) 100%)`;

export const ImageViewerMobileHeader = style({
  '::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: toRem(132),
    background: scrimStops('bottom'),
    pointerEvents: 'none',
    zIndex: -1,
  },
});

export const ImageViewerMobileControl = style({
  backgroundColor: 'transparent',
  color: '#fff',
  filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))',
  selectors: {
    '&&:hover, &&:focus-visible': {
      backgroundColor: 'rgba(255,255,255,0.1)',
    },
    '&&:active': {
      backgroundColor: 'rgba(255,255,255,0.16)',
    },
  },
});

export const ImageViewerMobileCaption = style({
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 1,
  padding: `${toRem(48)} ${config.space.S400} ${config.space.S400}`,
  background: scrimStops('top'),
  color: '#fff',
  pointerEvents: 'none',
  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
});

export const ImageViewerContent = style([
  DefaultReset,
  {
    position: 'relative',
    backgroundColor: color.Background.Container,
    color: color.Background.OnContainer,
    overflow: 'hidden',
  },
]);

export const ImageViewerContentMobile = style({
  backgroundColor: '#000',
  color: '#fff',
});

export const ImageViewerInput = style([
  DefaultReset,
  {
    all: 'unset',
    fieldSizing: 'content',
    textAlign: 'center',
    font: 'inherit',
    color: 'inherit',
  },
]);

export const ImageViewerImg = style([
  DefaultReset,
  {
    userSelect: 'none',
    touchAction: 'none',
    display: 'block',
    objectFit: 'contain',
    width: 'auto',
    height: 'auto',
    maxWidth: 'none',
    maxHeight: 'none',
    backgroundColor: color.Surface.Container,
    transition: 'transform 100ms linear',
    willChange: 'transform',
  },
]);

export const ImageViewerImgPixelated = style({
  imageRendering: 'pixelated',
  willChange: 'auto',
});

const mobileGalleryControl = {
  position: 'absolute' as const,
  top: '50%',
  zIndex: 1,
  transform: 'translateY(-50%)',
  backgroundColor: '#0009',
  color: '#fff',
};

export const ImageViewerPrevious = style({
  ...mobileGalleryControl,
  left: config.space.S100,
});

export const ImageViewerNext = style({
  ...mobileGalleryControl,
  right: config.space.S100,
});
