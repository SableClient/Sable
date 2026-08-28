import { style } from '@vanilla-extract/css';
import { config } from 'folds';
import { MOBILE_BREAKPOINT } from '$hooks/useScreenSize';

export const Content = style({
  padding: config.space.S600,
  paddingBottom: `max(${config.space.S600}, var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))`,
  gap: config.space.S500,
  '@media': {
    [`(max-width: ${MOBILE_BREAKPOINT}px)`]: {
      padding: config.space.S400,
      paddingBottom: `max(${config.space.S500}, var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))`,
      gap: config.space.S400,
    },
  },
});
