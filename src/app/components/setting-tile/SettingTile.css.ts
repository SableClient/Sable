import { style } from '@vanilla-extract/css';

export const settingTileRoot = style({
  minWidth: 0,
});

export const settingTileTitleRow = style({
  minWidth: 0,
});

const permalinkActionBase = style({});

export const settingTilePermalinkActionTransparentBackground = style({
  backgroundColor: 'transparent',
  selectors: {
    '&[aria-pressed=true]': {
      backgroundColor: 'transparent',
    },
    '&:hover': {
      backgroundColor: 'transparent',
    },
    '&:focus-visible': {
      backgroundColor: 'transparent',
    },
    '&:active': {
      backgroundColor: 'transparent',
    },
  },
});

export const settingTilePermalinkAction = style([
  permalinkActionBase,
  {
    minWidth: 0,
    minHeight: 0,
    width: 'auto',
    height: 'auto',
    padding: 0,
  },
]);

export const settingTilePermalinkActionDesktopHidden = style([
  permalinkActionBase,
  {
    opacity: 0,
    pointerEvents: 'none',
    selectors: {
      [`${settingTileRoot}:hover &`]: {
        opacity: 1,
        pointerEvents: 'auto',
      },
      [`${settingTileRoot}:focus-within &`]: {
        opacity: 1,
        pointerEvents: 'auto',
      },
    },
  },
]);

export const settingTilePermalinkActionMobileVisible = style([
  permalinkActionBase,
  {
    opacity: 1,
  },
]);
