import { style } from '@vanilla-extract/css';

export const UserQuickMenuButton = style({
  selectors: {
    '&:not(:hover)': {
      background: 'transparent',
    },
  },
});
