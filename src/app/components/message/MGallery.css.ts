import { recipe } from '@vanilla-extract/recipes';
import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const GalleryHolder = style({
  position: 'relative',
  marginTop: config.space.S200,
});

export const GalleryItem = recipe({
  base: [
    DefaultReset,
    {
      maxWidth: toRem(450),
      flexShrink: 0,
      overflow: 'hidden',
      borderRadius: config.radii.R300,
    },
  ],
  variants: {
    isImage: {
      true: {
        height: toRem(300),
      },
      false: {
        maxHeight: toRem(300),
      },
    },
  },
});

export const GalleryHolderGradient = recipe({
  base: [
    DefaultReset,
    {
      position: 'absolute',
      height: '100%',
      width: toRem(10),
      zIndex: 1,
    },
  ],
  variants: {
    position: {
      Left: {
        left: 0,
        background: `linear-gradient(to right,${color.Surface.Container} , rgba(116,116,116,0))`,
      },
      Right: {
        right: 0,
        background: `linear-gradient(to left,${color.Surface.Container} , rgba(116,116,116,0))`,
      },
    },
  },
});

export const GalleryHolderBtn = recipe({
  base: [
    DefaultReset,
    {
      position: 'absolute',
      zIndex: 1,
    },
  ],
  variants: {
    position: {
      Left: {
        left: 0,
        transform: 'translateX(-25%)',
      },
      Right: {
        right: 0,
        transform: 'translateX(25%)',
      },
    },
  },
});
