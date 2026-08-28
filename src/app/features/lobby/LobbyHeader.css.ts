import { style } from '@vanilla-extract/css';
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
