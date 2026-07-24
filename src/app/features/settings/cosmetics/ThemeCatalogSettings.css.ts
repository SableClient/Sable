import { style } from '@vanilla-extract/css';
import { toRem } from 'folds';

export const themeCardGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: toRem(16),
  width: '100%',
  maxWidth: toRem(760),
  '@media': {
    [`screen and (max-width: ${toRem(700)})`]: {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
});
