import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { color, config, toRem } from 'folds';

export const SidebarAvatar = recipe({
  base: [
    {
      selectors: {
        'button&': {
          cursor: 'pointer',
          outline: 'none',
          transition: 'transform 0.15s ease',
        },
        'button&:hover': {
          transform: 'scale(1.1)',
        },
      },
      '@media': {
        '(prefers-reduced-motion: reduce)': {
          selectors: {
            'button&': {
              transition: 'none',
            },
            'button&:hover': {
              transform: 'none',
            },
          },
        },
      },
    },
  ],
  variants: {
    size: {
      '200': {
        width: toRem(16),
        height: toRem(16),
        fontSize: toRem(10),
        lineHeight: config.lineHeight.T200,
        letterSpacing: config.letterSpacing.T200,
      },
      '300': {
        width: toRem(34),
        height: toRem(34),
      },
      '400': {
        width: toRem(42),
        height: toRem(42),
      },
    },
    ghost: {
      true: {
        selectors: {
          '&:not(:hover)': {
            backgroundColor: 'transparent',
          },
        },
      },
    },
    active: {
      true: {
        backgroundColor: color.Primary.Main,
        color: color.Primary.OnMain,
        selectors: {
          'button&:hover': {
            backgroundColor: color.Primary.MainHover,
          },
        },
      },
    },
  },
  defaultVariants: {
    size: '400',
  },
  compoundVariants: [
    {
      variants: { ghost: true, active: true },
      style: {
        selectors: {
          '&:not(:hover)': {
            backgroundColor: color.Primary.Main,
          },
        },
      },
    },
  ],
});
export type SidebarAvatarVariants = RecipeVariants<typeof SidebarAvatar>;
