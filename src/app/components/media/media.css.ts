import { style } from '@vanilla-extract/css';
import { DefaultReset } from 'folds';

export const Image = style([
  DefaultReset,
  {
    objectFit: 'cover',
    width: '100%',
    height: '100%',
  },
]);

export const ImagePixelated = style({
  imageRendering: 'pixelated',
});

export const Video = style([
  DefaultReset,
  {
    position: 'relative',
    objectFit: 'contain',
    width: '100%',
    height: '100%',
  },
]);
