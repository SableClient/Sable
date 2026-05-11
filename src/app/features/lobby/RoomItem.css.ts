import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

export const RoomItemCard = style({
  paddingLeft: config.space.S400,
  paddingRight: config.space.S400,
  paddingTop: config.space.S300,
  paddingBottom: config.space.S300,
  borderRadius: 0,
  position: 'relative',
  selectors: {
    '&[data-dragging=true]': {
      opacity: config.opacity.Disabled,
    },
  },
});
export const RoomProfileTopic = style({
  cursor: 'pointer',
  ':hover': {
    textDecoration: 'underline',
  },
});
export const ErrorNameContainer = style({
  gap: toRem(2),
});
