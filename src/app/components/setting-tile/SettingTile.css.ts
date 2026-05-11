import { style } from '@vanilla-extract/css';

export const settingTileRoot = style({
  minWidth: 0,
});

export const settingTileTitleRow = style({
  minWidth: 0,
});

const settingLinkActionBase = style({});

export const settingTileSettingLinkActionTransparentBackground = style({
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

export const settingTileSettingLinkAction = style([
  settingLinkActionBase,
  {
    minWidth: 0,
    minHeight: 0,
    width: 'auto',
    height: 'auto',
    padding: 0,
  },
]);

export const settingTileSettingLinkActionDesktopHidden = style([
  settingLinkActionBase,
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

export const settingTileSettingLinkActionMobileVisible = style([
  settingLinkActionBase,
  {
    opacity: 1,
  },
]);
