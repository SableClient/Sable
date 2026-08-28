import { keyframes, style } from '@vanilla-extract/css';
import { MOBILE_SHEET_DURATION_MS, MOBILE_SHEET_EASING } from './mobileSheetAnimationConstants';

const slideIn = keyframes({
  from: { transform: 'translate3d(0, 100%, 0)' },
  to: { transform: 'translate3d(0, 0, 0)' },
});

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

export const SheetEntrance = style({
  animation: `${slideIn} ${MOBILE_SHEET_DURATION_MS}ms ${MOBILE_SHEET_EASING}`,
  willChange: 'transform',
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animation: 'none',
    },
  },
});

export const BackdropEntrance = style({
  animation: `${fadeIn} 180ms ease-out`,
  willChange: 'opacity',
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animation: 'none',
    },
  },
});
