import { style } from '@vanilla-extract/css';
import { color, config } from 'folds';

export const CategoryButton = style({
  flexGrow: 1,
});
export const CategoryButtonIcon = style({
  opacity: config.opacity.P400,
});

/**
 * Group DM multi-avatar layout for the nav item's Avatar size="200" (24 px) slot.
 * Three mini avatars are stacked in a triangle: top-centre, bottom-left, bottom-right.
 */
export const GroupAvatarRow = style({
  position: 'relative',
  // Match the Avatar size="200" footprint so layout is not disrupted.
  width: '24px',
  height: '24px',
  flexShrink: 0,
});

export const GroupAvatarMini = style({
  position: 'absolute',
  width: '14px',
  height: '14px',
  border: `1.5px solid ${color.Surface.Container}`,
  borderRadius: '50%',
  overflow: 'hidden',
  selectors: {
    '&:nth-child(1)': {
      top: '0',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 3,
    },
    '&:nth-child(2)': {
      bottom: '0',
      left: '0',
      zIndex: 2,
    },
    '&:nth-child(3)': {
      bottom: '0',
      right: '0',
      zIndex: 1,
    },
  },
});
