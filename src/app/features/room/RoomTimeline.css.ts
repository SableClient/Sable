import { globalStyle, style } from '@vanilla-extract/css';
import { type RecipeVariants, recipe } from '@vanilla-extract/recipes';
import { DefaultReset, config } from 'folds';

export const TimelineFloat = recipe({
  base: [
    DefaultReset,
    {
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10,
      minWidth: 'max-content',
    },
  ],
  variants: {
    position: {
      Top: {
        top: config.space.S400,
      },
      Bottom: {
        bottom: config.space.S400,
      },
    },
  },
  defaultVariants: {
    position: 'Top',
  },
});

export type TimelineFloatVariants = RecipeVariants<typeof TimelineFloat>;

export const messageList = style({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
});

globalStyle(`body ${messageList} [data-message-id]`, {
  transition: 'background-color 0.1s ease-in-out !important',
});

globalStyle(`body ${messageList} [data-message-id]:hover`, {
  backgroundColor: 'var(--sable-surface-container-hover) !important',
});
