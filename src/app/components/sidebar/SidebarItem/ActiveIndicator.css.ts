import { style } from '@vanilla-extract/css';
import { color, toRem } from 'folds';

export const ActiveIndicator = style({
  position: 'absolute',
  left: 0,
  width: toRem(3),
  height: toRem(16),
  borderRadius: `0 ${toRem(3)} ${toRem(3)} 0`,
  backgroundColor: color.Primary.Main,
  boxShadow: `${toRem(5)} 0 ${toRem(35)} ${toRem(5)} ${color.Primary.Main}`,
  transition: 'top 200ms ease, opacity 200ms ease',
  opacity: 0,
  zIndex: 0,
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
});
