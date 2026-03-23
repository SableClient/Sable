import { style } from '@vanilla-extract/css';
import { toRem } from 'folds';

export const StateEvent = style({
  overflowY: 'scroll',
  maxHeight: toRem(96),
});
