import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';
import { MOBILE_BREAKPOINT } from '../../hooks/useScreenSize';

export const CallViewContent = style({
  padding: config.space.S400,
  paddingRight: 0,
  minHeight: '100%',
});

export const ControlCard = style({
  padding: config.space.S300,
});

export const PrescreenBox = style({
  '@media': {
    [`(max-width: ${MOBILE_BREAKPOINT}px)`]: {
      padding: `0 ${toRem(8)}`,
    },
  },
});

export const PrescreenGroup = style({
  gap: config.space.S200,
  '@media': {
    [`(max-width: ${MOBILE_BREAKPOINT}px)`]: {
      gap: config.space.S100,
    },
  },
});

export const PrescreenJoinButton = style({
  minWidth: toRem(88),
  '@media': {
    [`(max-width: ${MOBILE_BREAKPOINT}px)`]: {
      minWidth: toRem(48),
      padding: 0,
    },
  },
});

export const ControlDivider = style({
  height: toRem(24),
});

export const CallMemberCard = style({
  padding: config.space.S300,
});

export const PrescreenMessage = style({
  padding: config.space.S200,
});
