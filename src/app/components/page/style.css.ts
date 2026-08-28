import { globalStyle, style } from '@vanilla-extract/css';
import type { RecipeVariants } from '@vanilla-extract/recipes';
import { recipe } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';
import { MOBILE_BREAKPOINT } from '$hooks/useScreenSize';

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

export const PageNavBox = style({
  flexGrow: 0,
  flexShrink: 0,
  '@media': {
    [`(max-width: ${MOBILE_BREAKPOINT}px)`]: {
      flexGrow: 1,
      flexShrink: 1,
    },
  },
});

export const PageNavHeader = recipe({
  base: {
    paddingRight: config.space.S200,
    paddingLeft: config.space.S300,
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
  paddingLeft: config.space.S200,
  paddingBottom: config.space.S700,
});

export const PageHeader = recipe({
  base: {
    paddingLeft: config.space.S400,
    paddingRight: config.space.S200,
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
    paddingBottom: toRem(100),
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

export const SettingsSectionBody = style({
  width: '100%',
  maxWidth: toRem(800),
  marginInline: 'auto',
});

globalStyle(`${SettingsSectionBody} *`, {
  scrollbarWidth: 'none',
});
globalStyle(`${SettingsSectionBody} *::-webkit-scrollbar`, {
  display: 'none',
});

export const SettingsSectionHeader = style({
  paddingLeft: config.space.S300,
  paddingRight: config.space.S200,
});
