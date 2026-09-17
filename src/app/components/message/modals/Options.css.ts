import { globalStyle, style } from '@vanilla-extract/css';

export const UserQuickMenuButton = style({
  selectors: {
    '&:not(:hover)': {
      background: 'transparent',
    },
  },
});

export const BusyCursor = style({});

globalStyle(`body.${BusyCursor}, body.${BusyCursor} *`, {
  cursor: 'wait !important',
});
