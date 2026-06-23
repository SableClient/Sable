import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const Menu = style({
  minWidth: toRem(248),
  padding: config.space.S100,
});

export const Options = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
  padding: config.space.S100,
});

export const OptionContent = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  width: '100%',
});

export const OptionText = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S100,
  minWidth: 0,
  flexGrow: 1,
});

export const OptionCheck = style({
  color: color.Success.Main,
  flexShrink: 0,
});
