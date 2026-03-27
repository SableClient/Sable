import { style } from '@vanilla-extract/css';
import { config } from 'folds';

export const settingTileRoot = style({
  minWidth: 0,
});

export const settingTileTitleRow = style({
  minWidth: 0,
});

const permalinkActionBase = style({
  transition:
    'opacity 150ms ease, transform 150ms ease, color 150ms ease, background-color 150ms ease',
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
    transform: `translateX(${config.space.S100})`,
    selectors: {
      [`${settingTileRoot}:hover &`]: {
        opacity: 1,
        transform: 'translateX(0)',
        pointerEvents: 'auto',
      },
      [`${settingTileRoot}:focus-within &`]: {
        opacity: 1,
        transform: 'translateX(0)',
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
