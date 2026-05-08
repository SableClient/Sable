import { style } from '@vanilla-extract/css';

export const SmartIcon = style({
  selectors: {
    [`& > *`]: {
      width: '100%',
      aspectRatio: '1',
    },
  },
  width: '100%',
  aspectRatio: '1',
});
