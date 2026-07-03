import { recipe } from '@vanilla-extract/recipes';
import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const GalleryHolder = style({
  marginTop: config.space.S200,
});

export const GalleryImageGrid = recipe({
  base: [
    DefaultReset,
    {
      display: 'grid',
      gap: '0.5rem',
      maxWidth: toRem(600),
      height: '100%',
      width: '100%',
      gridAutoColumns: toRem(100),
    },
  ],
  variants: {
    type: {
      ThreeItems: {
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: `repeat(2, ${toRem(200)})`,
      },
      ThreeByThree: {
        gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
      },
      TwoByTwo: {
        gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
      },
      OneByOne: {
        maxHeight: toRem(300),
        gridTemplateColumns: '1fr',
      },
    },
  },
});

export const GalleryItem = recipe({
  base: [
    DefaultReset,
    {
      borderRadius: config.radii.R300,
      minHeight: toRem(175),
      minWidth: toRem(175),
      width: '100%',
      height: '100%',
      aspectRatio: '1/1',
      selectors: {
        [`${GalleryImageGrid.classNames.variants.type.ThreeItems} &:nth-child(1)`]: {
          gridRow: 'span 2',
        },
      },
    },
  ],
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
