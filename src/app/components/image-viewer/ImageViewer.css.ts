import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config } from 'folds';

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
  },
]);

export const ImageViewerContent = style([
  DefaultReset,
  {
    backgroundColor: color.Background.Container,
    color: color.Background.OnContainer,
    overflow: 'hidden',
  },
]);

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
    imageRendering: 'pixelated', // Possibly allow for a custom setting later?
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
