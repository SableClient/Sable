import { style } from '@vanilla-extract/css';
import { config } from 'folds';
import { MOBILE_BREAKPOINT } from '$hooks/useScreenSize';

export const HeaderBalance = style({
  '@media': {
    [`(max-width: ${MOBILE_BREAKPOINT}px)`]: {
      paddingLeft: config.space.S200,
    },
  },
});

export const HeaderTopic = style({
  ':hover': {
    cursor: 'pointer',
    opacity: config.opacity.P500,
    textDecoration: 'underline',
  },
});
