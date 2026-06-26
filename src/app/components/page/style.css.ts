import { style } from '@vanilla-extract/css';
import type { RecipeVariants } from '@vanilla-extract/recipes';
import { recipe } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';

export const PageNav = recipe({
  variants: {
    size: {
      '100%': {
        width: '100%',
      },
      '400': {
        width: toRem(256),
      },
      '300': {
        width: toRem(222),
      },
    },
  },
  defaultVariants: {
    size: '100%',
  },
});
export type PageNavVariants = RecipeVariants<typeof PageNav>;

export const PageNavHeader = recipe({
  base: {
    position: 'relative',
    paddingRight: config.space.S200,
    paddingLeft: config.space.S200,
    flexShrink: 0,
    selectors: {
      'button&': {
        cursor: 'pointer',
      },
      'button&[aria-pressed=true]': {
        backgroundColor: color.Background.ContainerActive,
      },
      'button&:hover, button&:focus-visible': {
        backgroundColor: color.Background.ContainerHover,
      },
      'button&:active': {
        backgroundColor: color.Background.ContainerActive,
      },
      // Extend background into the iOS top safe area so the header color
      // fills the status bar region regardless of which view is active.
      '&::before': {
        content: '""',
        position: 'absolute',
        top: 'calc(-1 * var(--sable-safe-area-top, 0px))',
        left: 0,
        right: 0,
        height: 'var(--sable-safe-area-top, 0px)',
        background: 'inherit',
      },
    },
  },

  variants: {
    outlined: {
      true: {
        borderBottomWidth: config.borderWidth.B300,
      },
    },
  },
  defaultVariants: {
    outlined: true,
  },
});
export type PageNavHeaderVariants = RecipeVariants<typeof PageNavHeader>;

export const PageNavContent = style({
  minHeight: '100%',
  paddingTop: config.space.S200,
  paddingLeft: config.space.S100,
  paddingBottom: `calc(${config.space.S400} + var(--sable-safe-area-bottom, 0px))`,
});

export const PageHeader = recipe({
  base: {
    position: 'relative',
    paddingLeft: config.space.S400,
    paddingRight: config.space.S200,
    selectors: {
      // Extend background into the iOS top safe area so the header color
      // fills the status bar region regardless of which view is active.
      '&::before': {
        content: '""',
        position: 'absolute',
        top: 'calc(-1 * var(--sable-safe-area-top, 0px))',
        left: 0,
        right: 0,
        height: 'var(--sable-safe-area-top, 0px)',
        background: 'inherit',
      },
    },
  },
  variants: {
    balance: {
      true: {
        paddingLeft: config.space.S200,
      },
    },
    outlined: {
      true: {
        borderBottomWidth: config.borderWidth.B300,
      },
    },
  },
  defaultVariants: {
    outlined: true,
  },
});
export type PageHeaderVariants = RecipeVariants<typeof PageHeader>;

export const PageContent = style([
  DefaultReset,
  {
    paddingTop: config.space.S400,
    paddingLeft: config.space.S400,
    paddingBottom: `calc(${toRem(100)} + var(--sable-safe-area-bottom, 0px))`,
  },
]);

export const PageHeroEmpty = style([
  DefaultReset,
  {
    padding: config.space.S400,
    borderRadius: config.radii.R400,
    minHeight: toRem(450),
  },
]);

export const PageHeroSection = style([
  DefaultReset,
  {
    padding: '40px 0',
    maxWidth: toRem(466),
    width: '100%',
    margin: 'auto',
  },
]);

export const PageContentCenter = style([
  DefaultReset,
  {
    maxWidth: toRem(964),
    width: '100%',
    margin: 'auto',
  },
]);
