import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

export const HeaderTopic = style({
  ':hover': {
    cursor: 'pointer',
    opacity: config.opacity.P500,
    textDecoration: 'underline',
  },
});

export const BackButtonBadge = style({
  pointerEvents: 'none',
  position: 'absolute',
  zIndex: 1,
  lineHeight: 0,
  top: toRem(2),
  left: toRem(2),
  transform: 'translate(-25%, -25%)',
});
