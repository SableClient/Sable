import { style } from '@vanilla-extract/css';
import { config } from 'folds';
import { MOBILE_BREAKPOINT } from '$hooks/useScreenSize';

export const Header = style({
  borderBottomColor: 'transparent',
});
export const ActionsBox = style({
  flexGrow: 1,
  flexBasis: 0,
  '@media': {
    [`(max-width: ${MOBILE_BREAKPOINT}px)`]: {
      flexGrow: 0,
      flexBasis: 'auto',
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
