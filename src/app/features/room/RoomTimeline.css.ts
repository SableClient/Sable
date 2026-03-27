import { globalStyle, style } from '@vanilla-extract/css';
import { RecipeVariants, recipe } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';

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
  overflowY: 'scroll',
  scrollbarGutter: 'stable',

  '@supports': {
    'not selector(::-webkit-scrollbar)': {
      scrollbarWidth: 'auto',
      selectors: {
        '&:hover, &:has(*:hover)': {
          scrollbarColor: `${color.SurfaceVariant.ContainerLine} ${color.SurfaceVariant.ContainerActive}`,
        },
      },
    },
  },

  selectors: {
    '&::-webkit-scrollbar': {
      width: toRem(16),
      height: toRem(16),
    },
    '&::-webkit-scrollbar-corner': {
      backgroundColor: 'transparent',
    },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: 'transparent',
      borderRadius: config.radii.Pill,
      minHeight: toRem(35),
      border: `${toRem(4)} solid transparent`,
      backgroundClip: 'padding-box',
    },
    '&::-webkit-scrollbar-track': {
      backgroundColor: 'transparent',
      borderRadius: config.radii.Pill,
      border: `${toRem(4)} solid transparent`,
      backgroundClip: 'padding-box',
    },
    '&:hover::-webkit-scrollbar-thumb, &:has(*:hover)::-webkit-scrollbar-thumb': {
      backgroundColor: color.SurfaceVariant.ContainerLine,
    },
    '&:hover::-webkit-scrollbar-track, &:has(*:hover)::-webkit-scrollbar-track': {
      backgroundColor: color.SurfaceVariant.ContainerActive,
    },
  },
});
globalStyle(`${messageList} > *`, {
  scrollbarWidth: 'auto',
  scrollbarColor: 'auto',
});

globalStyle(`body ${messageList} > *`, {
  overflowAnchor: 'none',
});

globalStyle(`body ${messageList} [data-message-id]`, {
  overflowAnchor: 'auto',
  transition: 'background-color 0.1s ease-in-out !important',
  position: 'relative',
  zIndex: 1,
});

globalStyle(`body ${messageList} [data-message-id]:hover`, {
  backgroundColor: 'var(--sable-surface-container-hover) !important',
  zIndex: 2,
});

globalStyle(`body ${messageList} [data-message-id]:focus-within`, {
  zIndex: 10,
});
