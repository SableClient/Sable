import { recipe } from '@vanilla-extract/recipes';
import { DefaultReset, config, toRem } from 'folds';

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
        gridTemplateRows: `repeat(2, 1fr)`,
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
      overflow: 'hidden',
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
