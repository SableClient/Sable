import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

// The viewer is a fullscreen overlay, so it sits outside the app shell's safe-area strips.
export const safeAreaTop = 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))';
const safeAreaBottom = 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))';
export const safeAreaLeft = 'var(--safe-area-inset-left, env(safe-area-inset-left, 0px))';
export const safeAreaRight = 'var(--safe-area-inset-right, env(safe-area-inset-right, 0px))';

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
        paddingLeft: `calc(${config.space.S200} + ${safeAreaLeft})`,
        paddingRight: `calc(${config.space.S200} + ${safeAreaRight})`,
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
    height: `calc(${toRem(132)} + ${safeAreaTop})`,
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
  paddingTop: toRem(48),
  paddingLeft: `calc(${config.space.S400} + ${safeAreaLeft})`,
  paddingRight: `calc(${config.space.S400} + ${safeAreaRight})`,
  paddingBottom: `calc(${config.space.S400} + ${safeAreaBottom})`,
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
  paddingBottom: safeAreaBottom,
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
  },
]);

export const ImageViewerImgPixelated = style({
  imageRendering: 'pixelated',
});

const mobileGalleryControl = {
  position: 'absolute' as const,
  top: '50%',
  zIndex: 1,
  transform: 'translateY(-50%)',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  color: '#fff',
  transition: 'background-color 150ms ease, opacity 150ms ease',
};

// Desktop hides the chevrons until the cursor is over the viewer; keyboard
// users can still tab to them, which reveals them again.
export const ImageViewerControlsHidden = style({
  opacity: 0,
  pointerEvents: 'none',
  selectors: {
    '&:focus-visible': {
      opacity: 1,
      pointerEvents: 'auto',
    },
  },
});

// The global `button:hover` lift would replace the -50% centering transform and
// bounce the hitbox under the cursor, so re-assert it here and only fade color.
const galleryControlStates = {
  selectors: {
    '&:hover': {
      transform: 'translateY(-50%)',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
    },
    '&:focus-visible': {
      transform: 'translateY(-50%)',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
    },
    '&:active': {
      transform: 'translateY(-50%)',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
    },
  },
};

export const ImageViewerPrevious = style({
  ...mobileGalleryControl,
  ...galleryControlStates,
  left: `calc(${config.space.S100} + ${safeAreaLeft})`,
});

export const ImageViewerNext = style({
  ...mobileGalleryControl,
  ...galleryControlStates,
  right: `calc(${config.space.S100} + ${safeAreaRight})`,
});

// Dimmed rest state for the button whose direction wraps around the bundle end.
export const ImageViewerEdge = style({
  backgroundColor: 'rgba(0, 0, 0, 0.2)',
});
