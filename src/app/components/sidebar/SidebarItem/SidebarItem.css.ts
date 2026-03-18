import { createVar, style } from '@vanilla-extract/css';
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { color, config, DefaultReset, Disabled, toRem } from 'folds';

const DropLineDist = createVar();
export const DropTarget = style({
  vars: {
    [DropLineDist]: toRem(-8),
  },

  selectors: {
    '&[data-inside-folder=true]': {
      vars: {
        [DropLineDist]: toRem(-6),
      },
    },
    '&[data-drop-child=true]': {
      outline: `${config.borderWidth.B700} solid ${color.Success.Main}`,
      borderRadius: config.radii.R400,
    },
    '&[data-drop-above=true]::after, &[data-drop-below=true]::after': {
      content: '',
      display: 'block',
      position: 'absolute',
      left: toRem(0),
      width: '100%',
      height: config.borderWidth.B700,
      backgroundColor: color.Success.Main,
    },
    '&[data-drop-above=true]::after': {
      top: DropLineDist,
    },
    '&[data-drop-below=true]::after': {
      bottom: DropLineDist,
    },
  },
});

export const SidebarItem = recipe({
  base: [
    DefaultReset,
    {
      minWidth: toRem(42),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    Disabled,
    DropTarget,
  ],
  variants: {
    active: {
      true: {},
    },
  },
});
export type SidebarItemVariants = RecipeVariants<typeof SidebarItem>;

export const SidebarItemBadge = recipe({
  base: [
    DefaultReset,
    {
      pointerEvents: 'none',
      position: 'absolute',
      zIndex: 1,
      lineHeight: 0,
      transform: 'translateX(0.375rem)',
    },
  ],
  variants: {
    hasCount: {
      true: {
        top: toRem(-6),
        left: toRem(2),
      },
      false: {
        top: toRem(-2),
        left: toRem(6),
      },
    },
  },
  defaultVariants: {
    hasCount: false,
  },
  compoundVariants: [
    {
      variants: {
        hasCount: true,
      },
      style: {
        selectors: {
          'div:has(> button[data-id])  &': {
            top: toRem(0),
            left: 'auto',
            right: toRem(0),
          },
        },
      },
    },
    {
      variants: {
        hasCount: false,
      },
      style: {
        selectors: {
          'div:has(> button[data-id]) &': {
            top: toRem(2),
            left: 'auto',
            right: toRem(2),
          },
        },
      },
    },
  ],
});
export type SidebarItemBadgeVariants = RecipeVariants<typeof SidebarItemBadge>;
